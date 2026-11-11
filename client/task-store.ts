import { applyTaskOperation, type TaskOperation } from "../shared/task-ops";
import { EMPTY_TASKS, type TaskDocument, taskDocumentSchema } from "../shared/tasks";
import type { TasksEvent } from "../shared/watch";
import type { StreamStore } from "./profile-connection";
import { createValueStore } from "./profile-store";

// The task document as this app last received it, kept apart from the stream's health.
export type TaskStore = StreamStore<TasksEvent>;

export function createTaskStore(): TaskStore {
  return createValueStore<{ event: TasksEvent | null; connectionError: string | null }>({ event: null, connectionError: null });
}

export function tasksOf(state: ReturnType<TaskStore["get"]>): TaskDocument {
  return state.event?.status === "ready" ? state.event.document : EMPTY_TASKS;
}

type ReadResult = { status: "ready"; revision: string; values: unknown } | { status: "invalid"; revision: string; error: string };
type WriteResult = { status: "saved"; revision: string; values: unknown } | { status: "conflict"; error: string } | { status: "invalid"; error: string };

// The settings RPCs for the task document, as the writer needs them.
export interface SettingsCalls {
  read(): Promise<ReadResult>;
  write(input: { revision: string; values: TaskDocument }): Promise<WriteResult>;
}

export type ApplyTaskOperations = (...operations: TaskOperation[]) => Promise<TaskDocument>;

const ATTEMPTS = 3;

// Applies operations to the newest stored document and saves with its revision. When another
// app saved first, the same operations are applied again to the newer document, so both
// changes survive; an operation the document refuses rejects with the reason, saving nothing.
export function createTaskWriter(calls: SettingsCalls, now: () => Date = () => new Date()): ApplyTaskOperations {
  return async (...operations) => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const state = await calls.read();
      if (state.status !== "ready") throw new Error(`The stored task list is invalid: ${state.error}`);
      const base = taskDocumentSchema.parse(state.values);
      const next = operations.reduce((document, operation) => applyTaskOperation(document, operation, now()), base);
      const result = await calls.write({ revision: state.revision, values: next });
      if (result.status === "saved") return next;
      if (result.status === "invalid") throw new Error(result.error);
    }
    throw new Error("Other apps kept changing the tasks at the same moment; try again");
  };
}
