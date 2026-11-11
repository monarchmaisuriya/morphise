import { describe, expect, it } from "vitest";
import { REMINDER_KEY } from "../shared/reminders";
import { legacyReminders } from "./reminders";

const reminder = { at: "2026-11-11T14:45:00.000Z", setAt: "2026-11-11T14:30:00.000Z" };

describe("legacyReminders", () => {
  it("finds 0.2 chat reminders still stored on chats, with the chat's title and workspace", () => {
    const entries = [
      { agent: { id: "a1", workspaceId: "w1", title: "Fix login", metadata: { [REMINDER_KEY]: reminder } } },
      { agent: { id: "a2", workspaceId: "w1", title: null, metadata: {} } },
      { agent: { id: "a3", workspaceId: "w2", title: null, provider: "claude", metadata: { [REMINDER_KEY]: { at: "soon" } } } },
    ];
    expect(legacyReminders(entries)).toEqual([{ agentId: "a1", workspaceId: "w1", title: "Fix login", reminder }]);
  });
});
