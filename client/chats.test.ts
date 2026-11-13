import { describe, expect, it } from "vitest";
import { chatForWorkspace, reduceChats } from "./chats";

const agent = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspaceId: "w1",
  title: `Chat ${id}`,
  provider: "claude",
  status: "idle",
  requiresAttention: false,
  attentionReason: null,
  // Shaped like Paseo's daemon agent records: the parent is a label.
  labels: {} as Record<string, string>,
  pendingPermissions: [] as unknown[],
  ...extra,
});
const upsert = (value: ReturnType<typeof agent>) => ({ message: { type: "agent_update", payload: { kind: "upsert", agent: value } } });

describe("reduceChats", () => {
  it("leaves sub-agents out by their parent label, and waits on a pending permission", () => {
    const { chats } = reduceChats(new Map(), {
      snapshot: [{ agent: agent("sub", { labels: { "paseo.parent-agent-id": "boss" } }) }, { agent: agent("top", { status: "running", pendingPermissions: [{ id: "p1" }] }) }],
    });
    expect([...chats.keys()]).toEqual(["top"]);
    expect(chats.get("top")?.indicator).toBe("needs_input");
  });

  it("keeps the chat's provider and model as Paseo's agent config writes them", () => {
    const { chats } = reduceChats(new Map(), { snapshot: [{ agent: agent("a", { model: "opus" }) }] });
    expect(chats.get("a")?.model).toBe("claude/opus");
  });

  it("keeps each chat's title, workspace and status from a snapshot, closed ones too, without reporting changes", () => {
    const { chats, transitions } = reduceChats(new Map(), { snapshot: [{ agent: agent("a") }, { agent: agent("b", { status: "closed" }) }] });
    expect([...chats]).toEqual([
      ["a", { title: "Chat a", workspaceId: "w1", indicator: "done", model: "", closed: false }],
      ["b", { title: "Chat b", workspaceId: "w1", indicator: "done", model: "", closed: true }],
    ]);
    expect(transitions).toEqual([]);
  });

  it("reports no status change when a chat closes or reopens, so closing does not look finished", () => {
    const start = reduceChats(new Map(), { snapshot: [{ agent: agent("a", { status: "running" }) }] }).chats;
    const closed = reduceChats(start, upsert(agent("a", { status: "closed" })));
    expect(closed.chats.get("a")?.closed).toBe(true);
    expect(closed.transitions).toEqual([]);
    expect(reduceChats(closed.chats, upsert(agent("a", { status: "running" }))).transitions).toEqual([]);
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

describe("chatForWorkspace", () => {
  const chats = reduceChats(new Map(), {
    snapshot: [{ agent: agent("shut", { status: "closed" }) }, { agent: agent("open") }, { agent: agent("other", { workspaceId: "w2", status: "closed" }) }],
  }).chats;

  it("picks the focused chat, else an open one, else a closed one whose tab can still be open", () => {
    expect(chatForWorkspace(chats, "w1", "shut")).toBe("shut");
    expect(chatForWorkspace(chats, "w1", null)).toBe("open");
    expect(chatForWorkspace(chats, "w2", null)).toBe("other");
    expect(chatForWorkspace(chats, "w3", null)).toBeNull();
  });
});
