import { expect, it } from "vitest";
import { QUICK_CHAT_KEY, quickChatAgentChange, quickChatPreferences, quickChatSettings, quickChatStart, restoredQuickChatModel, visibleQuickChatAgent } from "./quick-chat";

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
