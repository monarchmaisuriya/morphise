import { describe, expect, it } from "vitest";
import { applyTaskOperation, doneBefore, firstOpenColumn, followUpTask, snoozeTime, type TaskOperation, workspaceTask } from "./task-ops";
import { EMPTY_TASKS, type TaskDocument, viewSchema } from "./tasks";

const now = new Date("2026-11-11T14:30:00.000Z");
const later = new Date("2026-11-11T15:00:00.000Z");

function apply(document: TaskDocument, ...operations: TaskOperation[]): TaskDocument {
  return operations.reduce((current, operation) => applyTaskOperation(current, operation, now), document);
}

const add = (id: string, extra: Partial<Extract<TaskOperation, { kind: "addTask" }>["task"]> = {}): TaskOperation => ({
  kind: "addTask",
  task: { id, title: `Task ${id}`, column: "todo", ...extra },
});

const order = (document: TaskDocument, column: string) =>
  document.tasks
    .filter((task) => task.column === column)
    .sort((left, right) => left.order - right.order)
    .map((task) => task.id);

describe("tasks", () => {
  it("adds a task at the end of its column, and adding the same id again changes nothing", () => {
    const document = apply(EMPTY_TASKS, add("a"), add("b"), add("a", { title: "Different" }));
    expect(order(document, "todo")).toEqual(["a", "b"]);
    expect(document.tasks.find((task) => task.id === "a")?.title).toBe("Task a");
    expect(document.tasks[0].createdAt).toBe(now.toISOString());
  });

  it("creates labels named in a new task, reusing ones that exist by name", () => {
    const document = apply(EMPTY_TASKS, { kind: "addTask", task: { id: "a", title: "A", column: "todo" }, labelNames: ["Bug", "ui"] }, { kind: "addTask", task: { id: "b", title: "B", column: "todo" }, labelNames: ["bug"] });
    expect(document.labels.map((label) => label.name)).toEqual(["Bug", "ui"]);
    expect(document.tasks[1].labels).toEqual([document.labels[0].id]);
  });

  it("moves a task to a position in another column and renumbers both columns", () => {
    const document = apply(EMPTY_TASKS, add("a"), add("b"), add("c", { column: "doing" }), { kind: "moveTask", id: "a", column: "doing", position: 0 });
    expect(order(document, "doing")).toEqual(["a", "c"]);
    expect(order(document, "todo")).toEqual(["b"]);
  });

  it("leaves a task where it is when moved to its own column without a position, so repeats change nothing", () => {
    const document = apply(EMPTY_TASKS, add("a"), add("b"), { kind: "moveTask", id: "a", column: "todo" });
    expect(order(document, "todo")).toEqual(["a", "b"]);
  });

  it("marks a task completed when it enters Done and clears that when it leaves", () => {
    let document = apply(EMPTY_TASKS, add("a"), { kind: "moveTask", id: "a", column: "done" });
    expect(document.tasks[0].completedAt).toBe(now.toISOString());
    document = apply(document, { kind: "moveTask", id: "a", column: "todo" });
    expect(document.tasks[0].completedAt).toBeNull();
  });

  it("clears the reminder of a task entering Done when that rule is on", () => {
    const reminder = { at: later.toISOString(), setAt: now.toISOString() };
    const rule: TaskOperation = { kind: "saveRule", rule: { id: "r", enabled: true, when: { kind: "enters-done" }, then: { kind: "clear-reminder" } } };
    const document = apply(EMPTY_TASKS, rule, add("a", { reminder }), { kind: "moveTask", id: "a", column: "done" });
    expect(document.tasks[0].reminder).toBeNull();
  });

  it("applies the Done rules to a card added straight into Done", () => {
    const reminder = { at: later.toISOString(), setAt: now.toISOString() };
    const rule: TaskOperation = { kind: "saveRule", rule: { id: "r", enabled: true, when: { kind: "enters-done" }, then: { kind: "clear-reminder" } } };
    const document = apply(EMPTY_TASKS, rule, add("a", { column: "done", reminder }));
    expect(document.tasks[0].completedAt).toBe(now.toISOString());
    expect(document.tasks[0].reminder).toBeNull();
  });

  it("applies the Done rules to the open cards of a column that becomes Done, leaving archived cards and completion dates alone", () => {
    const reminder = { at: later.toISOString(), setAt: now.toISOString() };
    const rule: TaskOperation = { kind: "saveRule", rule: { id: "r", enabled: true, when: { kind: "enters-done" }, then: { kind: "clear-reminder" } } };
    const setup = apply(EMPTY_TASKS, rule, add("a", { column: "review", reminder }), add("b"), { kind: "moveTask", id: "b", column: "done" }, add("c", { column: "review", reminder }), { kind: "archiveTask", id: "c" });
    const switched = applyTaskOperation(setup, { kind: "setDoneColumn", id: "review" }, later);
    const [a, b, c] = switched.tasks;
    expect([a.completedAt, a.reminder]).toEqual([later.toISOString(), null]);
    expect([c.completedAt, c.reminder]).toEqual([null, reminder]);
    expect(doneBefore(switched, "2030-01-01T00:00:00.000Z").map((task) => task.id)).toEqual(["a"]);
    // A misclick back keeps the original completion dates, so auto-archive's clock does not restart.
    const back = applyTaskOperation(switched, { kind: "setDoneColumn", id: "done" }, new Date("2026-11-12T09:00:00.000Z"));
    expect(back.tasks.find((task) => task.id === "b")?.completedAt).toBe(b.completedAt);
    expect(b.completedAt).toBe(now.toISOString());
  });

  it("snoozes a due reminder by replacing it, keeping its note", () => {
    const reminder = { at: now.toISOString(), setAt: "2026-11-11T14:00:00.000Z", note: "check CI" };
    const document = apply(EMPTY_TASKS, add("a", { reminder }), { kind: "snoozeReminder", id: "a", at: snoozeTime(reminder, 15, now) });
    expect(document.tasks[0].reminder).toEqual({ at: "2026-11-11T14:45:00.000Z", setAt: now.toISOString(), note: "check CI" });
  });

  it("pushes a reminder that is not due yet later by the minutes, instead of moving it closer", () => {
    const reminder = { at: "2026-11-11T15:14:00.000Z", setAt: now.toISOString() };
    const document = apply(EMPTY_TASKS, add("a", { reminder }), { kind: "snoozeReminder", id: "a", at: snoozeTime(reminder, 15, now) });
    expect(document.tasks[0].reminder?.at).toBe("2026-11-11T15:29:00.000Z");
  });

  it("snoozes to the time chosen when the user acted, so applying it again after a conflict does not push it twice", () => {
    const reminder = { at: "2026-11-11T15:14:00.000Z", setAt: now.toISOString(), note: "check CI" };
    const seen = apply(EMPTY_TASKS, add("a", { reminder }));
    const snooze: TaskOperation = { kind: "snoozeReminder", id: "a", at: snoozeTime(seen.tasks[0].reminder, 15, now) };
    const once = apply(seen, snooze);
    expect(once.tasks[0].reminder).toEqual({ at: "2026-11-11T15:29:00.000Z", setAt: now.toISOString(), note: "check CI" });
    expect(apply(once, snooze).tasks[0].reminder?.at).toBe("2026-11-11T15:29:00.000Z");
    expect(snoozeTime({ at: "2026-11-11T14:00:00.000Z", setAt: "2026-11-11T13:00:00.000Z" }, 15, now)).toBe("2026-11-11T14:45:00.000Z");
  });

  it("sets or clears one link, leaving the task's other links alone", () => {
    let document = apply(EMPTY_TASKS, add("a", { links: { agentId: "chat-1", url: "https://example.com" } }), { kind: "setLink", id: "a", link: "workspaceId", value: "w1" });
    expect(document.tasks[0].links).toEqual({ agentId: "chat-1", url: "https://example.com", workspaceId: "w1" });
    document = apply(document, { kind: "setLink", id: "a", link: "url", value: null }, { kind: "setLink", id: "a", link: "workspaceId", value: "w2" });
    expect(document.tasks[0].links).toEqual({ agentId: "chat-1", workspaceId: "w2" });
  });

  it("archives, restores and deletes", () => {
    let document = apply(EMPTY_TASKS, add("a"), add("b"), { kind: "archiveTask", id: "a" });
    expect(document.tasks.find((task) => task.id === "a")?.archivedAt).toBe(now.toISOString());
    document = apply(document, { kind: "restoreTask", id: "a" }, { kind: "deleteTask", id: "b" });
    expect(document.tasks.map((task) => [task.id, task.archivedAt])).toEqual([["a", null]]);
  });

  it("ticks or unticks a checklist item to the state chosen, so applying it again after a conflict keeps that state", () => {
    const tick: TaskOperation = { kind: "setChecklistItem", id: "a", itemId: "i", done: true };
    const document = apply(EMPTY_TASKS, add("a", { checklist: [{ id: "i", text: "write test", done: false }] }), tick, tick);
    expect(document.tasks[0].checklist[0].done).toBe(true);
    expect(apply(document, { kind: "setChecklistItem", id: "a", itemId: "i", done: false }).tasks[0].checklist[0].done).toBe(false);
  });

  it("adds and removes single checklist items, keeping items others changed", () => {
    let document = apply(EMPTY_TASKS, add("a", { checklist: [{ id: "i", text: "write test", done: false }] }));
    document = apply(document, { kind: "setChecklistItem", id: "a", itemId: "i", done: true }, { kind: "addChecklistItem", id: "a", item: { id: "j", text: "ship" } });
    expect(document.tasks[0].checklist).toEqual([{ id: "i", text: "write test", done: true }, { id: "j", text: "ship", done: false }]);
    document = apply(document, { kind: "removeChecklistItem", id: "a", itemId: "i" }, { kind: "addChecklistItem", id: "a", item: { id: "j", text: "ship" } });
    expect(document.tasks[0].checklist).toEqual([{ id: "j", text: "ship", done: false }]);
  });

  it("refuses a change that leaves the document invalid, naming the problem", () => {
    expect(() => apply(EMPTY_TASKS, add("a", { column: "nowhere" }))).toThrow('No column has the id "nowhere"');
    expect(() => apply(EMPTY_TASKS, { kind: "updateTask", id: "missing", patch: { title: "x" } })).toThrow('No task has the id "missing"');
  });
});

