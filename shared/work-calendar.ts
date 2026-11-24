import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { workId } from "./work-checkpoints";

export const intervalSchema = z.object({ id: z.string(), agentId: workId, workspaceId: z.string().nullable(), provider: z.string(), title: z.string(), turnId: z.string().nullable(), startAt: z.number().nonnegative(), endAt: z.number().nullable(), outcome: z.enum(["running", "completed", "failed", "canceled", "interrupted"]), uncertain: z.boolean() });
export type WorkInterval = z.infer<typeof intervalSchema>;
export const calendarRead = defineRpc({ name: "work.calendar.read", input: z.object({ from: z.number().nonnegative(), to: z.number().nonnegative() }).refine((v) => v.to > v.from && v.to - v.from <= 32 * 86400000, "Choose a range of at most 32 days"), output: z.object({ recordingSince: z.number(), pruned: z.number(), intervals: z.array(intervalSchema).max(20000) }) });

export function clippedInterval(interval: WorkInterval, from: number, to: number, now: number): { start: number; end: number; ms: number } | null {
  if (interval.uncertain) return null;
  const start = Math.max(from, interval.startAt);
  const end = Math.min(to, interval.endAt ?? now, now);
  return end > start ? { start, end, ms: end - start } : null;
}

export function calendarTotals(intervals: readonly WorkInterval[], from: number, to: number, now: number) {
  const spans = intervals.flatMap((value) => { const span = clippedInterval(value, from, to, now); return span ? [span] : []; }).sort((a, b) => a.start - b.start);
  let elapsedMs = 0, end = -Infinity;
  for (const span of spans) { elapsedMs += Math.max(0, span.end - Math.max(span.start, end)); end = Math.max(end, span.end); }
  return { agentMs: spans.reduce((sum, span) => sum + span.ms, 0), elapsedMs };
}

export function calendarRange(date: Date, mode: "day" | "week") {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  if (mode === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start); end.setDate(end.getDate() + (mode === "week" ? 7 : 1));
  return { from: +start, to: +end };
}

export function calendarDays(intervals: readonly WorkInterval[], from: number, to: number, snapshotAt: number) {
  const days: { from: number; to: number; intervals: WorkInterval[] }[] = [];
  for (let cursor = from; cursor < to;) {
    const end = new Date(cursor); end.setDate(end.getDate() + 1); end.setHours(0, 0, 0, 0);
    const until = Math.min(to, +end);
    days.push({ from: cursor, to: until, intervals: intervals.filter((value) => value.startAt < until && (value.endAt ?? snapshotAt) > cursor) });
    cursor = until;
  }
  return days;
}
