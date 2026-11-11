import { describe, expect, it } from "vitest";
import { applyTaskOperation } from "../shared/task-ops";
import { EMPTY_TASKS, type TaskDocument } from "../shared/tasks";
import { createTaskWriter, type SettingsCalls } from "./task-store";

const now = new Date("2026-11-11T14:30:00.000Z");
const add = (id: string) => ({ kind: "addTask" as const, task: { id, title: id, column: "todo" } });

// A fake host: a stored document with a revision, and a hook to simulate another app saving.
function fakeHost(initial: TaskDocument = EMPTY_TASKS) {
  let stored = { revision: "r1", values: initial };
  let beforeWrite: (() => void) | null = null;
  const calls: SettingsCalls = {
    read: async () => ({ status: "ready", ...stored }),
    write: async ({ revision, values }) => {
      beforeWrite?.();
      if (revision !== stored.revision) return { status: "conflict", error: "Revision conflict" };
      stored = { revision: `${stored.revision}+`, values: values as TaskDocument };
      return { status: "saved", revision: stored.revision, values };
    },
  };
  return {
    calls,
    stored: () => stored.values,
    otherAppSaves(change: (document: TaskDocument) => TaskDocument, times = 1) {
      let left = times;
      beforeWrite = () => {
        if (left-- <= 0) return;
        stored = { revision: `${stored.revision}*`, values: change(stored.values) };
      };
    },
  };
}

describe("createTaskWriter", () => {
  it("applies operations to the stored tasks and saves them", async () => {
    const host = fakeHost();
    await createTaskWriter(host.calls, () => now)(add("a"), add("b"));
    expect(host.stored().tasks.map((task) => task.id)).toEqual(["a", "b"]);
  });

  it("re-applies the same operation when another app saved first, so both changes survive", async () => {
    const host = fakeHost();
    host.otherAppSaves((document) => applyTaskOperation(document, add("theirs"), now));
    await createTaskWriter(host.calls, () => now)(add("mine"));
    expect(host.stored().tasks.map((task) => task.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("gives up with a clear message after three conflicts in a row", async () => {
    const host = fakeHost();
    host.otherAppSaves((document) => document, 10);
    await expect(createTaskWriter(host.calls, () => now)(add("a"))).rejects.toThrow("Other apps kept changing the tasks at the same moment; try again");
  });

  it("reports an operation the document refuses, and saves nothing", async () => {
    const host = fakeHost();
    await expect(createTaskWriter(host.calls, () => now)({ kind: "moveTask", id: "missing", column: "done" })).rejects.toThrow('No task has the id "missing"');
    expect(host.stored()).toBe(EMPTY_TASKS);
  });
});
