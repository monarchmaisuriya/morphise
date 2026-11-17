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

// The excerpt found for each agent, for the current search; empty while the switch is off or the search is empty.
export function useConversationHits(client: PluginClientContext, agents: readonly BoardAgent[], search: string, on: boolean, fieldsMatch: (agent: BoardAgent) => boolean): ReadonlyMap<string, string> {
  const [hits, setHits] = useState<ReadonlyMap<string, string>>(new Map());
  const query = search.trim();
  const wanted = on && query ? agents.filter((agent) => !fieldsMatch(agent)).map((agent) => agent.id) : [];
  const key = JSON.stringify([query, wanted]);
  useEffect(() => {
    setHits(new Map());
    if (!wanted.length) return;
    let alive = true;
    const queue = [...wanted];
    const searchOne = async (agentId: string) => {
      let cursor: ConversationCursor | undefined;
      for (let page = 0; page < MAX_PAGES && alive; page++) {
        const result = await client.rpc(conversationSearch, { agentId, query, ...(cursor ? { cursor } : {}) });
        if (!alive) return;
        if (result.match) return setHits((current) => new Map(current).set(agentId, result.match as string));
        if (result.unavailable || !result.nextCursor) return;
        cursor = result.nextCursor;
      }
    };
    const worker = async () => {
      while (alive && queue.length) {
        const agentId = queue.shift() as string;
        await searchOne(agentId).catch((error: unknown) => console.warn(`[morphise] Could not search ${agentId}'s conversation`, error));
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
  return hits;
}
