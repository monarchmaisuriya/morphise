import { describe, expect, it } from "vitest";
import { boardColumns, type Frame } from "../../shared/board";
import { applyTaskOperation, type TaskOperation } from "../../shared/task-ops";
import { DEFAULT_FILTER, EMPTY_TASKS, type TaskDocument } from "../../shared/tasks";
import { boardDropTarget, copyKey } from "./drop-places";

const now = new Date("2026-11-11T14:30:00.000Z");
const build = (...operations: TaskOperation[]): TaskDocument => operations.reduce((document, operation) => applyTaskOperation(document, operation, now), EMPTY_TASKS);
const add = (id: string, labelNames: string[]): TaskOperation => ({ kind: "addTask", task: { id, title: `Task ${id}`, column: "todo" }, labelNames });
const frame = (y: number): Frame => ({ x: 0, y, width: 300, height: 40 });

// Rows by label: x has two labels, so it is drawn in both lanes.
const document = build(add("x", ["a", "b"]), add("y", ["b"]), add("z", ["a"]));
const columns = boardColumns(document, { sort: "manual", swimlanes: "label", filter: DEFAULT_FILTER }, now);
const todo = columns.find((entry) => entry.column.id === "todo")!;
const [laneA, laneB] = todo.lanes;

// Lane a: x at 0, z at 48. Lane b: x at 120, y at 168.
const places = {
  columns: new Map([["todo", { x: 0, y: 0, width: 300, height: 600 }]]),
  cards: new Map([
    [copyKey(laneA.key, "x"), frame(0)],
    [copyKey(laneA.key, "z"), frame(48)],
    [copyKey(laneB.key, "x"), frame(120)],
    [copyKey(laneB.key, "y"), frame(168)],
  ]),
};
const options = (closes: boolean) => ({ closes, gap: 8, stack: "horizontal" as const, outer: (place: Frame) => place, down: () => 0 });

describe("boardDropTarget", () => {
  it("draws the two-label task in both lanes", () => {
    expect([laneA.tasks.map((task) => task.id), laneB.tasks.map((task) => task.id)]).toEqual([["x", "z"], ["x", "y"]]);
  });

  it("reads each drawn copy at its own place", () => {
    expect(boardDropTarget(columns, places, "z", { x: 50, y: 130 }, options(false))).toEqual({ column: "todo", before: "x", lane: laneB.key });
    expect(boardDropTarget(columns, places, "y", { x: 50, y: 10 }, options(false))).toEqual({ column: "todo", before: "x", lane: laneA.key });
  });

  it("moves a card up once for every closed copy of the lifted task above it", () => {
    // Both copies of x close (40 high, 8 apart): y moves from 168 to 72, its middle to 92.
    expect(boardDropTarget(columns, places, "x", { x: 50, y: 100 }, options(true))).toEqual({ column: "todo", before: null, lane: null });
    expect(boardDropTarget(columns, places, "x", { x: 50, y: 85 }, options(true))).toEqual({ column: "todo", before: "y", lane: laneB.key });
    expect(boardDropTarget(columns, places, "x", { x: 50, y: 10 }, options(true))).toEqual({ column: "todo", before: "z", lane: laneA.key });
  });
});
