import type { PluginTheme } from "@getpaseo/plugin";
import { BLUE } from "../ui/hues";

// How each priority reads and looks; P1 is the most urgent. Every priority is a dot (PriorityMark), told apart by its
// colour (priorityColor) and fill: solid for Urgent, High and Medium, hollow for Low.
export type PriorityMarkKind = "solid" | "hollow" | "dashed";
export const PRIORITY = {
  1: { name: "Urgent", mark: "solid" },
  2: { name: "High", mark: "solid" },
  3: { name: "Medium", mark: "solid" },
  4: { name: "Low", mark: "hollow" },
} as const satisfies Record<number, { name: string; mark: PriorityMarkKind }>;

// A task with no priority still gets a mark, a dashed ring, so every card and row has one in the same place.
export const NO_PRIORITY = { name: "No priority", mark: "dashed" } as const;

export function priorityOf(priority: number | null): { name: string; mark: PriorityMarkKind } {
  return priority === 1 || priority === 2 || priority === 3 || priority === 4 ? PRIORITY[priority] : NO_PRIORITY;
}

export function priorityColor(colors: PluginTheme["colors"], priority: number | null): string {
  return priority === 1 ? colors.statusDanger : priority === 2 ? colors.statusWarning : priority === 3 ? BLUE : colors.foregroundMuted;
}
