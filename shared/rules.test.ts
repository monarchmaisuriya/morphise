import { describe, expect, it } from "vitest";
import { archiveOldDone, rulesForTransitions } from "./rules";
import { applyTaskOperation, type TaskOperation } from "./task-ops";
import { EMPTY_TASKS, type TaskDocument } from "./tasks";

const now = new Date("2026-11-11T14:30:00.000Z");
const build = (...operations: TaskOperation[]): TaskDocument => operations.reduce((document, operation) => applyTaskOperation(document, operation, now), EMPTY_TASKS);
const rule: TaskOperation = { kind: "saveRule", rule: { id: "r", enabled: true, when: { kind: "chat-status", status: "needs_input" }, then: { kind: "move", column: "review" } } };

describe("rulesForTransitions", () => {
  const document = build(rule, { kind: "addTask", task: { id: "a", title: "A", column: "todo", links: { agentId: "chat-1" } } }, { kind: "addTask", task: { id: "b", title: "B", column: "todo" } });

  it("moves cards linked to a chat that just entered the rule's status", () => {
    expect(rulesForTransitions(document, [{ agentId: "chat-1", to: "needs_input" }])).toEqual([{ kind: "moveTask", id: "a", column: "review" }]);
  });

  it("does nothing for other statuses, unlinked cards, disabled rules, or cards already there", () => {
    expect(rulesForTransitions(document, [{ agentId: "chat-1", to: "failed" }])).toEqual([]);
    const disabled = applyTaskOperation(document, { kind: "saveRule", rule: { id: "r", enabled: false, when: { kind: "chat-status", status: "needs_input" }, then: { kind: "move", column: "review" } } }, now);
    expect(rulesForTransitions(disabled, [{ agentId: "chat-1", to: "needs_input" }])).toEqual([]);
    const moved = applyTaskOperation(document, { kind: "moveTask", id: "a", column: "review" }, now);
    expect(rulesForTransitions(moved, [{ agentId: "chat-1", to: "needs_input" }])).toEqual([]);
  });

  it("leaves cards in Done where they are", () => {
    const finished = applyTaskOperation(document, { kind: "moveTask", id: "a", column: "done" }, now);
    expect(rulesForTransitions(finished, [{ agentId: "chat-1", to: "needs_input" }])).toEqual([]);
  });

  it("gives the same result when applied twice, so several open apps agree", () => {
    const once = rulesForTransitions(document, [{ agentId: "chat-1", to: "needs_input" }]).reduce((current, operation) => applyTaskOperation(current, operation, now), document);
    expect(rulesForTransitions(once, [{ agentId: "chat-1", to: "needs_input" }])).toEqual([]);
  });
});

describe("archiveOldDone", () => {
  it("archives Done cards completed more than the set days ago, only when switched on", () => {
    const old = new Date("2026-11-01T10:00:00.000Z");
    const document = [{ kind: "addTask", task: { id: "a", title: "A", column: "done" } } as TaskOperation, { kind: "addTask", task: { id: "b", title: "B", column: "done" } } as TaskOperation]
      .reduce((current, operation, index) => applyTaskOperation(current, operation, index === 0 ? old : now), EMPTY_TASKS);
    expect(archiveOldDone(document, now)).toEqual([]);
    const on = applyTaskOperation(document, { kind: "setArchiveDone", enabled: true, days: 7 }, now);
    expect(archiveOldDone(on, now)).toEqual([{ kind: "archiveDoneBefore", cutoff: "2026-11-04T14:30:00.000Z" }]);
    const archived = applyTaskOperation(on, archiveOldDone(on, now)[0], now);
    expect(archived.tasks.map((task) => [task.id, task.archivedAt])).toEqual([["a", now.toISOString()], ["b", null]]);
  });

  it("checks the newest list when archiving, so a card moved out of Done meanwhile stays", () => {
    const old = new Date("2026-11-01T10:00:00.000Z");
    let document = applyTaskOperation(EMPTY_TASKS, { kind: "addTask", task: { id: "a", title: "A", column: "done" } }, old);
    document = applyTaskOperation(document, { kind: "setArchiveDone", enabled: true, days: 7 }, now);
    const [operation] = archiveOldDone(document, now);
    const moved = applyTaskOperation(document, { kind: "moveTask", id: "a", column: "todo" }, now);
    expect(applyTaskOperation(moved, operation, now).tasks[0].archivedAt).toBeNull();
  });

  it("does not archive a restored Done card again straight away", () => {
    const old = new Date("2026-11-01T10:00:00.000Z");
    let document = applyTaskOperation(EMPTY_TASKS, { kind: "addTask", task: { id: "a", title: "A", column: "done" } }, old);
    document = applyTaskOperation(document, { kind: "setArchiveDone", enabled: true, days: 7 }, now);
    document = applyTaskOperation(document, archiveOldDone(document, now)[0], now);
    document = applyTaskOperation(document, { kind: "restoreTask", id: "a" }, now);
    expect(archiveOldDone(document, now)).toEqual([]);
  });
});
