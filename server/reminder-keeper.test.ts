import { describe, expect, it, vi } from "vitest";
import { REMINDER_KEY, REMINDER_ROW_KEY } from "../shared/reminders";
import { createReminderKeeper, type KeeperPaseo } from "./reminder-keeper";

type Metadata = Record<string, unknown>;

// A fake daemon: agents with metadata, and a log of appended rows and metadata writes.
function fakeDaemon(agents: Record<string, Metadata>) {
  const appended: { agentId: string; id: string; data: unknown }[] = [];
  const writes: { agentId: string; patch: Metadata }[] = [];
  const paseo: KeeperPaseo = {
    agents: {
      list: async () => ({ entries: Object.entries(agents).map(([id, metadata]) => ({ agent: { id, metadata, archivedAt: null } })) }),
      ref: (agentId: string) => ({
        refresh: async () => (agentId in agents ? { agent: { id: agentId, metadata: agents[agentId], archivedAt: null } } : null),
        setMetadata: async (patch: Metadata) => {
          writes.push({ agentId, patch });
          const next = { ...agents[agentId] };
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) delete next[key];
            else next[key] = value;
          }
          agents[agentId] = next;
        },
        timeline: {
          append: async (item: { id: string; data: unknown }) => {
            appended.push({ agentId, id: item.id, data: item.data });
            return { seq: appended.length, epoch: "e" };
          },
        },
      }),
    },
  };
  return { paseo, agents, appended, writes };
}

// Timers the test fires by hand, in due order.
function fakeClock(start: string) {
  let now = new Date(start);
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    now: () => now,
    setTimer: (run: () => void, delay: number) => {
      const id = next++;
      timers.set(id, { at: now.getTime() + delay, run });
      return id;
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
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const reminder = { at: "2026-11-11T14:45:00.000Z", setAt: "2026-11-11T14:30:00.000Z" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function connect(keeper: ReturnType<typeof createReminderKeeper>, paseo: KeeperPaseo) {
  const controller = new AbortController();
  void keeper.watch({}, { paseo, signal: controller.signal, push: async () => {} });
  return () => controller.abort();
}

describe("reminder keeper", () => {
  it("writes one chat row when a reminder becomes due, and records it in its own key", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T14:30:00Z");
    const keeper = createReminderKeeper(clock);
    connect(keeper, daemon.paseo);
    await flush();
    expect(daemon.appended).toEqual([]);
    await clock.advanceTo("2026-11-11T14:45:00Z");
    await flush();
    expect(daemon.appended).toEqual([{ agentId: "a1", id: `reminder-${Date.parse(reminder.setAt)}`, data: reminder }]);
    expect(daemon.writes).toEqual([{ agentId: "a1", patch: { [REMINDER_ROW_KEY]: reminder.setAt } }]);
    expect(daemon.agents.a1[REMINDER_KEY]).toEqual(reminder);
  });

  it("catches up on reminders that came due while no app was connected, once", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T15:00:00Z");
    const keeper = createReminderKeeper(clock);
    const leave = connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T15:00:00Z");
    leave();
    connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T15:01:00Z");
    expect(daemon.appended).toHaveLength(1);
  });

  it("leaves a reminder that was marked done before it fired", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T14:30:00Z");
    const keeper = createReminderKeeper(clock);
    connect(keeper, daemon.paseo);
    await flush();
    delete daemon.agents.a1[REMINDER_KEY];
    await clock.advanceTo("2026-11-11T14:45:00Z");
    await flush();
    expect(daemon.appended).toEqual([]);
    expect(daemon.writes).toEqual([]);
  });

  it("never writes the reminder key, so Done pressed while it fires stays done", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T14:30:00Z");
    const keeper = createReminderKeeper(clock);
    connect(keeper, daemon.paseo);
    await flush();
    const append = daemon.paseo.agents.ref("a1").timeline.append;
    // Done lands between the append and the daemon's own write.
    daemon.paseo.agents.ref = ((original) => (agentId: string) => {
      const handle = original(agentId);
      return {
        ...handle,
        timeline: {
          append: async (item: Parameters<typeof append>[0]) => {
            const result = await handle.timeline.append(item);
            delete daemon.agents.a1[REMINDER_KEY];
            return result;
          },
        },
      };
    })(daemon.paseo.agents.ref);
    await clock.advanceTo("2026-11-11T14:45:00Z");
    await flush();
    expect(daemon.agents.a1[REMINDER_KEY]).toBeUndefined();
    expect(daemon.writes.every((write) => !(REMINDER_KEY in write.patch))).toBe(true);
  });

  it("keeps a new reminder set while the old one fires, and arms it after an explicit re-arm", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T14:30:00Z");
    const keeper = createReminderKeeper(clock);
    connect(keeper, daemon.paseo);
    await flush();
    const fresh = { at: "2026-11-11T15:45:00.000Z", setAt: "2026-11-11T14:44:00.000Z" };
    daemon.agents.a1[REMINDER_KEY] = fresh;
    await clock.advanceTo("2026-11-11T14:45:00Z");
    await flush();
    expect(daemon.appended).toEqual([]);
    expect(daemon.agents.a1[REMINDER_KEY]).toEqual(fresh);
    await keeper.arm({ agentId: "a1" }, { paseo: daemon.paseo });
    await clock.advanceTo("2026-11-11T15:45:00Z");
    await flush();
    expect(daemon.appended.map((row) => row.data)).toEqual([fresh]);
  });

  it("holds a due row until an app connects when none is connected at the due time", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T14:30:00Z");
    const keeper = createReminderKeeper(clock);
    const leave = connect(keeper, daemon.paseo);
    await flush();
    leave();
    await clock.advanceTo("2026-11-11T14:45:00Z");
    await flush();
    expect(daemon.appended).toEqual([]);
    connect(keeper, daemon.paseo);
    await flush();
    await clock.advanceTo("2026-11-11T14:46:00Z");
    expect(daemon.appended).toHaveLength(1);
  });

  it("stops every timer when the plugin stops", async () => {
    const daemon = fakeDaemon({ a1: { [REMINDER_KEY]: reminder } });
    const clock = fakeClock("2026-11-11T14:30:00Z");
    const keeper = createReminderKeeper(clock);
    connect(keeper, daemon.paseo);
    await flush();
    expect(clock.pending()).toBe(1);
    keeper.dispose();
    expect(clock.pending()).toBe(0);
    vi.useRealTimers();
  });
});
