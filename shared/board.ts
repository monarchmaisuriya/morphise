import { isDue, type Reminder } from "./reminders";
import type { Column, Task, TaskDocument, TaskFilter, TaskView } from "./tasks";
import { formatDue } from "./time-text";
import { todayDate } from "./when";

// How the board lays out tasks: filtering, sorting, swimlanes, the Today list, and labels.


function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return todayDate(new Date(year, month - 1, day + days));
}

export function matchesTaskFilter(task: Task, filter: TaskFilter, now: Date): boolean {
  const query = filter.text.trim().toLowerCase();
  if (query) {
    const text = [task.title, task.description, ...task.checklist.map((item) => item.text)].join("\n").toLowerCase();
    if (!text.includes(query)) return false;
  }
  if (filter.labels.length && !filter.labels.some((label) => task.labels.includes(label))) return false;
  if (filter.priorities.length && (task.priority === null || !filter.priorities.includes(task.priority))) return false;
  const today = todayDate(now);
  if (filter.due === "none" && task.due !== null) return false;
  if (filter.due === "overdue" && !(task.due !== null && task.due < today)) return false;
  if (filter.due === "today" && task.due !== today) return false;
  if (filter.due === "week" && !(task.due !== null && task.due <= addDays(today, 6))) return false;
  if (filter.hasReminder !== null && (task.reminder !== null) !== filter.hasReminder) return false;
  if (filter.workspaceId !== null && task.links.workspaceId !== filter.workspaceId) return false;
  return true;
}

type Layout = Pick<TaskView, "sort" | "swimlanes" | "filter">;

const byOrder = (left: Task, right: Task) => left.order - right.order;
const SORTS: Record<TaskView["sort"], (left: Task, right: Task) => number> = {
  manual: byOrder,
  priority: (left, right) => (left.priority ?? 9) - (right.priority ?? 9) || byOrder(left, right),
  due: (left, right) => (left.due ?? "9999").localeCompare(right.due ?? "9999") || byOrder(left, right),
  updated: (left, right) => right.updatedAt.localeCompare(left.updatedAt),
};

export interface Lane {
  key: string;
  title: string;
  tasks: Task[];
}

export interface BoardColumn {
  column: Column;
  // Every open task in the column, whatever the filter shows; the WIP limit counts these.
  count: number;
  // The cards this board covers: all of them, or one workspace's in a workspace's board.
  inScope: number;
  // The cards the filter shows; inScope minus shown are hidden by the filter.
  shown: number;
  overLimit: boolean;
  lanes: Lane[];
}

function lanesFor(tasks: Task[], swimlanes: TaskView["swimlanes"], document: TaskDocument): Lane[] {
  if (swimlanes === "none") return [{ key: "all", title: "", tasks }];
  const lanes = new Map<string, Lane>();
  const put = (key: string, title: string, task: Task) => {
    if (!lanes.has(key)) lanes.set(key, { key, title, tasks: [] });
    lanes.get(key)!.tasks.push(task);
  };
  for (const task of tasks) {
    if (swimlanes === "priority") put(`p${task.priority ?? 9}`, task.priority ? `P${task.priority}` : "No priority", task);
    else if (swimlanes === "workspace") put(`w:${task.links.workspaceId ?? ""}`, task.links.workspaceId ?? "No workspace", task);
    else if (task.labels.length === 0) put("l:", "No label", task);
    else for (const id of task.labels) put(`l:${id}`, document.labels.find((label) => label.id === id)?.name ?? id, task);
  }
  return [...lanes.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function boardColumns(document: TaskDocument, layout: Layout, now: Date): BoardColumn[] {
  const open = document.tasks.filter((task) => task.archivedAt === null);
  return document.columns.map((column) => {
    const inColumn = open.filter((task) => task.column === column.id);
    const shown = inColumn.filter((task) => matchesTaskFilter(task, layout.filter, now)).sort(SORTS[layout.sort]);
    return {
      column,
      count: inColumn.length,
      inScope: layout.filter.workspaceId === null ? inColumn.length : inColumn.filter((task) => task.links.workspaceId === layout.filter.workspaceId).length,
      shown: shown.length,
      overLimit: column.wipLimit !== null && inColumn.length > column.wipLimit,
      lanes: lanesFor(shown, layout.swimlanes, document),
    };
  });
}

function openTasks(document: TaskDocument): Task[] {
  const done = document.columns.find((column) => column.done)?.id;
  return document.tasks.filter((task) => task.archivedAt === null && task.column !== done);
}

export interface TodayGroup {
  title: string;
  tasks: Task[];
}

// Everything that wants attention today, each task in its first matching group.
export function todayGroups(document: TaskDocument, now: Date): TodayGroup[] {
  const today = todayDate(now);
  const placed = new Set<string>();
  const groups: TodayGroup[] = [
    { title: "Reminders due", tasks: [] },
    { title: "Overdue", tasks: [] },
    { title: "Due today", tasks: [] },
    { title: "Reminders later today", tasks: [] },
  ];
  const tests: ((task: Task) => boolean)[] = [
    (task) => task.reminder !== null && isDue(task.reminder, now),
    (task) => task.due !== null && task.due < today,
    (task) => task.due === today,
    (task) => task.reminder !== null && todayDate(new Date(task.reminder.at)) === today,
  ];
  const sorted = [...openTasks(document)].sort((left, right) => (left.reminder?.at ?? left.due ?? "").localeCompare(right.reminder?.at ?? right.due ?? ""));
  tests.forEach((test, index) => {
    for (const task of sorted) {
      if (placed.has(task.id) || !test(task)) continue;
      placed.add(task.id);
      groups[index].tasks.push(task);
    }
  });
  return groups.filter((group) => group.tasks.length > 0);
}

// What the sidebar row counts: reminders due and overdue due dates on open tasks.
export function dueCount(document: TaskDocument, now: Date): number {
  const today = todayDate(now);
  return openTasks(document).filter((task) => (task.reminder !== null && isDue(task.reminder, now)) || (task.due !== null && task.due < today)).length;
}

// The label on a chat's Remind me pill and header button.
export function reminderLabel(reminder: Reminder | null, now: Date): string {
  if (!reminder) return "Remind me";
  if (isDue(reminder, now)) return "⏰ Due";
  return `⏰ ${formatDue(reminder, now).replace(/^in /, "")}`;
}

