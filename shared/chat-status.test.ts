import { describe, expect, it } from "vitest";
import { chatIndicator, isSidebarChat, parentFromLabels } from "./chat-status";

const chat = (overrides: Partial<Parameters<typeof chatIndicator>[0]> = {}) => ({
  status: "idle" as const,
  requiresAttention: false,
  attentionReason: null,
  ...overrides,
});

describe("chatIndicator", () => {
  it("maps a chat to Paseo's five statuses", () => {
    expect(chatIndicator(chat({ requiresAttention: true, attentionReason: "permission", status: "running" }))).toBe("needs_input");
    expect(chatIndicator(chat({ requiresAttention: true, attentionReason: "error" }))).toBe("failed");
    // An error already seen is no longer failed, as in Paseo.
    expect(chatIndicator(chat({ status: "error" }))).toBe("done");
    expect(chatIndicator(chat({ status: "running" }))).toBe("running");
    expect(chatIndicator(chat({ status: "initializing" }))).toBe("running");
    expect(chatIndicator(chat({ requiresAttention: true, attentionReason: "finished" }))).toBe("attention");
    expect(chatIndicator(chat())).toBe("done");
  });
});

describe("chatIndicator follows Paseo's own status rule", () => {
  it("waits on a pending permission, fails only on an unseen error, and is done once seen", () => {
    expect(chatIndicator({ status: "running", requiresAttention: false, attentionReason: null, pendingPermissionCount: 1 })).toBe("needs_input");
    expect(chatIndicator({ status: "error", requiresAttention: true, attentionReason: "error" })).toBe("failed");
    expect(chatIndicator({ status: "error", requiresAttention: false, attentionReason: "error" })).toBe("done");
    expect(chatIndicator({ status: "idle", requiresAttention: true, attentionReason: "finished" })).toBe("attention");
    expect(chatIndicator({ status: "closed", requiresAttention: false, attentionReason: null })).toBe("done");
  });

  it("reads a sub-agent's parent from its label", () => {
    expect(parentFromLabels({ "paseo.parent-agent-id": " boss " })).toBe("boss");
    expect(parentFromLabels({})).toBeNull();
    expect(parentFromLabels(null)).toBeNull();
  });
});

describe("isSidebarChat", () => {
  it("lists every top-level chat, closed ones too, and no sub-agents", () => {
    expect(isSidebarChat({ parentAgentId: null })).toBe(true);
    expect(isSidebarChat({ parentAgentId: "parent" })).toBe(false);
  });
});

import { chatGroupKey, chatMatches, compareChats } from "./chat-status";
import { profileSchema } from "./profile";

type View = ReturnType<typeof profileSchema.parse>["sidebar"]["view"];
const view = (overrides: Partial<View> = {}): View => ({ ...profileSchema.parse({}).sidebar.view, ...overrides });
const listed = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: id,
  provider: "claude",
  workspaceId: "w1",
  status: "idle" as const,
  requiresAttention: false,
  attentionReason: null,
  lastActivityAt: "2026-11-11T10:00:00Z",
  parentAgentId: null,
  ...overrides,
});

describe("chat rules", () => {
  const items = [
    listed("done-new", { lastActivityAt: "2026-11-11T12:00:00Z" }),
    listed("running", { status: "running" }),
    listed("needs", { requiresAttention: true, attentionReason: "permission" }),
  ];

  it("sorts chats by status order, then by latest activity", () => {
    expect([...items].sort(compareChats(view({ orderBy: "status" }))).map((chat) => chat.id)).toEqual(["needs", "running", "done-new"]);
    expect([...items].sort(compareChats(view({ orderBy: "activity" })))[0].id).toBe("done-new");
  });

  it("filters chats by the status chips and by title search", () => {
    expect(items.filter((chat) => chatMatches(chat, { statuses: ["running"], search: "" })).map((chat) => chat.id)).toEqual(["running"]);
    expect(items.filter((chat) => chatMatches(chat, { statuses: [], search: "NEE" })).map((chat) => chat.id)).toEqual(["needs"]);
  });

  it("groups chats by status, or by their workspace for project and label grouping", () => {
    expect(chatGroupKey(view({ groupBy: "status" }), items[2])).toEqual({ key: "status:needs_input", title: "Needs permission" });
    expect(chatGroupKey(view({ groupBy: "project" }), items[0])).toEqual({ key: "workspace:w1", title: "w1" });
  });
});
