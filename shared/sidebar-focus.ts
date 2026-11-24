import { z } from "zod";
import { INDICATORS, type Indicator } from "./profile";
import { formatElapsed } from "./time-text";

export const FOCUS_TABS = ["all", "active", "asking"] as const;
export type FocusTab = typeof FOCUS_TABS[number];
const states = z.array(z.enum(INDICATORS)).min(1).max(5).refine((values) => new Set(values).size === values.length, "Choose each state once");
const tab = (label: string, defaults: Indicator[]) => z.object({ enabled: z.boolean().default(true), label: z.string().trim().min(1).max(24).default(label), states: states.default(defaults) }).prefault({});
export const focusTabsSchema = z.object({ all: tab("All", [...INDICATORS]), active: tab("Active", ["running"]), asking: tab("Asking", ["needs_input", "failed"]) }).prefault({});
export type FocusTabs = z.infer<typeof focusTabsSchema>;
interface FocusState { focusTabsEnabled: boolean; focusTab: FocusTab; focusTabs: FocusTabs; }
export function focusSelection(state: FocusState): FocusTab {
  return !state.focusTabsEnabled ? "all" : state.focusTabs[state.focusTab].enabled ? state.focusTab : FOCUS_TABS.find((key) => state.focusTabs[key].enabled) ?? "all";
}
export function focusStatuses(state: FocusState): Indicator[] {
  const selected = focusSelection(state);
  return selected === "all" ? [] : state.focusTabs[selected].states;
}
export function sidebarSummary(states: readonly Indicator[]) {
  return { total: states.length, running: states.filter((value) => value === "running").length, asking: states.filter((value) => value === "needs_input" || value === "failed").length, unread: states.filter((value) => value === "attention").length };
}
export function semanticLine(indicator: Indicator, reason: string | null, checkpoint: { blocked: string; verified: string } | null): { text: string; tone: "warning" | "danger" | "muted" } | null {
  if (indicator === "needs_input") return { text: `Permission needed${reason ? ` · ${reason}` : ""}`, tone: "warning" };
  if (indicator === "failed") return { text: `Failed${reason ? ` · ${reason}` : ""}`, tone: "danger" };
  if (indicator === "running") return null;
  if (checkpoint?.blocked.trim()) return { text: `Checkpoint blocker · ${checkpoint.blocked.trim()}`, tone: "warning" };
  if (checkpoint?.verified.trim()) return { text: `Checkpoint · ${checkpoint.verified.trim()}`, tone: "muted" };
  return indicator === "attention" ? { text: "New result to review", tone: "muted" } : null;
}
export function sidebarTime(indicator: Indicator, enteredAt: string | null, activity: string | null | readonly (string | null)[], now: Date, stateTime: boolean) {
  const valid = (value: string | null) => value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) <= +now;
  const genuineState = stateTime && valid(enteredAt);
  const candidates = typeof activity === "string" || activity === null ? [activity] : activity;
  const source = genuineState ? enteredAt : candidates.find(valid) ?? null;
  if (!source) return null;
  const elapsed = formatElapsed(source, now);
  return elapsed;
}
