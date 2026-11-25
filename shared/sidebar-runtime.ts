import type { WorkInterval } from "./work-calendar";

export const RUNTIME_HOUR = 3600000;
export function recordedRuntimeText(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ""}` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
export function workspaceRuntime(intervals: readonly WorkInterval[], to: number) {
  const from = to - 24 * RUNTIME_HOUR;
  const workspaces = new Map<string, { bins: number[]; uncertain: boolean; total: number }>();
  for (const interval of intervals) {
    if (!interval.workspaceId) continue;
    const end = Math.min(interval.endAt ?? to, to), start = Math.max(interval.startAt, from);
    if (end < from || interval.startAt >= to) continue;
    let value = workspaces.get(interval.workspaceId);
    if (!value) { value = { bins: Array<number>(24).fill(0), uncertain: false, total: 0 }; workspaces.set(interval.workspaceId, value); }
    if (interval.uncertain) { value.uncertain = true; continue; }
    if (end <= start) continue;
    for (let index = Math.max(0, Math.floor((start - from) / RUNTIME_HOUR)); index < 24; index++) {
      const binStart = from + index * RUNTIME_HOUR;
      if (binStart >= end) break;
      const ms = Math.max(0, Math.min(end, binStart + RUNTIME_HOUR) - Math.max(start, binStart));
      value.bins[index]! += ms; value.total += ms;
    }
  }
  return workspaces;
}

export function runtimePoints(bins: readonly number[], width = 64, height = 16) {
  const max = Math.max(1, ...bins);
  return bins.map((value, index) => ({ x: index * width / Math.max(1, bins.length - 1), y: height - 1 - value / max * (height - 2) }));
}
