import { isDue } from "./reminders";
import type { TaskOperation } from "./task-ops";
import type { Column, Task, TaskDocument, TaskFilter, TaskView } from "./tasks";
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


// ---------- Drag and drop ----------

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A column as the board shows it during a drag: where it is, and its shown cards (without the dragged one) in board order. */
export interface DropColumn {
  id: string;
  frame: Frame;
  cards: { id: string; frame: Frame }[];
}

/** Where a dragged card lands: a column, and the shown card it goes before (null: after the column's last shown card). */
export interface DropTarget {
  column: string;
  before: string | null;
}

/**
 * The drop target under a pointer: the column it is over (or the nearest one, for the gaps), before the first card whose
 * middle is below it. Columns side by side (a board) are told apart across; stacked sections (a list), down.
 */
export function dropTarget(columns: DropColumn[], x: number, y: number, stack: "horizontal" | "vertical" = "horizontal"): DropTarget | null {
  const across = (start: number, size: number, at: number) => (at < start ? start - at : at > start + size ? at - start - size : 0);
  const distance = (frame: Frame) => (stack === "horizontal" ? across(frame.x, frame.width, x) : across(frame.y, frame.height, y));
  const column = columns.reduce<DropColumn | null>((best, item) => (best === null || distance(item.frame) < distance(best.frame) ? item : best), null);
  if (!column) return null;
  const before = column.cards.find((card) => card.frame.y + card.frame.height / 2 > y);
  return { column: column.id, before: before?.id ?? null };
}

/**
 * The move that puts a dragged card at `target`, or null when it would change nothing. `shown` is the target column's shown
 * card ids in board order. A move's position counts every card in the column, hidden ones too, so the card lands right before
 * `before`, or right after the last shown card. With a sort other than manual a card's place in a column is not its own, so
 * only the column changes.
 */
export function dropMove(document: TaskDocument, taskId: string, target: DropTarget, shown: string[], manual: boolean): TaskOperation | null {
  const task = document.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  if (!manual) return task.column === target.column ? null : { kind: "moveTask", id: taskId, column: target.column };
  const inColumn = document.tasks.filter((item) => item.column === target.column).sort(byOrder);
  const siblings = inColumn.filter((item) => item.id !== taskId).map((item) => item.id);
  const last = shown.filter((id) => id !== taskId).at(-1);
  const position = target.before !== null ? siblings.indexOf(target.before) : last !== undefined ? siblings.indexOf(last) + 1 : siblings.length;
  if (position < 0) return null;
  if (task.column === target.column && inColumn.findIndex((item) => item.id === taskId) === position) return null;
  return { kind: "moveTask", id: taskId, column: target.column, position };
}
