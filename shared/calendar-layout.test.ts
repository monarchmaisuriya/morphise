import { expect, it } from "vitest";
import { calendarLayout, durationText } from "./calendar-layout";
import type { WorkInterval } from "./work-calendar";

const base: WorkInterval = { id: "a", agentId: "agent", workspaceId: "w", provider: "fake", title: "Task", turnId: "turn", startAt: 3600000, endAt: 7200000, outcome: "completed", uncertain: false };

it("formats short durations without rounding them into decimal hours", () => {
  expect(durationText(35000)).toBe("35 sec");
  expect(durationText(720000)).toBe("12 min");
  expect(durationText(4800000)).toBe("1 h 20 min");
});

it("lays overlapping work side by side without changing recorded duration", () => {
  const before = process.env.TZ; process.env.TZ = "UTC";
  try {
    const grid = calendarLayout([base, { ...base, id: "b", startAt: 5400000, endAt: 9000000 }], 0, 86400000, 86400000);
    expect(grid.days[0]!.blocks.map((block) => [block.lane, block.lanes, block.height, block.end - block.start])).toEqual([[0, 2, 64, 3600000], [1, 2, 64, 3600000]]);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

it("keeps uncertain point observations selectable without giving them runtime", () => {
  const before = process.env.TZ; process.env.TZ = "UTC";
  try {
    const grid = calendarLayout([{ ...base, uncertain: true, endAt: base.startAt }], 0, 86400000, 86400000);
    expect(grid.days[0]!.blocks[0]).toMatchObject({ height: 28, start: 3600000, end: 3600000 });
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

it("uses actual elapsed hours on a 25-hour daylight-saving day", () => {
  const before = process.env.TZ; process.env.TZ = "America/New_York";
  try {
    const from = +new Date("2026-11-01T00:00:00-04:00"), to = +new Date("2026-11-02T00:00:00-05:00");
    const grid = calendarLayout([], from, to, to, true);
    expect(grid.days[0]!.hours).toBe(25);
    expect(grid.height).toBe(1600);
    const late = calendarLayout([{ ...base, startAt: to - 35000, endAt: to }], from, to, to, true).days[0]!.blocks[0]!;
    expect(late.end - late.start).toBe(35000);
    expect(late.top + late.height).toBe(1600);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

it("assigns separate lanes to tiny nearby events whose minimum hit areas overlap", () => {
  const before = process.env.TZ; process.env.TZ = "UTC";
  try {
    const grid = calendarLayout([base, { ...base, id: "b", startAt: 7200001, endAt: 7200002 }, { ...base, id: "c", startAt: 7200003, endAt: 7200004 }], 0, 86400000, 86400000);
    expect(grid.days[0]!.blocks.map((block) => [block.lane, block.lanes])).toEqual([[0, 1], [0, 2], [1, 2]]);
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});
