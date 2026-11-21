import { expect, it } from "vitest";
import { QUICK_CHAT_KEY, quickChatAgentChange, quickChatSettings, quickChatStart, visibleQuickChatAgent } from "./quick-chat";

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
