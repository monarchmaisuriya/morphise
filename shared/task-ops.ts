import { type Reminder, reminderAt } from "./reminders";
import { type ChecklistItem, type Column, type Label, type Rule, type Task, type TaskDocument, taskDocumentSchema, type TaskView, viewSchema } from "./tasks";

// Every change to the task document, as plain data. An app applies one to the latest document and
// saves with its revision; on a conflict it applies the same operation again to the newer
// document, so each operation is written to give the right result on any version.

export interface NewTask {
  id: string;
  title: string;
  column?: string;
  description?: string;
  priority?: number | null;
  labels?: string[];
  due?: string | null;
  reminder?: Reminder | null;
  checklist?: ChecklistItem[];
  links?: Task["links"];
}

type TaskPatch = Partial<Pick<Task, "title" | "description" | "priority" | "labels" | "due" | "links">>;

export type TaskOperation =
  | { kind: "addTask"; task: NewTask; labelNames?: string[] }
  | { kind: "updateTask"; id: string; patch: TaskPatch }
  | { kind: "moveTask"; id: string; column: string; position?: number }
  // One link at a time, so a workspace change and a web address edited elsewhere both survive.
  | { kind: "setLink"; id: string; link: "workspaceId" | "url"; value: string | null }
  | { kind: "setReminder"; id: string; reminder: Reminder | null }
  | { kind: "remindAgain"; id: string; minutes: number }
  | { kind: "addChecklistItem"; id: string; item: Pick<ChecklistItem, "id" | "text"> }
  | { kind: "removeChecklistItem"; id: string; itemId: string }
  | { kind: "toggleChecklistItem"; id: string; itemId: string }
  | { kind: "archiveTask"; id: string }
  | { kind: "archiveDoneBefore"; cutoff: string }
  | { kind: "restoreTask"; id: string }
  | { kind: "deleteTask"; id: string }
  | { kind: "addColumn"; column: Pick<Column, "id" | "name"> & Partial<Column> }
  | { kind: "updateColumn"; id: string; patch: Partial<Pick<Column, "name" | "color" | "wipLimit">> }
  | { kind: "setDoneColumn"; id: string }
  | { kind: "moveColumn"; id: string; by: -1 | 1 }
  | { kind: "deleteColumn"; id: string }
  | { kind: "saveLabel"; label: Pick<Label, "id" | "name"> & Partial<Label> }
  | { kind: "deleteLabel"; id: string }
  | { kind: "saveView"; view: Pick<TaskView, "id" | "name"> & Partial<TaskView> }
  | { kind: "deleteView"; id: string }
  | { kind: "setActiveView"; id: string | null }
  | { kind: "saveRule"; rule: Rule }
  | { kind: "deleteRule"; id: string }
  | { kind: "setArchiveDone"; enabled: boolean; days: number }
  | { kind: "remindChat"; agentId: string; workspaceId: string | null; title: string; reminder: Reminder | null }
  | { kind: "migrateChatReminder"; agentId: string; workspaceId: string | null; title: string; reminder: Reminder };

export class TaskOperationError extends Error {}

const copy = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

export function slug(text: string, fallback: string): string {
  const value = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return value || fallback;
}

function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function findTask(document: TaskDocument, id: string): Task {
  const task = document.tasks.find((item) => item.id === id);
  if (!task) throw new TaskOperationError(`No task has the id "${id}"`);
  return task;
}

function doneColumn(document: TaskDocument): Column {
  const column = document.columns.find((item) => item.done);
  if (!column) throw new TaskOperationError("The board has no Done column");
  return column;
}

// The first column that is not Done: where new and follow-up tasks go.
export function firstOpenColumn(document: TaskDocument): Column {
  return document.columns.find((column) => !column.done) ?? document.columns[0];
}

// The chat's open follow-up task: linked to it, not archived, not in Done. When several are, the
// one with the soonest reminder, so the pill, the picker, the sidebar and /remind clear all act on
// the same task.
export function followUpTask(document: TaskDocument, agentId: string): Task | null {
  const done = document.columns.find((column) => column.done)?.id;
  const open = document.tasks.filter((task) => task.links.agentId === agentId && task.archivedAt === null && task.column !== done);
  const reminded = open.filter((task) => task.reminder !== null).sort((left, right) => left.reminder!.at.localeCompare(right.reminder!.at));
  return reminded[0] ?? open[0] ?? null;
}

// Open Done cards completed before the cutoff.
export function doneBefore(document: TaskDocument, cutoff: string): Task[] {
  const done = document.columns.find((column) => column.done)?.id;
  const limit = Date.parse(cutoff);
  return document.tasks.filter((task) => task.column === done && task.archivedAt === null && task.completedAt !== null && Date.parse(task.completedAt) < limit);
}

// Gives the tasks of one column orders 0, 1, 2… in their current order.
function renumber(document: TaskDocument, column: string) {
  document.tasks
    .filter((task) => task.column === column)
    .sort((left, right) => left.order - right.order)
    .forEach((task, index) => {
      task.order = index;
    });
}

