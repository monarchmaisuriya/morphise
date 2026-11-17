// The session stats readings the app holds: one read in flight per chat, whoever asks, and the last reading of at most
// 200 chats (least recently read dropped first), so a chat shows its numbers at once when its message box returns.
// After Harness Stats' client/cache.ts by kogekiplay (MIT, see NOTICE.md).
import type { StatsReadResult } from "../../shared/stats";

const LIMIT = 200;

// A reading with per-turn numbers (`turns`, the Stats panel's) is kept apart from the lighter one everything else polls.
export function createStatsCache(fetch: (agentId: string, turns: boolean) => Promise<StatsReadResult>) {
  const last = new Map<string, StatsReadResult>();
  const inFlight = new Map<string, Promise<StatsReadResult>>();
  const keyOf = (agentId: string, turns: boolean) => (turns ? `${agentId}\u0000turns` : agentId);
  const read = (agentId: string, turns = false): Promise<StatsReadResult> => {
    const key = keyOf(agentId, turns);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const next = fetch(agentId, turns)
      .then((result) => {
        last.delete(key);
        last.set(key, result);
        if (last.size > LIMIT) last.delete(last.keys().next().value as string);
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, next);
    return next;
  };
  return { read, peek: (agentId: string, turns = false) => last.get(keyOf(agentId, turns)) };
}
