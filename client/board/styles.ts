import type { PluginTheme } from "@getpaseo/plugin";
import { isDarkSurface, PRIORITY_YELLOWS } from "../ui/hues";

// How each priority reads and looks; P1 is the most urgent. Every priority is a short bar (PriorityMark), told apart by
// its colour (priorityColor).
export type PriorityMarkKind = "bar" | "dashed";
export const PRIORITY = {
  1: { name: "Urgent", mark: "bar" },
  2: { name: "High", mark: "bar" },
  3: { name: "Medium", mark: "bar" },
  4: { name: "Low", mark: "bar" },
} as const satisfies Record<number, { name: string; mark: PriorityMarkKind }>;

// A task with no priority still gets a mark, a dashed ring, so every card and row has one in the same place.
export const NO_PRIORITY = { name: "No priority", mark: "dashed" } as const;

export function priorityOf(priority: number | null): { name: string; mark: PriorityMarkKind } {
  return priority === 1 || priority === 2 || priority === 3 || priority === 4 ? PRIORITY[priority] : NO_PRIORITY;
}

export function priorityColor(colors: PluginTheme["colors"], priority: number | null): string {
  const yellows = PRIORITY_YELLOWS[isDarkSurface(colors.surface0) ? "dark" : "light"];
  return priority === 1 ? colors.statusDanger : priority === 2 ? yellows.high : priority === 3 ? yellows.medium : colors.foregroundMuted;
}
