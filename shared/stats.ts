// Per-chat stats (tokens, speed, time to first token, cache hits) counted from the provider's own
// session log on the daemon. Counters and formulas after Harness Stats (kogekiplay/paseo-harness-stats,
// MIT, see NOTICE.md): shared/stats.ts at 4e8fae9.
import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { chatToolsSchema } from "./activity";

export const statsSettings = defineSettings({
  id: "stats",
  scope: "host",
  version: 1,
  schema: z.object({ enabled: z.boolean().default(true), desktopStrip: z.boolean().default(false) }),
});
export type StatsSettings = z.infer<typeof statsSettings.schema>;

export const STATS_PROVIDERS = ["claude", "codex"] as const;
export type StatsProvider = (typeof STATS_PROVIDERS)[number];

const count = z.number().nonnegative();

// Numbers only: no text from a log ever reaches the app. `inputTokens` includes cache reads and
// writes for both providers.
export const sessionCountersSchema = z.object({
  turns: count,
  steps: count,
  inputTokens: count,
  cachedTokens: count,
  cacheWriteTokens: count,
  outputTokens: count,
  timedOutputTokens: count,
  modelMs: count,
  toolMs: count,
  ttftMs: count,
  ttftSteps: z.number().int().nonnegative(),
});
export type SessionCounters = z.infer<typeof sessionCountersSchema>;

export function emptyCounters(): SessionCounters {
  return { turns: 0, steps: 0, inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, timedOutputTokens: 0, modelMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0 };
}

// The most recent turns a reading carries; older ones are dropped first.
export const TURNS_KEPT = 200;

// What one turn added to the counters: from the line that opened it (`startAt`, ms) to its last counted line
// (`endAt`). `turn` numbers turns as `turns` counts them, from 1.
export const turnReadingSchema = z.object({
  turn: z.number().int().positive(),
  startAt: count,
  endAt: count,
  steps: count,
  inputTokens: count,
  cachedTokens: count,
  cacheWriteTokens: count,
  outputTokens: count,
  modelMs: count,
  toolMs: count,
});
export type TurnReading = z.infer<typeof turnReadingSchema>;

export const statsReadResultSchema = z.discriminatedUnion("status", [
  // `partial`: the log was longer than one read takes; the next read continues where this one stopped.
  // `turns`: oldest first; missing from a daemon older than Morphise 0.38.
  z.object({ status: z.literal("ready"), provider: z.enum(STATS_PROVIDERS), partial: z.boolean(), stats: sessionCountersSchema, tools: chatToolsSchema, turns: z.array(turnReadingSchema).max(TURNS_KEPT).optional() }),
  // No log to read: no session id yet, no file yet, or a provider without a log Morphise reads.
  z.object({ status: z.literal("unavailable"), reason: z.string() }),
  // A log that exists but cannot be read or understood.
  z.object({ status: z.literal("error"), error: z.string() }),
]);
export type StatsReadResult = z.output<typeof statsReadResultSchema>;

// `turns`: also send the per-turn readings (only the Stats panel shows them, so the pills' 2 s polls stay small).
export const statsRead = defineRpc({ name: "morphise.stats.read", input: z.object({ agentId: z.string().min(1).max(200), turns: z.boolean().optional() }), output: statsReadResultSchema });

export function totalTokens(stats: Pick<SessionCounters, "inputTokens" | "outputTokens">): number {
  return stats.inputTokens + stats.outputTokens;
}

/** Input neither read from nor written to the cache. */
export function uncachedInput(stats: Pick<SessionCounters, "inputTokens" | "cachedTokens" | "cacheWriteTokens">): number {
  return Math.max(0, stats.inputTokens - stats.cachedTokens - stats.cacheWriteTokens);
}

/** Output tokens per second over the steps whose model time was measured; null without any. */
export function outputSpeed(stats: SessionCounters): number | null {
  return stats.modelMs > 0 && stats.timedOutputTokens > 0 ? (stats.timedOutputTokens * 1000) / stats.modelMs : null;
}

/** Average time to first token in ms; null when no step had one. */
export function timeToFirstToken(stats: SessionCounters): number | null {
  return stats.ttftSteps > 0 ? stats.ttftMs / stats.ttftSteps : null;
}

/** Share of input read from the cache, 0 to 1; null without input. */
export function cacheHitShare(stats: Pick<SessionCounters, "inputTokens" | "cachedTokens">): number | null {
  return stats.inputTokens > 0 ? Math.min(1, stats.cachedTokens / stats.inputTokens) : null;
}
