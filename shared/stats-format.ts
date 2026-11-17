import type { ChatTools } from "./activity";
import { cacheHitShare, outputSpeed, type SessionCounters, type StatsReadResult, timeToFirstToken, totalTokens, uncachedInput } from "./stats";

// How the session stats read in the pills, popovers, panel and details pane. A reading the log cannot give is "-".

export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatSpeed(tokensPerSecond: number | null): string {
  return tokensPerSecond === null ? "-" : `${Math.round(tokensPerSecond)} t/s`;
}

// A share just under 1 reads 99.9%, so only a full cache hit reads 100%.
export function formatShare(share: number | null): string {
  if (share === null) return "-";
  if (share >= 1) return "100%";
  return `${Math.min(Math.floor(share * 1000) / 10, 99.9)}%`;
}

export type Row = readonly [label: string, value: string];

export function activityRows(stats: SessionCounters): Row[] {
  return [
    ["Turns", String(stats.turns)],
    ["Model steps", String(stats.steps)],
    ["Model time", formatDuration(stats.modelMs || null)],
    ["Tool time", formatDuration(stats.toolMs || null)],
    ["Time to first token", formatDuration(timeToFirstToken(stats))],
    ["Output speed", formatSpeed(outputSpeed(stats))],
  ];
}

export function usageRows(stats: SessionCounters): Row[] {
  return [
    ["Total tokens", formatTokens(totalTokens(stats))],
    ["Cache hit", formatShare(cacheHitShare(stats))],
    ["Uncached input", formatTokens(uncachedInput(stats))],
    ["Cache read", formatTokens(stats.cachedTokens)],
    ...(stats.cacheWriteTokens > 0 ? [["Cache write", formatTokens(stats.cacheWriteTokens)] as const] : []),
    ["Output", formatTokens(stats.outputTokens)],
  ];
}

// What the chat did with tools (Activity by koinzhang, MIT, see NOTICE.md): counts from its log.
export function toolsRows(tools: ChatTools): Row[] {
  return [
    ["Prompts", String(tools.prompts)],
    ["Skills", String(tools.skillCalls)],
    ["MCP", tools.mcpFailures ? `${tools.mcpCalls} (${tools.mcpFailures} failed)` : String(tools.mcpCalls)],
    ["Shell", String(tools.shellCalls)],
    ["File reads", String(tools.fileReads)],
    ["File writes", String(tools.fileWrites)],
    ["Tools explored", String(tools.toolsExplored)],
  ];
}

// What a pill says: the reading at a glance, or why there is none.
export function pillLabel(kind: "activity" | "usage", result: StatsReadResult | null): string {
  if (!result) return "…";
  if (result.status === "error") return "Log unreadable";
  if (result.status === "unavailable") return "No stats";
  const { stats } = result;
  return kind === "activity" ? `${stats.steps} steps · ${formatSpeed(outputSpeed(stats))}` : `${formatTokens(totalTokens(stats))} · ${formatShare(cacheHitShare(stats))} cached`;
}


// The strip under the message box: both pills' readings in one line, or why there is none.
export function stripText(result: StatsReadResult | null): string {
  if (!result || result.status !== "ready") return pillLabel("usage", result);
  return `${pillLabel("activity", result)}   ${pillLabel("usage", result)}`;
}

// The chat a message box belongs to, from Paseo's selected tab (data-testid "workspace-tab-agent_<id>"); null otherwise.
export function agentIdFromTab(testId: string | null | undefined): string | null {
  const prefix = "workspace-tab-agent_";
  return testId?.startsWith(prefix) ? testId.slice(prefix.length) || null : null;
}

// The top bar's stats button: the open chat's total tokens and cache hit at a glance, else just "Stats".
export function headerLabel(result: StatsReadResult | null): string {
  if (!result || result.status !== "ready") return "Stats";
  return `${formatTokens(totalTokens(result.stats))} · ${formatShare(cacheHitShare(result.stats))}`;
}

// How the cache hit reads: most input from the cache is good, half or more is fair, less is poor (paying for new input).
export function cacheHitTone(share: number): "good" | "fair" | "poor" {
  return share >= 0.8 ? "good" : share >= 0.5 ? "fair" : "poor";
}