describe("columns, labels, views", () => {
  it("deletes a column by moving its tasks to the first remaining column, but never deletes Done", () => {
    const document = apply(EMPTY_TASKS, add("a", { column: "review" }), { kind: "deleteColumn", id: "review" });
    expect(document.columns.map((column) => column.id)).toEqual(["backlog", "todo", "doing", "done"]);
    expect(document.tasks[0].column).toBe("backlog");
    expect(() => apply(EMPTY_TASKS, { kind: "deleteColumn", id: "done" })).toThrow("The Done column cannot be deleted");
  });

  it("moves a deleted column's tasks to the first open column even when Done is first", () => {
    const doneFirst = apply(EMPTY_TASKS, { kind: "moveColumn", id: "done", index: 0 });
    expect(doneFirst.columns[0].id).toBe("done");
    const document = apply(doneFirst, add("a"), { kind: "deleteColumn", id: "todo" });
    expect(document.tasks[0].column).toBe("backlog");
    expect(document.tasks[0].completedAt).toBeNull();
  });

  it("applies the Done rules when deleting the last open column sends its tasks to Done", () => {
    const reminder = { at: later.toISOString(), setAt: now.toISOString() };
    const rule: TaskOperation = { kind: "saveRule", rule: { id: "r", enabled: true, when: { kind: "enters-done" }, then: { kind: "clear-reminder" } } };
    const document = apply(EMPTY_TASKS, rule, add("a", { reminder }), ...["backlog", "doing", "review", "todo"].map((id): TaskOperation => ({ kind: "deleteColumn", id })));
    expect(document.tasks[0].column).toBe("done");
    expect([document.tasks[0].completedAt, document.tasks[0].reminder]).toEqual([now.toISOString(), null]);
  });

  it("moves a column to the place chosen, so applying it again after a conflict does not move it further", () => {
    const left: TaskOperation = { kind: "moveColumn", id: "review", index: 2 };
    const document = apply(EMPTY_TASKS, left, left);
    expect(document.columns.map((column) => column.id)).toEqual(["backlog", "todo", "review", "doing", "done"]);
    expect(apply(document, { kind: "moveColumn", id: "review", index: 99 }).columns.map((column) => column.id)).toEqual(["backlog", "todo", "doing", "done", "review"]);
  });

  it("removes a deleted label from views older versions saved, as they still read them", () => {
    const withView: TaskDocument = { ...EMPTY_TASKS, labels: [{ id: "bug", name: "bug", color: "#8b8ca3" }], views: [viewSchema.parse({ id: "v", name: "Bugs", filter: { labels: ["bug"] } })] };
    const document = apply(withView, { kind: "deleteLabel", id: "bug" });
    expect(document.views[0].filter.labels).toEqual([]);
  });

  it("removes a deleted label from every task", () => {
    const document = apply(EMPTY_TASKS, { kind: "addTask", task: { id: "a", title: "A", column: "todo" }, labelNames: ["bug"] }, { kind: "deleteLabel", id: "bug" });
    expect(document.labels).toEqual([]);
    expect(document.tasks[0].labels).toEqual([]);
  });
});

