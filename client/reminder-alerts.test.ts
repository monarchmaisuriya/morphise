import { describe, expect, it } from "vitest";
import { dueSince, startReminderAlerts } from "./reminder-alerts";
import { createValueStore } from "./profile-store";
import type { Reminders } from "./reminders";
import { vi } from "vitest";
import type { ReminderEntry } from "./reminders";

const entry = (agentId: string, at: string): ReminderEntry => ({
  agentId,
  workspaceId: "w1",
  title: agentId,
  reminder: { at, setAt: "2026-11-11T14:00:00.000Z" },
});

describe("dueSince", () => {
  const started = new Date("2026-11-11T14:10:00Z");
  const now = new Date("2026-11-11T14:30:00Z");
  const reminders = new Map([
    ["before-start", entry("before-start", "2026-11-11T14:05:00.000Z")],
    ["while-open", entry("while-open", "2026-11-11T14:20:00.000Z")],
    ["future", entry("future", "2026-11-11T15:00:00.000Z")],
  ]);

  it("alerts only reminders that came due while this app was open, each once", () => {
    const alerted = new Set<string>();
    expect(dueSince(reminders, started, now, alerted).map((item) => item.agentId)).toEqual(["while-open"]);
    expect(dueSince(reminders, started, now, alerted)).toEqual([]);
  });

  it("alerts again for a new reminder on the same chat", () => {
    const alerted = new Set<string>();
    dueSince(reminders, started, now, alerted);
    const renewed = new Map([["while-open", { ...entry("while-open", "2026-11-11T14:25:00.000Z"), reminder: { at: "2026-11-11T14:25:00.000Z", setAt: "2026-11-11T14:21:00.000Z" } }]]);
    expect(dueSince(renewed, started, now, alerted).map((item) => item.agentId)).toEqual(["while-open"]);
  });
});

describe("startReminderAlerts", () => {
  it("keeps alerting when one way of alerting throws", () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const start = new Date("2026-11-11T14:00:00Z");
    vi.setSystemTime(start);
    const store = createValueStore<Reminders>(new Map([["a1", entry("a1", "2026-11-11T14:01:00.000Z")]]));
    const announced: string[] = [];
    const stop = startReminderAlerts(store, {
      chime: () => {},
      notify: () => {
        throw new Error("Illegal constructor");
      },
      announce: (entries) => entries.forEach((item) => announced.push(item.agentId)),
    });
    vi.advanceTimersByTime(61_000);
    store.set(new Map([["a2", entry("a2", "2026-11-11T14:02:00.000Z")]]));
    vi.advanceTimersByTime(61_000);
    expect(announced).toEqual(["a1", "a2"]);
    expect(errors).toHaveBeenCalled();
    stop();
    errors.mockRestore();
    vi.useRealTimers();
  });
});