function nextOrder(document: TaskDocument, column: string): number {
  const orders = document.tasks.filter((task) => task.column === column).map((task) => task.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function labelIdsFor(document: TaskDocument, names: readonly string[]): string[] {
  return names.map((name) => {
    const existing = document.labels.find((label) => label.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing.id;
    const id = uniqueId(slug(name, "label"), document.labels.map((label) => label.id));
    document.labels.push({ id, name: name.trim(), color: "#8b8ca3" });
    return id;
  });
}

function insertTask(document: TaskDocument, input: NewTask, now: Date) {
  const column = input.column ?? firstOpenColumn(document).id;
  const time = now.toISOString();
  document.tasks.push({
    id: input.id,
    title: input.title,
    description: input.description ?? "",
    column,
    order: nextOrder(document, column),
    priority: input.priority ?? null,
    labels: input.labels ?? [],
    due: input.due ?? null,
    reminder: input.reminder ?? null,
    checklist: input.checklist ?? [],
    links: input.links ?? {},
    createdAt: time,
    updatedAt: time,
    completedAt: document.columns.find((item) => item.id === column)?.done ? time : null,
    archivedAt: null,
  });
}

function touch(task: Task, now: Date) {
  task.updatedAt = now.toISOString();
}

function clearsReminderOnDone(document: TaskDocument): boolean {
  return document.rules.some((rule) => rule.enabled && rule.when.kind === "enters-done" && rule.then.kind === "clear-reminder");
}

function move(document: TaskDocument, task: Task, column: string, position: number | undefined, now: Date) {
  if (!document.columns.some((item) => item.id === column)) throw new TaskOperationError(`No column has the id "${column}"`);
  const from = task.column;
  const enteringDone = doneColumn(document).id === column && from !== column;
  const siblings = document.tasks
    .filter((item) => item.column === column && item.id !== task.id)
    .sort((left, right) => left.order - right.order);
  const index = position === undefined ? siblings.length : Math.max(0, Math.min(position, siblings.length));
  siblings.splice(index, 0, task);
  task.column = column;
  siblings.forEach((item, order) => {
    item.order = order;
  });
  if (from !== column) renumber(document, from);
  if (enteringDone) {
    task.completedAt = now.toISOString();
    if (clearsReminderOnDone(document)) task.reminder = null;
  } else if (doneColumn(document).id !== column) {
    task.completedAt = null;
  }
  touch(task, now);
}

function upsert<Item extends { id: string }>(items: Item[], item: Item) {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
}

function mutate(document: TaskDocument, operation: TaskOperation, now: Date): void {
  switch (operation.kind) {
    case "addTask": {
      if (document.tasks.some((task) => task.id === operation.task.id)) return;
      const labels = [...(operation.task.labels ?? []), ...labelIdsFor(document, operation.labelNames ?? [])];
      insertTask(document, { ...operation.task, labels: [...new Set(labels)] }, now);
      return;
    }
    case "updateTask": {
      const task = findTask(document, operation.id);
      Object.assign(task, copy(operation.patch));
      touch(task, now);
      return;
    }
    case "setLink": {
      const task = findTask(document, operation.id);
      if ((task.links[operation.link] ?? null) === operation.value) return;
      if (operation.value === null) delete task.links[operation.link];
      else task.links[operation.link] = operation.value;
      touch(task, now);
      return;
    }
    case "moveTask": {
      const task = findTask(document, operation.id);
      // Moving to its own column without a position is a repeat (rules in several apps): no change.
      if (task.column === operation.column && operation.position === undefined) return;
      return move(document, task, operation.column, operation.position, now);
    }
    case "setReminder": {
      const task = findTask(document, operation.id);
      task.reminder = operation.reminder;
      touch(task, now);
      return;
    }
    case "remindAgain": {
      const task = findTask(document, operation.id);
      // Later than the reminder or than now, whichever is later: a due reminder is snoozed, an
      // upcoming one is pushed back, never brought closer.
      const from = Math.max(now.getTime(), task.reminder ? Date.parse(task.reminder.at) : 0);
      task.reminder = reminderAt(new Date(from + operation.minutes * 60_000), now, task.reminder?.note);
      touch(task, now);
      return;
    }
    case "addChecklistItem": {
      const task = findTask(document, operation.id);
      // Adding the same item again changes nothing.
      if (task.checklist.some((entry) => entry.id === operation.item.id)) return;
      task.checklist.push({ id: operation.item.id, text: operation.item.text, done: false });
      touch(task, now);
      return;
    }
    case "removeChecklistItem": {
      const task = findTask(document, operation.id);
      task.checklist = task.checklist.filter((entry) => entry.id !== operation.itemId);
      touch(task, now);
      return;
    }
    case "toggleChecklistItem": {
      const task = findTask(document, operation.id);
      const item = task.checklist.find((entry) => entry.id === operation.itemId);
      if (!item) throw new TaskOperationError(`No checklist item has the id "${operation.itemId}"`);
      item.done = !item.done;
      touch(task, now);
      return;
    }
    case "archiveTask": {
      const task = findTask(document, operation.id);
      task.archivedAt = now.toISOString();
      touch(task, now);
      return;
    }
    case "restoreTask": {
      const task = findTask(document, operation.id);
      task.archivedAt = null;
      // A restored Done card counts as finished now, so auto-archive does not take it straight back.
      if (task.completedAt !== null) task.completedAt = now.toISOString();
      touch(task, now);
      return;
    }
    case "archiveDoneBefore":
      for (const task of doneBefore(document, operation.cutoff)) {
        task.archivedAt = now.toISOString();
        touch(task, now);
      }
      return;
    case "deleteTask":
      document.tasks = document.tasks.filter((task) => task.id !== operation.id);
      return;
    case "addColumn":
      if (document.columns.some((column) => column.id === operation.column.id)) return;
      document.columns.splice(document.columns.findIndex((column) => column.done), 0, { wipLimit: null, ...operation.column, done: false });
      return;
    case "updateColumn": {
      const column = document.columns.find((item) => item.id === operation.id);
      if (!column) throw new TaskOperationError(`No column has the id "${operation.id}"`);
      Object.assign(column, copy(operation.patch));
      return;
    }
    case "setDoneColumn":
      if (!document.columns.some((column) => column.id === operation.id)) throw new TaskOperationError(`No column has the id "${operation.id}"`);
      document.columns.forEach((column) => {
        column.done = column.id === operation.id;
      });
      return;
    case "moveColumn": {
      const index = document.columns.findIndex((column) => column.id === operation.id);
      const target = index + operation.by;
      if (index < 0 || target < 0 || target >= document.columns.length) return;
      [document.columns[index], document.columns[target]] = [document.columns[target], document.columns[index]];
      return;
    }
    case "deleteColumn": {
      const column = document.columns.find((item) => item.id === operation.id);
      if (!column) return;
      if (column.done) throw new TaskOperationError("The Done column cannot be deleted");
      document.columns = document.columns.filter((item) => item.id !== operation.id);
      const fallback = document.columns[0].id;
      for (const task of document.tasks) if (task.column === operation.id) {
        task.column = fallback;
        task.order = nextOrder(document, fallback);
      }
      document.rules = document.rules.filter((rule) => !(rule.then.kind === "move" && rule.then.column === operation.id));
      return;
    }
    case "saveLabel":
      return upsert(document.labels, { color: "#8b8ca3", ...copy(operation.label) });
    case "deleteLabel":
      document.labels = document.labels.filter((label) => label.id !== operation.id);
      for (const task of document.tasks) task.labels = task.labels.filter((label) => label !== operation.id);
      for (const view of document.views) view.filter.labels = view.filter.labels.filter((label) => label !== operation.id);
      return;
    case "saveView":
      return upsert(document.views, viewSchema.parse(copy(operation.view)));
    case "deleteView":
      document.views = document.views.filter((view) => view.id !== operation.id);
      if (document.activeView === operation.id) document.activeView = null;
      return;
    case "setActiveView":
      document.activeView = operation.id;
      return;
    case "saveRule":
      return upsert(document.rules, copy(operation.rule));
    case "deleteRule":
      document.rules = document.rules.filter((rule) => rule.id !== operation.id);
      return;
    case "setArchiveDone":
      document.archiveDone = { enabled: operation.enabled, days: operation.days };
      return;
    case "remindChat": {
      const task = followUpTask(document, operation.agentId);
      if (task) {
        task.reminder = operation.reminder;
        touch(task, now);
        return;
      }
      if (!operation.reminder) return;
      insertTask(
        document,
        {
          id: uniqueId(`follow-up-${slug(operation.agentId, "chat")}`, document.tasks.map((item) => item.id)),
          title: `Follow up: ${operation.title}`.slice(0, 200),
          reminder: operation.reminder,
          links: { agentId: operation.agentId, ...(operation.workspaceId ? { workspaceId: operation.workspaceId } : {}) },
        },
        now,
      );
      return;
    }
    case "migrateChatReminder": {
      const id = `migrated-${slug(operation.agentId, "chat")}-${Date.parse(operation.reminder.setAt)}`.slice(0, 64);
      if (document.tasks.some((task) => task.id === id)) return;
      insertTask(
        document,
        {
          id,
          title: `Follow up: ${operation.title}`.slice(0, 200),
          reminder: operation.reminder,
          links: { agentId: operation.agentId, ...(operation.workspaceId ? { workspaceId: operation.workspaceId } : {}) },
        },
        now,
      );
      return;
    }
  }
}

// Applies one operation and checks the result against the schema; an invalid result throws with
// the first problem in plain words, and the document passed in is never changed.
export function applyTaskOperation(document: TaskDocument, operation: TaskOperation, now: Date): TaskDocument {
  const next = copy(document);
  mutate(next, operation, now);
  const result = taskDocumentSchema.safeParse(next);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new TaskOperationError(issue.message);
  }
  return result.data;
}
