import { describe, expect, it, vi } from "vitest";
import { applyTaskOperation } from "../shared/task-ops";
import { EMPTY_TASKS } from "../shared/tasks";
import { type AlertEntry, dueSince, remindersOf, startReminderAlerts } from "./reminder-alerts";
import { createValueStore } from "./profile-store";

const entry = (taskId: string, at: string, setAt = "2026-11-11T14:00:00.000Z"): AlertEntry => ({ taskId, title: taskId, agentId: null, reminder: { at, setAt } });

describe("remindersOf", () => {
  it("lists reminders of open tasks only", () => {
    const now = new Date("2026-11-11T14:00:00.000Z");
    const reminder = { at: "2026-11-11T15:00:00.000Z", setAt: now.toISOString() };
    let document = applyTaskOperation(EMPTY_TASKS, { kind: "addTask", task: { id: "open", title: "Open", reminder, links: { agentId: "c1" } } }, now);
    document = applyTaskOperation(document, { kind: "addTask", task: { id: "done", title: "Done", column: "done", reminder } }, now);
    document = applyTaskOperation(document, { kind: "addTask", task: { id: "old", title: "Old", reminder } }, now);
    document = applyTaskOperation(document, { kind: "archiveTask", id: "old" }, now);
    expect(remindersOf(document)).toEqual([{ taskId: "open", title: "Open", agentId: "c1", reminder }]);
  });
});

describe("dueSince", () => {
  const started = new Date("2026-11-11T14:10:00Z");
  const now = new Date("2026-11-11T14:30:00Z");
  const entries = [entry("before-start", "2026-11-11T14:05:00.000Z"), entry("while-open", "2026-11-11T14:20:00.000Z"), entry("future", "2026-11-11T15:00:00.000Z")];

  it("alerts only reminders that came due while this app was open, each once", () => {
    const alerted = new Set<string>();
    expect(dueSince(entries, started, now, alerted).map((item) => item.taskId)).toEqual(["while-open"]);
    expect(dueSince(entries, started, now, alerted)).toEqual([]);
  });

  it("alerts again for a new reminder on the same task", () => {
    const alerted = new Set<string>();
    dueSince(entries, started, now, alerted);
    expect(dueSince([entry("while-open", "2026-11-11T14:25:00.000Z", "2026-11-11T14:21:00.000Z")], started, now, alerted).map((item) => item.taskId)).toEqual(["while-open"]);
  });
});

describe("startReminderAlerts", () => {
  it("keeps alerting when one way of alerting throws", () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.setSystemTime(new Date("2026-11-11T14:00:00Z"));
    const store = createValueStore<AlertEntry[]>([entry("a1", "2026-11-11T14:01:00.000Z")]);
    const announced: string[] = [];
    const stop = startReminderAlerts(store, {
      chime: () => {},
      notify: () => {
        throw new Error("Illegal constructor");
      },
      announce: (entries) => entries.forEach((item) => announced.push(item.taskId)),
    });
    vi.advanceTimersByTime(61_000);
    store.set([entry("a2", "2026-11-11T14:02:00.000Z")]);
    vi.advanceTimersByTime(61_000);
    expect(announced).toEqual(["a1", "a2"]);
    expect(errors).toHaveBeenCalled();
    stop();
    errors.mockRestore();
    vi.useRealTimers();
  });
});
