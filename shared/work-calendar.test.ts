import { expect, it } from "vitest";
import { calendarDays, calendarRange, calendarTotals, calendarTitle, type WorkInterval } from "./work-calendar";

it("resolves placeholder calendar names without overwriting meaningful recorded titles", () => {
  expect(calendarTitle({ title: "Untitled agent", provider: "fake" }, "Current chat name", "Workspace")).toBe("Current chat name");
  expect(calendarTitle({ title: "Untitled agent", provider: "fake" }, null, "Workspace")).toBe("Workspace");
  expect(calendarTitle({ title: " ", provider: "fake" })).toBe("fake session");
  expect(calendarTitle({ title: "Recorded task", provider: "fake" }, "Renamed chat", "Workspace")).toBe("Recorded task");
});

it("counts parallel agent time separately from elapsed covered time", () => {
  const base: WorkInterval = { id: "a", agentId: "a", workspaceId: "w", provider: "fake", title: "Task", turnId: "turn", startAt: 100, endAt: 300, outcome: "completed", uncertain: false };
  expect(calendarTotals([base, { ...base, id: "b", startAt: 200, endAt: 400 }], 0, 1000, 1000)).toEqual({ agentMs: 400, elapsedMs: 300 });
});

it("groups a cross-midnight interval into both local day sections without duplicating its duration", () => {
  const before = process.env.TZ; process.env.TZ = "UTC";
  try {
    const interval: WorkInterval = { id: "a", agentId: "a", workspaceId: "w", provider: "fake", title: "Task", turnId: "turn", startAt: Date.parse("2026-11-24T23:30:00Z"), endAt: Date.parse("2026-11-25T00:30:00Z"), outcome: "completed", uncertain: false };
    const days = calendarDays([interval], Date.parse("2026-11-24T00:00:00Z"), Date.parse("2026-11-26T00:00:00Z"), Date.parse("2026-11-26T00:00:00Z"));
    expect(days.map((value) => value.intervals.length)).toEqual([1, 1]);
    expect(calendarTotals(days[0]!.intervals, days[0]!.from, days[0]!.to, Date.parse("2026-11-26T00:00:00Z")).agentMs).toBe(1800000);
    expect(calendarTotals(days[1]!.intervals, days[1]!.from, days[1]!.to, Date.parse("2026-11-26T00:00:00Z")).agentMs).toBe(1800000);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

it("uses local calendar boundaries across a daylight-saving transition", () => {
  const before = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const range = calendarRange(new Date("2026-03-08T16:00:00Z"), "day");
    expect(new Date(range.from).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(new Date(range.to).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(range.to - range.from).toBe(23 * 3600000);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

it("excludes uncertain spans and clips at both boundaries without future credit", () => {
  const base: WorkInterval = { id: "a", agentId: "a", workspaceId: "w", provider: "fake", title: "Task", turnId: null, startAt: 100, endAt: 900, outcome: "interrupted", uncertain: true };
  expect(calendarTotals([base], 200, 800, 700)).toEqual({ agentMs: 0, elapsedMs: 0 });
  expect(calendarTotals([{ ...base, uncertain: false, turnId: "real" }], 200, 800, 700)).toEqual({ agentMs: 500, elapsedMs: 500 });
});