describe("chat follow-ups", () => {
  const reminder = { at: later.toISOString(), setAt: now.toISOString() };

  it("creates the chat's follow-up task with the reminder, then updates the same task", () => {
    let document = apply(EMPTY_TASKS, { kind: "remindChat", agentId: "chat-1", workspaceId: "w1", title: "Fix login", reminder });
    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0]).toMatchObject({ title: "Follow up: Fix login", column: "backlog", reminder, links: { agentId: "chat-1", workspaceId: "w1" } });
    document = apply(document, { kind: "remindChat", agentId: "chat-1", workspaceId: "w1", title: "Fix login", reminder: null });
    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].reminder).toBeNull();
  });

  it("does not create a task just to clear a reminder", () => {
    expect(apply(EMPTY_TASKS, { kind: "remindChat", agentId: "chat-1", workspaceId: "w1", title: "x", reminder: null }).tasks).toEqual([]);
  });

  it("finds the chat's open task with the soonest reminder, so every surface shows and clears the same one", () => {
    const soon = { at: "2026-11-11T14:40:00.000Z", setAt: now.toISOString() };
    const document = apply(EMPTY_TASKS, add("plain", { links: { agentId: "chat-1" } }), add("late", { reminder, links: { agentId: "chat-1" } }), add("soon", { reminder: soon, links: { agentId: "chat-1" } }));
    expect(followUpTask(document, "chat-1")?.id).toBe("soon");
    expect(followUpTask(apply(EMPTY_TASKS, add("plain", { links: { agentId: "chat-1" } })), "chat-1")?.id).toBe("plain");
  });

  it("finds only open follow-ups: not archived and not done", () => {
    const document = apply(EMPTY_TASKS, { kind: "remindChat", agentId: "chat-1", workspaceId: "w1", title: "x", reminder });
    expect(followUpTask(document, "chat-1")?.id).toBe(document.tasks[0].id);
    expect(followUpTask(apply(document, { kind: "moveTask", id: document.tasks[0].id, column: "done" }), "chat-1")).toBeNull();
  });

  it("puts a workspace reminder on the workspace's one task, creating it only when there is none", () => {
    let document = apply(EMPTY_TASKS, { kind: "remindWorkspace", workspaceId: "w1", title: "Fix login", reminder });
    expect(document.tasks).toHaveLength(1);
    expect(workspaceTask(document, "w1")).toMatchObject({ title: "Follow up: Fix login", reminder, links: { workspaceId: "w1" } });
    document = apply(document, { kind: "remindWorkspace", workspaceId: "w1", title: "Fix login", reminder: null });
    expect(document.tasks).toHaveLength(1);
    expect(workspaceTask(document, "w1")?.reminder).toBeNull();
  });

  it("reopens the workspace's Done task when a reminder is set on the workspace, so the reminder can fire", () => {
    let document = apply(EMPTY_TASKS, { kind: "addTask", task: { id: "t", title: "t", links: { workspaceId: "w1" } } }, { kind: "moveTask", id: "t", column: "done" });
    document = apply(document, { kind: "remindWorkspace", workspaceId: "w1", title: "t", reminder });
    expect(document.tasks[0]).toMatchObject({ column: firstOpenColumn(document).id, reminder });
  });

  it("links a workspace to one task only", () => {
    const add = (id: string, links: Record<string, string>): TaskOperation => ({ kind: "addTask", task: { id, title: id, links } });
    const document = apply(EMPTY_TASKS, add("a", { workspaceId: "w1" }), add("b", {}));
    expect(() => apply(document, add("c", { workspaceId: "w1" }))).toThrow('This workspace already has a task: "a"');
    expect(() => apply(document, { kind: "setLink", id: "b", link: "workspaceId", value: "w1" })).toThrow('already has a task: "a"');
    // A chat's own task keeps its chat and leaves the workspace to the task that has it.
    const chat = apply(document, { kind: "remindChat", agentId: "chat-1", workspaceId: "w1", title: "Chat", reminder });
    expect(followUpTask(chat, "chat-1")?.links).toEqual({ agentId: "chat-1" });
    // Archiving lets go of the workspace; restoring the old task while another holds it is refused.
    const moved = apply(document, { kind: "archiveTask", id: "a" }, { kind: "setLink", id: "b", link: "workspaceId", value: "w1" });
    expect(workspaceTask(moved, "w1")?.id).toBe("b");
    expect(() => apply(moved, { kind: "restoreTask", id: "a" })).toThrow('already has a task: "b"');
    // A chat's own task comes back without the workspace another task now has.
    const chatTask = apply(EMPTY_TASKS, { kind: "addTask", task: { id: "c", title: "c", links: { agentId: "chat-1", workspaceId: "w2" } } }, { kind: "archiveTask", id: "c" }, add("d", { workspaceId: "w2" }), { kind: "restoreTask", id: "c" });
    expect(chatTask.tasks.find((task) => task.id === "c")?.links).toEqual({ agentId: "chat-1" });
  });

  it("moves a 0.2 chat reminder into a task once, however many apps run the migration", () => {
    const migrate: TaskOperation = { kind: "migrateChatReminder", agentId: "chat-1", workspaceId: "w1", title: "Fix login", reminder };
    const document = apply(EMPTY_TASKS, migrate, migrate);
    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].reminder).toEqual(reminder);
  });
});
