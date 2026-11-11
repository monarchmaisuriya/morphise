import { describe, expect, it } from "vitest";
import { reduceChats } from "./chats";

const agent = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspaceId: "w1",
  title: `Chat ${id}`,
  provider: "claude",
  status: "idle",
  requiresAttention: false,
  attentionReason: null,
  parentAgentId: null,
  ...extra,
});
const upsert = (value: ReturnType<typeof agent>) => ({ message: { type: "agent_update", payload: { kind: "upsert", agent: value } } });

describe("reduceChats", () => {
  it("keeps each open chat's title, workspace and status from a snapshot, without reporting changes", () => {
    const { chats, transitions } = reduceChats(new Map(), { snapshot: [{ agent: agent("a") }, { agent: agent("b", { status: "closed" }) }] });
    expect([...chats]).toEqual([["a", { title: "Chat a", workspaceId: "w1", indicator: "done" }]]);
    expect(transitions).toEqual([]);
  });

  it("reports a chat entering a new status", () => {
    const start = reduceChats(new Map(), { snapshot: [{ agent: agent("a") }] }).chats;
    const { transitions } = reduceChats(start, upsert(agent("a", { requiresAttention: true, attentionReason: "permission" })));
    expect(transitions).toEqual([{ agentId: "a", to: "needs_input" }]);
  });

  it("returns the same map and no transitions when nothing it tracks changed", () => {
    const start = reduceChats(new Map(), { snapshot: [{ agent: agent("a") }] }).chats;
    const next = reduceChats(start, upsert(agent("a")));
    expect(next.chats).toBe(start);
    expect(next.transitions).toEqual([]);
  });

  it("forgets a removed chat", () => {
    const start = reduceChats(new Map(), { snapshot: [{ agent: agent("a") }] }).chats;
    expect(reduceChats(start, { message: { type: "agent_update", payload: { kind: "remove", agentId: "a" } } }).chats.size).toBe(0);
  });
});
