import { describe, expect, it } from "vitest";
import { clearKeyOf, readBoardAgent } from "../shared/agents-board";
import { clearKey, isCleared } from "../shared/inbox";
import { readAttention, reduceAttention, waitingChildren } from "./attention";

// Shaped like Paseo's daemon agent records: the parent is a label, permission waits are a list.
const agent = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Chat ${id}`, workspaceId: "w1", status: "idle", labels: {}, pendingPermissions: [], requiresAttention: false, attentionReason: null, attentionTimestamp: "2026-11-12T10:00:00Z", ...extra });
const childOf = (parent: string) => ({ labels: { "paseo.parent-agent-id": parent } });
const waiting = { status: "running", pendingPermissions: [{ id: "perm-1" }] };
const upsert = (value: unknown) => ({ message: { type: "agent_update", payload: { kind: "upsert", agent: value } } });

describe("attention", () => {
  it("keeps agents waiting on the user, and only those", () => {
    const list = reduceAttention(new Map(), {
      snapshot: [
        { agent: agent("p", waiting) },
        { agent: agent("e", { status: "error", requiresAttention: true, attentionReason: "error" }) },
        { agent: agent("seenError", { status: "error", attentionReason: "error" }) },
        { agent: agent("f", { requiresAttention: true, attentionReason: "finished" }) },
        { agent: agent("seen", { attentionReason: "finished" }) },
        { agent: agent("arch", { archivedAt: "x", ...waiting }) },
        { agent: agent("bg", { background: true, ...waiting }) },
      ],
    });
    expect([...list.keys()].sort()).toEqual(["e", "f", "p"]);
    expect(list.get("e")?.reason).toBe("failed");
  });

  it("carries the oldest waiting request and the chat's last error, for the Inbox to show", () => {
    const list = reduceAttention(new Map(), {
      snapshot: [
        // Paseo's own notification names the newest request: the last one listed.
        { agent: agent("p", { status: "running", pendingPermissions: [{ id: "r1", name: "Bash", kind: "tool", detail: { type: "shell", command: "ls" } }, { id: "r2", name: "Edit", kind: "tool" }] }) },
        { agent: agent("e", { status: "error", requiresAttention: true, attentionReason: "error", lastError: "Rate limited" }) },
      ],
    });
    expect(list.get("p")).toMatchObject({ permissionCount: 2, permission: { id: "r2", tool: "Edit" }, error: "" });
    expect(list.get("e")).toMatchObject({ permission: null, permissionCount: 0, error: "Rate limited" });
  });

  it("follows updates: an opened chat leaves the list, an unchanged one keeps the same map", () => {
    const start = reduceAttention(new Map(), { snapshot: [{ agent: agent("f", { requiresAttention: true, attentionReason: "finished" }) }] });
    expect(reduceAttention(start, upsert(agent("f", { requiresAttention: true, attentionReason: "finished" })))).toBe(start);
    expect(reduceAttention(start, upsert(agent("f"))).size).toBe(0);
    expect(reduceAttention(start, { message: { type: "agent_update", payload: { kind: "remove", agentId: "f" } } }).size).toBe(0);
  });

  it("orders permission, failures, then finished, newest first, and counts blocked sub-agents", () => {
    const list = reduceAttention(new Map(), {
      snapshot: [
        { agent: agent("f", { requiresAttention: true, attentionReason: "finished", attentionTimestamp: "2026-11-12T12:00:00Z" }) },
        { agent: agent("e1", { status: "error", requiresAttention: true, attentionReason: "error", attentionTimestamp: "2026-11-12T09:00:00Z", ...childOf("boss") }) },
        { agent: agent("e2", { status: "error", requiresAttention: true, attentionReason: "error", attentionTimestamp: "2026-11-12T11:00:00Z" }) },
        { agent: agent("p", { ...waiting, ...childOf("boss") }) },
        { agent: agent("done", { requiresAttention: true, attentionReason: "finished", ...childOf("boss") }) },
      ],
    });
    expect(waitingChildren(list, "boss")).toBe(2);
  });
});

describe("cleared keys", () => {
  // The Workbench count (attention items) and the Agents view (board agents) read the same per-device cleared list,
  // so both must build the same key for one agent record.
  it("are the same from the attention item and the board agent", () => {
    const raw = agent("f", { requiresAttention: true, attentionReason: "finished", attentionTimestamp: "2026-11-12T10:00:00Z" });
    const item = readAttention(raw)?.item;
    const board = readBoardAgent({ agent: raw }, () => undefined);
    expect(item && board).toBeTruthy();
    expect(clearKeyOf(board!)).toBe(clearKey(item!));
    expect(isCleared(item!, new Set([clearKeyOf(board!)!]))).toBe(true);
  });
});
