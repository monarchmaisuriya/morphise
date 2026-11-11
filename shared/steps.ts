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

// What the card shows: the plan while it has unfinished steps, "all done" right after it finishes,
// and nothing otherwise (no plan, an empty plan, or a finished plan once the moment has passed).
export function cardMode(steps: readonly Step[] | null, finishedRecently: boolean): "plan" | "done" | "hidden" {
  if (!steps || steps.length === 0) return "hidden";
  if (steps.some((step) => step.status !== "completed")) return "plan";
  return finishedRecently ? "done" : "hidden";
}
