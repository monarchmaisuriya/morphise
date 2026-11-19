// "Search conversations" on the Agents view: for each agent whose own fields do not hold every search word, the daemon
// reads its Claude Code or Codex log page by page (never Paseo's timeline, which would resume a finished agent) and
// returns the first message that holds them. Matching rules from Better Paseo by RoundRedDot (MIT, see NOTICE.md).
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import type { BoardAgent } from "../../shared/agents-board";
import { type ConversationCursor, conversationSearch } from "../../shared/conversation-search";

const DEBOUNCE_MS = 200;
// Two agents' logs at a time; each call reads at most 8 MB, and an agent stops at its first match or after this many.
const AT_ONCE = 2;
const MAX_PAGES = 50;

interface ConversationHits {
  hits: ReadonlyMap<string, string>;
  pending: number;
  problems: readonly string[];
}

// Outcomes belong to a query and its target set, including the render before effect cleanup.
export function useConversationHits(client: PluginClientContext, agents: readonly BoardAgent[], search: string, on: boolean, fieldsMatch: (agent: BoardAgent) => boolean): ConversationHits {
  const [state, setState] = useState<ConversationHits & { key: string }>({ key: "", hits: new Map(), pending: 0, problems: [] });
  const query = search.trim();
  const invalid = on && query.length > 1000;
  const wanted = on && query && !invalid ? agents.filter((agent) => !fieldsMatch(agent)).map((agent) => agent.id) : [];
  const key = JSON.stringify([on, query, wanted]);
  useEffect(() => {
    setState({ key, hits: new Map(), pending: wanted.length, problems: invalid ? ["Search must be 1000 characters or fewer"] : [] });
    if (!wanted.length) return;
    let alive = true;
    const queue = [...wanted];
    const problem = (text: string) => {
      if (alive) setState((current) => ({ ...current, problems: [...new Set([...current.problems, text])] }));
    };
    const searchOne = async (agentId: string) => {
      let cursor: ConversationCursor | undefined;
      for (let page = 0; page < MAX_PAGES && alive; page++) {
        const result = await client.rpc(conversationSearch, { agentId, query, ...(cursor ? { cursor } : {}) });
        if (!alive) return;
        if (result.match) return setState((current) => ({ ...current, hits: new Map(current.hits).set(agentId, result.match as string) }));
        if (result.unavailable) return problem(result.unavailable);
        if (!result.nextCursor) return;
        cursor = result.nextCursor;
      }
      problem("Some conversations reached the search limit; results may be incomplete");
    };
    const worker = async () => {
      while (alive && queue.length) {
        const agentId = queue.shift() as string;
        try {
          await searchOne(agentId);
        } catch (error) {
          problem(error instanceof Error ? error.message : String(error));
        } finally {
          if (alive) setState((current) => ({ ...current, pending: current.pending - 1 }));
        }
      }
    };
    const timer = setTimeout(() => {
      for (let index = 0; index < AT_ONCE; index++) void worker();
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `key` holds the query and the agents to search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  return state.key === key ? state : { hits: new Map(), pending: wanted.length, problems: invalid ? ["Search must be 1000 characters or fewer"] : [] };
}
