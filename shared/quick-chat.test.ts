import { expect, it } from "vitest";
import { QUICK_CHAT_KEY, filteredQuickChats, quickChatAgentChange, quickChatPreferences, quickChatSettings, quickChatStart, restoredQuickChatModel, visibleQuickChatAgent } from "./quick-chat";

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
