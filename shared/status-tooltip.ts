import type { Indicator } from "./profile";
import { STATUS_TITLES } from "./arrange";

const MEANING: Record<Indicator, string> = { running: "Agent is working", needs_input: "Waiting for your input or permission", failed: "Work failed", attention: "Finished work needs review", done: "No active work reported" };
export function statusTooltip(indicator: Indicator, reason: string | null | undefined, enteredAt: string | null | undefined, now: number) {
  const at = enteredAt ? Date.parse(enteredAt) : NaN;
  const minutes = Math.floor((now - at) / 60000);
  const elapsed = Number.isFinite(at) && at <= now ? minutes < 1 ? "less than a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min` : "unavailable";
  return `${STATUS_TITLES[indicator]} · ${reason?.trim() || MEANING[indicator]} · Time in state: ${elapsed}`;
}
