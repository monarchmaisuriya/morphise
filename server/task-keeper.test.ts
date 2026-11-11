import { describe, expect, it } from "vitest";
import { REMINDER_ROW_KEY, REMINDER_ROWS_KEY } from "../shared/reminders";
import { applyTaskOperation, type TaskOperation } from "../shared/task-ops";
import { EMPTY_TASKS, type TaskDocument } from "../shared/tasks";
import type { SettingsState } from "./settings-watch";
import { createTaskKeeper, type KeeperPaseo } from "./task-keeper";

const start = new Date("2026-11-11T14:30:00.000Z");
const reminder = { at: "2026-11-11T14:45:00.000Z", setAt: "2026-11-11T14:30:00.000Z", note: "check CI" };

function fakeSettings(initial: TaskDocument) {
  let state: SettingsState<TaskDocument> = { status: "ready", revision: "r1", values: initial };
  const listeners = new Set<(state: SettingsState<TaskDocument>) => void>();
  return {
    settings: {
      read: async () => state,
      subscribe(listener: (state: SettingsState<TaskDocument>) => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    save(document: TaskDocument) {
      state = { status: "ready", revision: `r${Math.random()}`, values: document };
      listeners.forEach((listener) => listener(state));
    },
    current: () => (state.status === "ready" ? state.values : EMPTY_TASKS),
  };
}

function fakeDaemon() {
  const metadata: Record<string, Record<string, unknown>> = {};
  const appended: { agentId: string; id: string; data: unknown }[] = [];
  const paseo: KeeperPaseo = {
    agents: {
      ref: (agentId: string) => ({
        refresh: async () => ({ agent: { metadata: metadata[agentId] ?? {} } }),
        setMetadata: async (patch) => void (metadata[agentId] = { ...metadata[agentId], ...patch }),
        timeline: { append: async (item) => void appended.push({ agentId, id: item.id, data: item.data }) },
      }),
    },
  };
  return { paseo, metadata, appended };
}

function fakeClock() {
  let now = new Date(start);
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    now: () => now,
    setTimer: (run: () => void, delay: number) => {
      timers.set(next, { at: now.getTime() + delay, run });
      return next++;
    },
    clearTimer: (id: unknown) => void timers.delete(id as number),
    pending: () => timers.size,
    async advanceTo(time: string) {
      now = new Date(time);
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now.getTime()) {
          timers.delete(id);
          timer.run();
        }
      }
      await flush();
    },
  };
}

const flush = async () => {
  for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const withTask = (operation: Partial<Extract<TaskOperation, { kind: "addTask" }>["task"]> = {}) =>
  applyTaskOperation(EMPTY_TASKS, { kind: "addTask", task: { id: "t1", title: "Fix login", column: "todo", reminder, links: { agentId: "chat-1" }, ...operation } }, start);

function connect(keeper: ReturnType<typeof createTaskKeeper>, paseo: KeeperPaseo) {
  const controller = new AbortController();
  keeper.watch({}, { paseo, signal: controller.signal });
  return () => controller.abort();
}

describe("task keeper", () => {
  it("writes one chat row when a linked task's reminder comes due, marking that task in the chat's own key", async () => {
    const store = fakeSettings(withTask());
    const daemon = fakeDaemon();
    const clock = fakeClock();
    const keeper = createTaskKeeper(store.settings, clock);
    connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T14:45:00.000Z");
    expect(daemon.appended).toEqual([{ agentId: "chat-1", id: `reminder-t1-${Date.parse(reminder.setAt)}`, data: { taskId: "t1", title: "Fix login", ...reminder } }]);
    expect(daemon.metadata["chat-1"][REMINDER_ROWS_KEY]).toEqual({ t1: reminder.setAt });
  });

  it("writes nothing for tasks without a chat, done tasks, or a reminder changed before it fired", async () => {
    const store = fakeSettings(withTask({ links: {} }));
    const daemon = fakeDaemon();
    const clock = fakeClock();
    const keeper = createTaskKeeper(store.settings, clock);
    connect(keeper, daemon.paseo);
    await flush();
    store.save(withTask());
    await flush();
    store.save(applyTaskOperation(withTask(), { kind: "setReminder", id: "t1", reminder: { ...reminder, at: "2026-11-11T16:00:00.000Z", setAt: "2026-11-11T14:31:00.000Z" } }, start));
    await flush();
    await clock.advanceTo("2026-11-11T14:45:00.000Z");
    expect(daemon.appended).toEqual([]);
    store.save(applyTaskOperation(store.current(), { kind: "moveTask", id: "t1", column: "done" }, start));
    await flush();
    await clock.advanceTo("2026-11-11T16:00:00.000Z");
    expect(daemon.appended).toEqual([]);
  });

  it("holds a due row until an app connects, then writes it once", async () => {
    const store = fakeSettings(withTask());
    const daemon = fakeDaemon();
    const clock = fakeClock();
    const keeper = createTaskKeeper(store.settings, clock);
    await flush();
    await clock.advanceTo("2026-11-11T14:50:00.000Z");
    expect(daemon.appended).toEqual([]);
    const leave = connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T14:51:00.000Z");
    leave();
    connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T14:52:00.000Z");
    expect(daemon.appended).toHaveLength(1);
  });

  it("writes one row per task when two tasks of one chat come due, however often the board changes after", async () => {
    const second = applyTaskOperation(withTask(), { kind: "addTask", task: { id: "t2", title: "Deploy", column: "todo", reminder: { at: "2026-11-11T14:50:00.000Z", setAt: start.toISOString() }, links: { agentId: "chat-1" } } }, start);
    const store = fakeSettings(second);
    const daemon = fakeDaemon();
    const clock = fakeClock();
    const keeper = createTaskKeeper(store.settings, clock);
    connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T14:50:00.000Z");
    for (const title of ["one", "two", "three"]) {
      store.save(applyTaskOperation(store.current(), { kind: "addTask", task: { id: title, title, column: "todo" } }, start));
      await flush();
      await clock.advanceTo("2026-11-11T14:51:00.000Z");
    }
    expect(daemon.appended.map((row) => row.id)).toEqual([`reminder-t1-${Date.parse(start.toISOString())}`, `reminder-t2-${Date.parse(start.toISOString())}`]);
  });

  it("does not write again for a reminder moved from 0.2 whose row 0.2 already wrote", async () => {
    const store = fakeSettings(withTask({ id: "migrated-chat-1-1" }));
    const daemon = fakeDaemon();
    daemon.metadata["chat-1"] = { [REMINDER_ROW_KEY]: reminder.setAt };
    const clock = fakeClock();
    const keeper = createTaskKeeper(store.settings, clock);
    connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T14:46:00.000Z");
    expect(daemon.appended).toEqual([]);
  });

  it("stops its timers and stops watching when the plugin stops", async () => {
    const store = fakeSettings(withTask());
    const clock = fakeClock();
    const keeper = createTaskKeeper(store.settings, clock);
    await flush();
    expect(clock.pending()).toBe(1);
    keeper.dispose();
    expect(clock.pending()).toBe(0);
  });
});
