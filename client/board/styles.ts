import type { PluginTheme } from "@getpaseo/plugin";

// How each priority reads and looks; P1 is the most urgent. Every priority is the same flag, told apart by its colour
// (priorityColor) and name.
export const PRIORITY = {
  1: { name: "Urgent", icon: "Flag" },
  2: { name: "High", icon: "Flag" },
  3: { name: "Medium", icon: "Flag" },
  4: { name: "Low", icon: "Flag" },
} as const;

// A task with no priority still gets a mark, so every card and row has one in the same place.
export const NO_PRIORITY = { name: "No priority", icon: "FlagOff" } as const;

export function priorityOf(priority: number | null): { name: string; icon: string } {
  return priority === 1 || priority === 2 || priority === 3 || priority === 4 ? PRIORITY[priority] : NO_PRIORITY;
}

export function priorityColor(colors: PluginTheme["colors"], priority: number | null): string {
  return priority === 1 ? colors.statusDanger : priority === 2 ? colors.statusWarning : priority === 3 ? colors.accent : colors.foregroundMuted;
}
