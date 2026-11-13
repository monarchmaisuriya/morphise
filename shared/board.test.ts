import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boardColumns, dropMove, dropTarget, dueCount, dueOrDueTodayCount, matchesTaskFilter, todayGroups } from "./board";
import { applyTaskOperation, type TaskOperation } from "./task-ops";
import { DEFAULT_FILTER, EMPTY_TASKS, type TaskDocument } from "./tasks";

const zone = process.env.TZ;
beforeAll(() => void (process.env.TZ = "Europe/London"));
afterAll(() => void (process.env.TZ = zone));

const now = new Date("2026-11-11T14:30:00.000Z");
const build = (...operations: TaskOperation[]): TaskDocument => operations.reduce((document, operation) => applyTaskOperation(document, operation, now), EMPTY_TASKS);
const add = (id: string, extra: Record<string, unknown> = {}): TaskOperation => ({ kind: "addTask", task: { id, title: `Task ${id}`, column: "todo", ...extra } });
const reminder = (at: string) => ({ at, setAt: "2026-11-11T14:00:00.000Z" });

describe("matchesTaskFilter", () => {
  const document = build(
    { kind: "addTask", task: { id: "a", title: "Fix login", column: "todo", priority: 1, due: "2026-11-10", description: "auth flow" }, labelNames: ["bug"] },
    add("b", { priority: 3, due: "2026-11-11", reminder: reminder("2026-11-11T16:00:00.000Z"), links: { workspaceId: "w1" } }),
    add("c", { due: "2026-11-25", checklist: [{ id: "i", text: "Write the migration", done: false }] }),
  );
  const ids = (filter: Partial<typeof DEFAULT_FILTER>) => document.tasks.filter((task) => matchesTaskFilter(task, { ...DEFAULT_FILTER, ...filter }, now)).map((task) => task.id);

  it("matches text in the title, description and checklist", () => {
    expect(ids({ text: "AUTH" })).toEqual(["a"]);
    expect(ids({ text: "migration" })).toEqual(["c"]);
  });

  it("filters by label, priority, due window, reminder and workspace", () => {
    expect(ids({ labels: ["bug"] })).toEqual(["a"]);
    expect(ids({ priorities: [1, 3] })).toEqual(["a", "b"]);
    expect(ids({ due: "overdue" })).toEqual(["a"]);
    expect(ids({ due: "today" })).toEqual(["b"]);
    expect(ids({ due: "week" })).toEqual(["a", "b"]);
    expect(ids({ hasReminder: true })).toEqual(["b"]);
    expect(ids({ workspaceId: "w1" })).toEqual(["b"]);
  });
});

describe("boardColumns", () => {
  const document = build(add("a", { priority: 3 }), add("b", { priority: 1 }), add("c", { priority: null }), add("d", { column: "done" }), { kind: "archiveTask", id: "c" });

  it("lists each column's tasks in manual order, leaving out archived tasks, with WIP state", () => {
    const columns = boardColumns(document, { sort: "manual", swimlanes: "none", filter: DEFAULT_FILTER }, now);
    expect(columns.map((column) => [column.column.id, column.lanes[0].tasks.map((task) => task.id)])).toEqual([
      ["backlog", []],
      ["todo", ["a", "b"]],
      ["doing", []],
      ["review", []],
      ["done", ["d"]],
    ]);
    expect(columns[1].count).toBe(2);
  });

  it("sorts by priority and splits into swimlanes", () => {
    const columns = boardColumns(document, { sort: "priority", swimlanes: "priority", filter: DEFAULT_FILTER }, now);
    expect(columns[1].lanes.map((lane) => [lane.title, lane.tasks.map((task) => task.id)])).toEqual([
      ["P1", ["b"]],
      ["P3", ["a"]],
    ]);
  });

  it("counts the cards a filter shows apart from all cards in the column", () => {
    const columns = boardColumns(document, { sort: "manual", swimlanes: "none", filter: { ...DEFAULT_FILTER, priorities: [1] } }, now);
    expect([columns[1].count, columns[1].inScope, columns[1].shown]).toEqual([2, 2, 1]);
  });

  it("does not count other workspaces' cards as hidden by a filter in a workspace's board", () => {
    const scoped = applyTaskOperation(document, { kind: "setLink", id: "a", link: "workspaceId", value: "w1" }, now);
    const columns = boardColumns(scoped, { sort: "manual", swimlanes: "none", filter: { ...DEFAULT_FILTER, workspaceId: "w1" } }, now);
    expect([columns[1].count, columns[1].inScope, columns[1].shown]).toEqual([2, 1, 1]);
  });

  it("flags a column over its WIP limit", () => {
    const limited = applyTaskOperation(document, { kind: "updateColumn", id: "todo", patch: { wipLimit: 1 } }, now);
    expect(boardColumns(limited, { sort: "manual", swimlanes: "none", filter: DEFAULT_FILTER }, now)[1].overLimit).toBe(true);
  });
});

