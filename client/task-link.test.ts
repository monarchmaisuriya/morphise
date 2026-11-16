import { describe, expect, it } from "vitest";
import { applyTaskOperation } from "../shared/task-ops";
import { EMPTY_TASKS } from "../shared/tasks";
import { claimTaskLink, initialEditing, LINK_INSTANCE, nextLinkToken, taskLinkParams } from "./task-link";

const now = new Date("2026-11-16T12:00:00.000Z");
const document = applyTaskOperation(EMPTY_TASKS, { kind: "addTask", task: { id: "t1", title: "Fix trace export" } }, now);
const ready = { event: { status: "ready" as const, revision: "r1", document }, connectionError: null };

describe("task links", () => {
  it("open Tasks on one task with a one-time token", () => {
    expect(taskLinkParams("t1", "abc.1")).toEqual({ view: "tasks", task: "t1", opened: "abc.1" });
  });

  it("make a new token for each tap, from this instance", () => {
    const first = nextLinkToken();
    const second = nextLinkToken();
    expect(first).not.toBe(second);
    expect(first.startsWith(`${LINK_INSTANCE}.`)).toBe(true);
    expect(second.startsWith(`${LINK_INSTANCE}.`)).toBe(true);
  });

  it("are claimed once", () => {
    const used = new Set<string>();
    const params = taskLinkParams("t1", "me.1");
    expect(claimTaskLink(params, "me", used)).toBe("t1");
    expect(claimTaskLink(params, "me", used)).toBeNull();
  });

  it("are refused by another instance (a reload or another host)", () => {
    expect(claimTaskLink(taskLinkParams("t1", "other.1"), "me", new Set())).toBeNull();
    // A prefix of the instance id is not the instance.
    expect(claimTaskLink(taskLinkParams("t1", "m.1"), "me", new Set())).toBeNull();
  });

  it("are refused without a task or a token", () => {
    expect(claimTaskLink({ view: "tasks" }, "me", new Set())).toBeNull();
    expect(claimTaskLink({ view: "tasks", task: "", opened: "me.1" }, "me", new Set())).toBeNull();
    expect(claimTaskLink({ view: "tasks", task: "t1" }, "me", new Set())).toBeNull();
  });
});

describe("initialEditing", () => {
  it("opens a task that is in the document", () => {
    expect(initialEditing(ready, "t1")).toEqual({ kind: "open", target: { kind: "existing", taskId: "t1" } });
  });

  it("says a task is gone only when the document is loaded", () => {
    expect(initialEditing(ready, "missing")).toEqual({ kind: "gone" });
  });

  it("does not know before the document loads or when it is invalid", () => {
    expect(initialEditing({ event: null, connectionError: null }, "t1")).toEqual({ kind: "unknown" });
    expect(initialEditing({ event: null, connectionError: "offline" }, "t1")).toEqual({ kind: "unknown" });
    expect(initialEditing({ event: { status: "invalid", revision: "r1", error: "bad" }, connectionError: null }, "missing")).toEqual({ kind: "unknown" });
  });

  it("keeps using the last loaded document after a connection error", () => {
    expect(initialEditing({ ...ready, connectionError: "offline" }, "t1")).toEqual({ kind: "open", target: { kind: "existing", taskId: "t1" } });
  });
});
