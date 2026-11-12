// What the turn recap says about the turn itself: the model, thinking level, duration and token use Paseo reported.

export interface TurnDetails {
  model: string | null;
  thinking: string | null;
  usage: { input: number | null; cached: number | null; output: number | null; cost: number | null } | null;
}

const tokenCount = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : String(count));

export const duration = (seconds: number) => (seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`);

/** "claude-opus-5-5 · high · 38m 34s · 12k in (9.1k cached) · 3.2k out · $0.42"; null for a recap made before details existed. */
export function turnDetailsLine(recap: { seconds: number | null; details?: TurnDetails | null }): string | null {
  const details = recap.details;
  if (!details) return null;
  const usage = details.usage;
  const parts = [
    details.model,
    details.thinking,
    recap.seconds !== null ? duration(recap.seconds) : null,
    usage?.input != null ? `${tokenCount(usage.input)} in${usage.cached ? ` (${tokenCount(usage.cached)} cached)` : ""}` : null,
    usage?.output != null ? `${tokenCount(usage.output)} out` : null,
    usage?.cost != null ? `$${usage.cost.toFixed(2)}` : null,
  ].filter((part): part is string => !!part);
  return parts.length ? parts.join(" · ") : null;
}