describe("todayGroups and dueCount", () => {
  const document = build(
    add("late", { due: "2026-11-09" }),
    add("today", { due: "2026-11-11" }),
    add("ring", { reminder: reminder("2026-11-11T14:20:00.000Z") }),
    add("soon", { reminder: reminder("2026-11-11T18:00:00.000Z") }),
    add("finished", { column: "done", due: "2026-11-09" }),
  );

  it("collects overdue, due today, due reminders and reminders later today, never done tasks", () => {
    const groups = todayGroups(document, now);
    expect(groups.map((group) => [group.title, group.tasks.map((task) => task.id)])).toEqual([
      ["Reminders due", ["ring"]],
      ["Overdue", ["late"]],
      ["Due today", ["today"]],
      ["Reminders later today", ["soon"]],
    ]);
    expect(dueCount(document, now)).toBe(2);
  });

  it("counts what is due for the Workbench's opening: due reminders, overdue and due today, not reminders later today", () => {
    expect(dueOrDueTodayCount(document, now)).toBe(3);
    expect(dueOrDueTodayCount(build(add("soon", { reminder: reminder("2026-11-11T18:00:00.000Z") })), now)).toBe(0);
  });
});


describe("dropTarget", () => {
  const frame = (x: number, y: number) => ({ x, y, width: 100, height: 40 });
  const columns = [
    { id: "todo", frame: { x: 0, y: 0, width: 100, height: 400 }, cards: [{ id: "a", frame: frame(0, 50) }, { id: "b", frame: frame(0, 100) }] },
    { id: "doing", frame: { x: 120, y: 0, width: 100, height: 400 }, cards: [] },
  ];

  it("puts the card before the first card whose middle is below the pointer", () => {
    expect(dropTarget(columns, 50, 60)).toEqual({ column: "todo", before: "a" });
    expect(dropTarget(columns, 50, 80)).toEqual({ column: "todo", before: "b" });
    expect(dropTarget(columns, 50, 300)).toEqual({ column: "todo", before: null });
  });

  it("in a list, picks the section the pointer is over or nearest to, by height", () => {
    const sections = [
      { id: "todo", frame: { x: 0, y: 0, width: 600, height: 120 }, cards: [{ id: "a", frame: { x: 0, y: 40, width: 600, height: 40 } }, { id: "b", frame: { x: 0, y: 80, width: 600, height: 40 } }] },
      { id: "doing", frame: { x: 0, y: 132, width: 600, height: 40 }, cards: [] },
    ];
    expect(dropTarget(sections, 300, 70, "vertical")).toEqual({ column: "todo", before: "b" });
    expect(dropTarget(sections, 300, 150, "vertical")).toEqual({ column: "doing", before: null });
    expect(dropTarget(sections, 300, 128, "vertical")).toEqual({ column: "doing", before: null });
    expect(dropTarget(sections, 300, 500, "vertical")).toEqual({ column: "doing", before: null });
  });

  it("takes the nearest column when the pointer is in a gap or past the edge", () => {
    expect(dropTarget(columns, 115, 10)).toEqual({ column: "doing", before: null });
    expect(dropTarget(columns, 900, 10)).toEqual({ column: "doing", before: null });
    expect(dropTarget([], 0, 0)).toBeNull();
  });
});

describe("dropMove", () => {
  // a, b, c in To do; d in To do but archived; e in In progress.
  const document = build(add("a"), add("b"), add("c"), add("d"), { kind: "archiveTask", id: "d" }, add("e", { column: "doing" }));
  const order = (doc: TaskDocument, column: string) => doc.tasks.filter((task) => task.column === column).sort((l, r) => l.order - r.order).map((task) => task.id);
  const drop = (taskId: string, column: string, before: string | null, shown: string[]) => {
    const operation = dropMove(document, taskId, { column, before }, shown, true);
    return operation ? order(applyTaskOperation(document, operation, now), column) : null;
  };

  it("reorders within a column, counting cards the board does not show", () => {
    expect(drop("c", "todo", "a", ["a", "b", "c"])).toEqual(["c", "a", "b", "d"]);
    expect(drop("a", "todo", null, ["a", "b", "c"])).toEqual(["b", "c", "a", "d"]);
  });

  it("moves to another column before a card or after the last shown one", () => {
    expect(drop("a", "doing", "e", ["e"])).toEqual(["a", "e"]);
    expect(drop("a", "doing", null, ["e"])).toEqual(["e", "a"]);
  });

  it("changes nothing when the card is dropped where it is", () => {
    expect(dropMove(document, "b", { column: "todo", before: "c" }, ["a", "b", "c"], true)).toBeNull();
    expect(dropMove(document, "c", { column: "todo", before: null }, ["a", "b", "c"], true)).toBeNull();
  });

  it("only changes the column when the board is not in manual order", () => {
    expect(dropMove(document, "c", { column: "todo", before: "a" }, ["a", "b", "c"], false)).toBeNull();
    expect(dropMove(document, "c", { column: "doing", before: "e" }, ["e"], false)).toEqual({ kind: "moveTask", id: "c", column: "doing" });
  });
});
