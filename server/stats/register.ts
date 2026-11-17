import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkAgentId } from "../../shared/agent-actions";
import { type ConversationSearchInput, type ConversationSearchPage, conversationSearch } from "../../shared/conversation-search";
import { type StatsReadResult, statsRead, statsSettings } from "../../shared/stats";
import { DEFAULT_SEARCH_LIMITS, type SearchLimits, searchLog } from "./messages";
import { SessionReader } from "./sessions";
import { watchSettings } from "../settings-watch";
import { statsWatch } from "../../shared/watch";

// The part of Paseo's agent snapshot the readers need.
export interface StatsAgent {
  provider: string;
  cwd: string;
  persistence?: { sessionId: string; nativeHandle?: string } | null;
  runtimeInfo?: { sessionId: string | null };
}

// Only `refresh()` (fetch_agent) is used: `reload()` and every timeline call resume a stored agent.
export interface StatsPaseo {
  agents: { ref(agentId: string): { refresh(): Promise<{ agent: StatsAgent } | null> } };
}

// Plugin RPCs die at 30 s; the refresh and the read together stay under 20 s.
const REFRESH_TIMEOUT_MS = 4_000;

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const GONE = "The agent is no longer on this daemon";

export function createStatsHandlers(reader: SessionReader, searchLimits: SearchLimits = DEFAULT_SEARCH_LIMITS) {
  // The chat's log file, from Paseo's own record of the agent; the session id never comes from the app.
  async function findLog(agentId: string, paseo: StatsPaseo) {
    const problem = checkAgentId(agentId);
    if (problem) throw new Error(problem);
    const result = await withTimeout(paseo.agents.ref(agentId).refresh(), REFRESH_TIMEOUT_MS, "Paseo did not return the agent in time");
    if (!result) return { kind: "unavailable" as const, reason: GONE };
    const { agent } = result;
    const sessionId = agent.persistence?.nativeHandle || agent.persistence?.sessionId || agent.runtimeInfo?.sessionId || null;
    return { ...(await reader.findLog(agent.provider, sessionId, agent.cwd)), sessionId, cwd: agent.cwd };
  }

  return {
    async read({ agentId, turns }: { agentId: string; turns?: boolean }, paseo: StatsPaseo): Promise<StatsReadResult> {
      console.log(`[morphise] stats ${agentId}`);
      try {
        const log = await findLog(agentId, paseo);
        if (log.kind === "unavailable") return { status: "unavailable", reason: log.reason };
        const read = await reader.read(log.provider, log.sessionId, log.cwd);
        return read.kind === "ready" ? { status: "ready", provider: read.provider, partial: read.partial, stats: read.stats, tools: read.tools, ...(turns ? { turns: read.turns } : {}) } : { status: "unavailable", reason: read.reason };
      } catch (error) {
        return { status: "error", error: error instanceof Error ? error.message : String(error) };
      }
    },
    async search({ agentId, query, cursor }: ConversationSearchInput, paseo: StatsPaseo): Promise<ConversationSearchPage> {
      console.log(`[morphise] search ${agentId}`);
      const log = await findLog(agentId, paseo);
      if (log.kind === "unavailable") return { match: null, nextCursor: null, unavailable: log.reason };
      return { ...(await searchLog(log.path, log.provider, query, cursor, searchLimits)), unavailable: null };
    },
  };
}

// Stats (Settings, Chat, Stats) and conversation search on the Agents view, both read from the
// provider's session log. Returns the cleanup, which drops the cached counters.
export function registerStats(server: PluginServerContext): () => void {
  const settings = server.registerSettings(statsSettings);
  server.handle(statsWatch, watchSettings(settings));
  const reader = new SessionReader();
  const handlers = createStatsHandlers(reader);
  server.handle(statsRead, (input, { paseo }) => handlers.read(input, paseo));
  server.handle(conversationSearch, (input, { paseo }) => handlers.search(input, paseo));
  return () => reader.clear();
}
