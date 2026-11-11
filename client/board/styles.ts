import type { PluginTheme } from "@getpaseo/plugin";

// How each priority reads and looks; P1 is the most urgent.
export const PRIORITY = {
  1: { name: "Urgent", icon: "CircleAlert" },
  2: { name: "High", icon: "SignalHigh" },
  3: { name: "Medium", icon: "SignalMedium" },
  4: { name: "Low", icon: "SignalLow" },
} as const;

export function priorityColor(colors: PluginTheme["colors"], priority: number | null): string {
  return priority === 1 ? colors.statusDanger : priority === 2 ? colors.statusWarning : priority === 3 ? colors.accent : colors.foregroundMuted;
}
