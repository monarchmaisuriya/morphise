// An agent's steps (its to-do list), as the steps card shows them. Agents publish the whole list as
// one `todo` timeline item each time it changes; the latest one is the current plan.

export type StepStatus = "pending" | "in_progress" | "completed";

export interface Step {
  text: string;
  status: StepStatus;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// The steps of a `todo` timeline item; null for any other item. A step in progress shows the
// agent's "doing" wording when it gave one.
export function readSteps(item: unknown): Step[] | null {
  const todo = record(item);
  if (todo?.type !== "todo" || !Array.isArray(todo.items)) return null;
  return todo.items.flatMap((value) => {
    const step = record(value);
    if (!step || typeof step.text !== "string") return [];
    const status: StepStatus = step.status === "pending" || step.status === "in_progress" || step.status === "completed" ? step.status : step.completed === true ? "completed" : "pending";
    const doing = status === "in_progress" && typeof step.activeForm === "string" && step.activeForm ? step.activeForm : null;
    return [{ text: doing ?? step.text, status }];
  });
}

// The latest plan in a page of timeline entries, oldest first; null when the page has none.
export function latestSteps(entries: readonly unknown[]): Step[] | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const steps = readSteps(record(entries[index])?.item);
    if (steps) return steps;
  }
  return null;
}

export function stepCounts(steps: readonly Step[]): { done: number; total: number } {
  return { done: steps.filter((step) => step.status === "completed").length, total: steps.length };
}

// What the card shows: the plan while it has unfinished steps; once finished, "all done" for a
// moment (`finishedRecently`), or for as long as the chat has the plan when `show` is "always".
// Nothing for no plan or an empty plan.
export function cardMode(steps: readonly Step[] | null, finishedRecently: boolean, show: StepsShow = "unfinished"): "plan" | "done" | "hidden" {
  if (!steps || steps.length === 0) return "hidden";
  if (steps.some((step) => step.status !== "completed")) return "plan";
  return finishedRecently || show === "always" ? "done" : "hidden";
}

// ---------- Options ----------

export type StepsShow = "unfinished" | "always";

// The card's options as saved (every key optional, so older versions still read the profile).
export interface StepsSettings {
  show?: StepsShow;
  doneSeconds?: number;
  position?: "bottom" | "top";
  scope?: "open" | "workspace";
  startFolded?: boolean;
  hideCompleted?: boolean;
  maxSteps?: number;
  progress?: boolean;
}

export interface StepsOptions {
  show: StepsShow;
  // How long "All done" stays before the card hides itself (when show is "unfinished").
  doneSeconds: number;
  position: "bottom" | "top";
  // The open chat's plan, or every chat in the open workspace that has an unfinished plan.
  scope: "open" | "workspace";
  startFolded: boolean;
  hideCompleted: boolean;
  // At most this many steps listed; null lists them all.
  maxSteps: number | null;
  progress: boolean;
}

export const DEFAULT_DONE_SECONDS = 8;

export function stepsOptions(saved: StepsSettings | undefined): StepsOptions {
  return {
    show: saved?.show ?? "unfinished",
    doneSeconds: saved?.doneSeconds ?? DEFAULT_DONE_SECONDS,
    position: saved?.position ?? "bottom",
    scope: saved?.scope ?? "open",
    startFolded: saved?.startFolded ?? false,
    hideCompleted: saved?.hideCompleted ?? false,
    maxSteps: saved?.maxSteps ?? null,
    progress: saved?.progress ?? true,
  };
}

// The steps the list draws, and how many it leaves out. Hidden finished steps are not counted as
// left out; the current step is always drawn, even past the limit.
export function listedSteps(steps: readonly Step[], options: Pick<StepsOptions, "hideCompleted" | "maxSteps">): { rows: Step[]; more: number } {
  const open = options.hideCompleted ? steps.filter((step) => step.status !== "completed") : [...steps];
  if (options.maxSteps === null || open.length <= options.maxSteps) return { rows: open, more: 0 };
  const current = open.findIndex((step) => step.status === "in_progress");
  const start = current < 0 ? 0 : Math.min(Math.max(0, current - 1), open.length - options.maxSteps);
  const rows = open.slice(start, start + options.maxSteps);
  return { rows, more: open.length - rows.length };
}
