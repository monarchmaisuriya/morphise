// The session stats readings the app holds: one read in flight per chat, whoever asks, and the last reading of at most
// 200 chats (least recently read dropped first), so a chat shows its numbers at once when its message box returns.
// After Harness Stats' client/cache.ts by kogekiplay (MIT, see NOTICE.md).
import type { StatsReadResult } from "../../shared/stats";

const LIMIT = 200;

export function createStatsCache(fetch: (agentId: string) => Promise<StatsReadResult>) {
  const last = new Map<string, StatsReadResult>();
  const inFlight = new Map<string, Promise<StatsReadResult>>();
  const read = (agentId: string): Promise<StatsReadResult> => {
    const pending = inFlight.get(agentId);
    if (pending) return pending;
    const next = fetch(agentId)
      .then((result) => {
        last.delete(agentId);
        last.set(agentId, result);
        if (last.size > LIMIT) last.delete(last.keys().next().value as string);
        return result;
      })
      .finally(() => inFlight.delete(agentId));
    inFlight.set(agentId, next);
    return next;
  };
  return { read, peek: (agentId: string) => last.get(agentId) };
}
