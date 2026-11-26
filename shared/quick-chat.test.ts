import { expect, it } from "vitest";
import { QUICK_CHAT_KEY, countedQuickChat, filteredQuickChats, quickChatAgentChange, quickChatHandoffBlock, quickChatTargetMatches, quickChatPreferences, quickChatPrepare, quickChatSettings, quickChatStart, restoredQuickChatModel, visibleQuickChatAgent } from "./quick-chat";

it("requires exactly one existing or new workspace destination", () => {
  expect(quickChatPrepare.input.safeParse({ agentId: "source", workspaceId: "existing" }).success).toBe(true);
  expect(quickChatPrepare.input.safeParse({ agentId: "source", newWorkspace: { projectId: "project", mode: "worktree", baseRef: "main" } }).success).toBe(true);
  expect(quickChatPrepare.input.safeParse({ agentId: "source" }).success).toBe(false);
  expect(quickChatPrepare.input.safeParse({ agentId: "source", workspaceId: "existing", newWorkspace: { projectId: "project", mode: "directory" } }).success).toBe(false);
});

it("finds project workspaces independently of generated worktree names", () => {
  const target = { title: "Scan Slack alert", directory: "/synthetic/worktrees/bright-fox", projectName: "pushowl-support-agent", projectRoot: "/synthetic/pushowl-support-agent" };
  expect(quickChatTargetMatches(target, "support agent")).toBe(true);
  expect(quickChatTargetMatches(target, " SUPPORT-agent ")).toBe(true);
  expect(quickChatTargetMatches(target, "support absent")).toBe(false);
  expect(quickChatTargetMatches(target, "")).toBe(true);
});
it("explains blocked handoffs without relaxing source safety", () => {
  const source = { status: "idle", activeTurn: null, pendingPermissions: [] };
  expect(quickChatHandoffBlock(source)).toBeNull();
  expect(quickChatHandoffBlock({ ...source, status: "running" })).toContain("still replying");
  expect(quickChatHandoffBlock({ ...source, activeTurn: { turnId: "active" } })).toContain("still replying");
  expect(quickChatHandoffBlock({ ...source, pendingPermissions: [{}] })).toContain("permission");
  expect(quickChatHandoffBlock({ ...source, archivedAt: "2026-11-26" })).toContain("Restore");
});

it("counts each owned non-idle Quick Chat once on its own host", () => {
  const base = { hostId: "local", workspaceId: "scratch", parentAgentId: null, metadata: { [QUICK_CHAT_KEY]: true }, status: "idle" as const, requiresAttention: false, attentionReason: null };
  const agents = [{ ...base, status: "running" as const }, { ...base, requiresAttention: true, attentionReason: "finished" as const }, base];
  expect(agents.filter((agent) => countedQuickChat(agent, "local"))).toHaveLength(2);
  expect(countedQuickChat({ ...base, status: "initializing" }, "local")).toBe(true);
  expect(countedQuickChat({ ...base, status: "running", attentionReason: "permission" }, "local")).toBe(true);
  expect(countedQuickChat({ ...base, requiresAttention: true, attentionReason: "error" }, "local")).toBe(true);
  expect(countedQuickChat({ ...base, status: "error" }, "local")).toBe(false);
  expect(countedQuickChat({ ...base, status: "running", archivedAt: "2026-11-25" }, "local")).toBe(false);
  expect(countedQuickChat({ ...base, status: "running", parentAgentId: "parent" }, "local")).toBe(false);
  expect(countedQuickChat({ ...base, status: "running", metadata: {} }, "local")).toBe(false);
  expect(countedQuickChat({ ...base, status: "running", hostId: "remote" }, "local")).toBe(false);
});

it("filters archive/provider/title and sorts dates without invalid timestamp instability", () => {
  const chats = [{ id: "b", title: "Beta", workspaceId: "w", provider: "claude", updatedAt: "invalid" }, { id: "a", title: "Alpha", workspaceId: "w", provider: "codex", updatedAt: "2026-01-01" }, { id: "c", title: "Archived", workspaceId: "w", provider: "claude", archivedAt: "2026-01-01" }];
  expect(filteredQuickChats(chats, { archived: false, query: "", provider: "", sort: "updated" }).map((chat) => chat.id)).toEqual(["a", "b"]);
  expect(filteredQuickChats(chats, { archived: true, query: "arch", provider: "claude", sort: "title" }).map((chat) => chat.id)).toEqual(["c"]);
  expect(filteredQuickChats(chats, { archived: false, query: "", provider: "claude", sort: "created" }).map((chat) => chat.id)).toEqual(["b"]);
});

it("keeps device preferences separate and restores only remembered models", () => {
  expect(quickChatPreferences.schema.parse({})).toEqual({ rememberModel: true, lastModel: "", width: "comfortable", density: "comfortable", showDescriptions: true });
  expect(restoredQuickChatModel(null, { rememberModel: true, lastModel: "claude/example" })).toBe("claude/example");
  expect(restoredQuickChatModel("codex/manual", { rememberModel: true, lastModel: "claude/example" })).toBe("codex/manual");
  expect(restoredQuickChatModel(null, { rememberModel: false, lastModel: "claude/example" })).toBe("");
  expect(() => quickChatPreferences.schema.parse({ lastModel: "x".repeat(301) })).toThrow();
});

it("defaults off and confines workspace operation identifiers", () => {
  expect(quickChatSettings.schema.parse({})).toEqual({ enabled: false });
  expect(quickChatStart.input.parse({ operationId: "t-abc123-xyz", provider: "fake/test" }).operationId).toBe("t-abc123-xyz");
  expect(() => quickChatStart.input.parse({ operationId: "../../bad" })).toThrow();
});
it("includes owned quick chats without leaking hidden helpers into updates", () => {
  expect(visibleQuickChatAgent({ background: false })).toBe(true);
  expect(visibleQuickChatAgent({ background: true })).toBe(false);
  expect(visibleQuickChatAgent({ background: true, metadata: { [QUICK_CHAT_KEY]: true } })).toBe(true);
  expect(visibleQuickChatAgent({ background: true, internal: true, metadata: { [QUICK_CHAT_KEY]: true } })).toBe(false);
  expect(visibleQuickChatAgent({ background: true, labels: { "paseo.parent-agent-id": "parent" }, metadata: { [QUICK_CHAT_KEY]: true } })).toBe(false);
  expect(quickChatAgentChange({ type: "agent_update", payload: { kind: "upsert", agent: { id: "helper", background: true } } })).toEqual({ type: "agent_update", payload: { kind: "remove", agentId: "helper" } });
});
