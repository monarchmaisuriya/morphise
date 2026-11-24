import { expect, it } from "vitest";
import { viewStateSettings } from "./view-state";
import { focusSelection, focusStatuses, sidebarTime, sidebarSummary, semanticLine } from "./sidebar-focus";
import { performance } from "node:perf_hooks";

it("replaces legacy status filters with default and configurable focus tabs", () => {
  const state = viewStateSettings.schema.parse({ statusFilter: ["done"], hideDone: true });
  expect(focusStatuses(state)).toEqual([]);
  expect(focusStatuses({ ...state, focusTab: "active" })).toEqual(["running"]);
  expect(focusStatuses({ ...state, focusTab: "asking" })).toEqual(["needs_input", "failed"]);
});

it("skips unusable enriched activity before a valid prompt without borrowing creation after a recorded prompt", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  expect(sidebarTime("running", null, ["invalid", "2026-11-24T10:00:00Z"], now, true)).toBe("2h");
  expect(sidebarTime("running", null, ["2026-11-25T12:00:00Z", "2026-11-24T10:00:00Z"], now, true)).toBe("2h");
});

it("falls back to a visible tab or unfiltered All when tabs are hidden", () => {
  const state = viewStateSettings.schema.parse({ focusTab: "active", focusTabs: { active: { enabled: false } } });
  expect(focusSelection(state)).toBe("all");
  expect(focusStatuses({ ...state, focusTabsEnabled: false })).toEqual([]);
});

it("uses customized membership and shows All when every tab is hidden", () => {
  const custom = viewStateSettings.schema.parse({ focusTab: "active", focusTabs: { active: { label: "Recent results", states: ["attention", "running"] } } });
  expect(focusStatuses(custom)).toEqual(["attention", "running"]);
  const hidden = viewStateSettings.schema.parse({ focusTab: "asking", focusTabs: { all: { enabled: false }, active: { enabled: false }, asking: { enabled: false } } });
  expect(focusSelection(hidden)).toBe("all");
  expect(focusStatuses(hidden)).toEqual([]);
});

it("rejects blank or overlong labels, duplicate states and empty memberships", () => {
  expect(viewStateSettings.schema.safeParse({ focusTabs: { active: { label: " " } } }).success).toBe(false);
  expect(viewStateSettings.schema.safeParse({ focusTabs: { asking: { label: "1234567890123456789012345" } } }).success).toBe(false);
  expect(viewStateSettings.schema.safeParse({ focusTabs: { active: { states: [] } } }).success).toBe(false);
  expect(viewStateSettings.schema.safeParse({ focusTabs: { asking: { states: ["failed", "failed"] } } }).success).toBe(false);
});

it("counts states without merging unread results into requests for input", () => {
  expect(sidebarSummary(["running", "failed", "needs_input", "attention", "done"])).toEqual({ total: 5, running: 1, asking: 2, unread: 1 });
});

it("counts a 500-item scope without a network dependency within the local 50ms budget", () => {
  const states = Array<"running">(500).fill("running");
  const start = performance.now();
  expect(sidebarSummary(states)).toEqual({ total: 500, running: 500, asking: 0, unread: 0 });
  expect(performance.now() - start).toBeLessThan(50);
});

it("uses meaningful reasons and labelled checkpoint results instead of repeated titles", () => {
  expect(semanticLine("needs_input", "Allow tests", null)).toEqual({ text: "Permission needed · Allow tests", tone: "warning" });
  expect(semanticLine("done", null, { blocked: "", verified: "Tests pass" })).toEqual({ text: "Checkpoint · Tests pass", tone: "muted" });
  expect(semanticLine("running", null, { blocked: "Old blocker", verified: "Old tests" })).toBeNull();
  expect(semanticLine("done", null, null)).toBeNull();
  expect(semanticLine("attention", null, null)).toEqual({ text: "New result to review", tone: "muted" });
});

it("labels genuine status time separately from activity and refuses invalid or future times", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  expect(sidebarTime("needs_input", "2026-11-24T11:48:00Z", "2026-11-24T10:00:00Z", now, true)).toBe("Waiting 12m");
  expect(sidebarTime("running", null, "2026-11-24T10:00:00Z", now, true)).toBe("2h");
  expect(sidebarTime("done", null, "2026-11-24T10:00:00Z", now, false)).toBe("Active 2h ago");
  expect(sidebarTime("done", null, "invalid", now, false)).toBeNull();
  expect(sidebarTime("done", null, "2026-11-25T10:00:00Z", now, false)).toBeNull();
  expect(sidebarTime("running", "invalid", "2026-11-24T10:00:00Z", now, true)).toBe("2h");
});
