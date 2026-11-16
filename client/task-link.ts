import type { EditorTarget } from "./board/card-editor";
import type { TaskStore } from "./task-store";
import { tasksOf } from "./task-store";

// A link that opens Workbench, Tasks with one task's editor (a reminder row in the sidebar makes one). Paseo keeps a
// screen's params in its address, so a reload, a host switch or a step back in history shows the same params again;
// the editor must open only on the tap that made the link. Each link carries a token from this copy of the plugin
// (Paseo runs the plugin once per host and again on reload), and Workbench takes a token once.

export const LINK_INSTANCE = Math.random().toString(36).slice(2, 10);
let linkCount = 0;

export function nextLinkToken(): string {
  linkCount += 1;
  return `${LINK_INSTANCE}.${linkCount}`;
}

export function taskLinkParams(taskId: string, token: string): Record<string, string> {
  return { view: "tasks", task: taskId, opened: token };
}

// The task a link asks to open, once: only for a token this copy made and has not taken yet.
export function claimTaskLink(params: Readonly<Record<string, string>>, instance: string, used: Set<string>): string | null {
  const { task, opened } = params;
  if (!task || !opened?.startsWith(`${instance}.`) || used.has(opened)) return null;
  used.add(opened);
  return task;
}

export type InitialEditing = { kind: "open"; target: EditorTarget } | { kind: "gone" } | { kind: "unknown" };

// Whether the asked-for task can open: "gone" only when the task list has loaded without it; before it loads, or when
// it is invalid (the board shows that problem), "unknown".
export function initialEditing(state: ReturnType<TaskStore["get"]>, taskId: string): InitialEditing {
  if (state.event?.status !== "ready") return { kind: "unknown" };
  return tasksOf(state).tasks.some((task) => task.id === taskId) ? { kind: "open", target: { kind: "existing", taskId } } : { kind: "gone" };
}
