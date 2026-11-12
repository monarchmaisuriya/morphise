import { describe, expect, it } from "vitest";
import { applyTaskOperation, firstOpenColumn, followUpTask, type TaskOperation, workspaceTask } from "./task-ops";
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

  it("snoozes a due reminder by replacing it, keeping its note", () => {
    const reminder = { at: now.toISOString(), setAt: "2026-11-11T14:00:00.000Z", note: "check CI" };
    const document = apply(EMPTY_TASKS, add("a", { reminder }), { kind: "remindAgain", id: "a", minutes: 15 });
    expect(document.tasks[0].reminder).toEqual({ at: "2026-11-11T14:45:00.000Z", setAt: now.toISOString(), note: "check CI" });
  });

  it("pushes a reminder that is not due yet later by the minutes, instead of moving it closer", () => {
    const reminder = { at: "2026-11-11T15:14:00.000Z", setAt: now.toISOString() };
    const document = apply(EMPTY_TASKS, add("a", { reminder }), { kind: "remindAgain", id: "a", minutes: 15 });
    expect(document.tasks[0].reminder?.at).toBe("2026-11-11T15:29:00.000Z");
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

  it("toggles a checklist item", () => {
    const document = apply(EMPTY_TASKS, add("a", { checklist: [{ id: "i", text: "write test", done: false }] }), { kind: "toggleChecklistItem", id: "a", itemId: "i" });
    expect(document.tasks[0].checklist[0].done).toBe(true);
  });

  it("adds and removes single checklist items, keeping items others changed", () => {
    let document = apply(EMPTY_TASKS, add("a", { checklist: [{ id: "i", text: "write test", done: false }] }));
    document = apply(document, { kind: "toggleChecklistItem", id: "a", itemId: "i" }, { kind: "addChecklistItem", id: "a", item: { id: "j", text: "ship" } });
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

  it("moves a column left or right", () => {
    const document = apply(EMPTY_TASKS, { kind: "moveColumn", id: "review", by: -1 });
    expect(document.columns.map((column) => column.id)).toEqual(["backlog", "todo", "review", "doing", "done"]);
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
