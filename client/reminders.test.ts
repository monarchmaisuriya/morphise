import { describe, expect, it } from "vitest";
import { REMINDER_KEY } from "../shared/reminders";
import { reduceReminders } from "./reminders";

const reminder = { at: "2026-11-11T14:45:00.000Z", setAt: "2026-11-11T14:30:00.000Z" };
const agent = (id: string, metadata: unknown, extra: Record<string, unknown> = {}) => ({ agent: { id, workspaceId: "w1", title: "Fix login", metadata, archivedAt: null, ...extra } });
const upsert = (entry: ReturnType<typeof agent>) => ({ message: { type: "agent_update", payload: { kind: "upsert", agent: entry.agent } } });

describe("reduceReminders", () => {
  it("keeps the reminders found in a snapshot, with the chat's workspace and title", () => {
    const next = reduceReminders(new Map(), { snapshot: [agent("a1", { [REMINDER_KEY]: reminder }), agent("a2", {})] });
    expect([...next]).toEqual([["a1", { agentId: "a1", workspaceId: "w1", title: "Fix login", reminder }]]);
  });

  it("skips archived chats", () => {
    const next = reduceReminders(new Map(), { snapshot: [agent("a1", { [REMINDER_KEY]: reminder }, { archivedAt: "2026-11-11T10:00:00Z" })] });
    expect(next.size).toBe(0);
  });

  it("adds, changes and drops a reminder from agent updates, and forgets removed agents", () => {
    let state = reduceReminders(new Map(), upsert(agent("a1", { [REMINDER_KEY]: reminder })));
    expect(state.get("a1")?.reminder).toEqual(reminder);
    state = reduceReminders(state, upsert(agent("a1", {})));
    expect(state.size).toBe(0);
    state = reduceReminders(new Map([["a1", { agentId: "a1", workspaceId: "w1", title: null, reminder }]]), {
      message: { type: "agent_update", payload: { kind: "remove", agentId: "a1" } },
    });
    expect(state.size).toBe(0);
  });

  it("returns the same map when nothing it tracks changed", () => {
    const state = reduceReminders(new Map(), { snapshot: [agent("a1", { [REMINDER_KEY]: reminder })] });
    expect(reduceReminders(state, upsert(agent("a1", { [REMINDER_KEY]: reminder })))).toBe(state);
    expect(reduceReminders(state, upsert(agent("a2", {})))).toBe(state);
    expect(reduceReminders(state, { message: { type: "workspace_update", payload: {} } })).toBe(state);
  });
});
