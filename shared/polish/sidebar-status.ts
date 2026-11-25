import { z } from "zod";

export const SIDEBAR_STATES = ["loading", "running", "needs_input", "failed", "attention", "done"] as const;
export type SidebarStatusState = (typeof SIDEBAR_STATES)[number];
export const SIDEBAR_STATE_LABELS: Record<SidebarStatusState, string> = { loading: "Starting", running: "Working", needs_input: "Needs input", failed: "Failed", attention: "Attention / unread", done: "Idle / done" };
export const SIDEBAR_SPEEDS = { stopped: 0, slow: 3200, medium: 1600, fast: 800 } as const;
export type SidebarStatusSpeed = keyof typeof SIDEBAR_SPEEDS;
const stateSchema = z.strictObject({ color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), speed: z.enum(["stopped", "slow", "medium", "fast"]).optional() });
export const sidebarStatusSchema = z.strictObject({
  style: z.enum(["ring", "paseo"]).optional(),
  states: z.strictObject({ loading: stateSchema.optional(), running: stateSchema.optional(), needs_input: stateSchema.optional(), failed: stateSchema.optional(), attention: stateSchema.optional(), done: stateSchema.optional() }).optional(),
});
export type SidebarStatusSettings = z.output<typeof sidebarStatusSchema>;
export const SIDEBAR_INDICATOR_GEOMETRY = { dot: 6, ring: 12, stroke: 1.5 } as const;
export const sidebarIndicatorLayoutSchema = z.strictObject({ size: z.number().int().min(10).max(24).optional(), alignment: z.enum(["top", "center", "bottom"]).optional() });
export type SidebarIndicatorLayout = z.output<typeof sidebarIndicatorLayoutSchema>;
export function sidebarIndicatorLayout(input?: SidebarIndicatorLayout) {
  return { size: SIDEBAR_INDICATOR_GEOMETRY.ring };
}
export const SIDEBAR_DEFAULT_SPEEDS: Record<SidebarStatusState, SidebarStatusSpeed> = { loading: "fast", running: "fast", needs_input: "slow", failed: "stopped", attention: "slow", done: "stopped" };

export function sidebarStatusOptions(input?: SidebarStatusSettings): { style: "ring" | "paseo"; states: Record<SidebarStatusState, { color?: string; speed: SidebarStatusSpeed }> } {
  const parsed = sidebarStatusSchema.safeParse(input ?? {});
  const value = parsed.success ? parsed.data : {};
  return { style: value.style ?? "ring", states: Object.fromEntries(SIDEBAR_STATES.map((state) => [state, { color: value.states?.[state]?.color, speed: value.states?.[state]?.speed ?? SIDEBAR_DEFAULT_SPEEDS[state] }])) as Record<SidebarStatusState, { color?: string; speed: SidebarStatusSpeed }> };
}
