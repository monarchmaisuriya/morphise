import { expect, it } from "vitest";
import { quickChatInfo } from "./quick-chat-info";

it("shows truthful stored metadata with explicit UTC timestamps", () => {
  expect(quickChatInfo({ id: "chat", workspaceId: "workspace", title: "Full stored title", provider: "claude", archivedAt: null, createdAt: "2026-01-02T03:04:05+02:00", updatedAt: "2026-01-03T00:00:00Z" })).toEqual([
    { label: "Title", value: "Full stored title" },
    { label: "Provider", value: "claude" },
    { label: "State", value: "Active" },
    { label: "Created (UTC)", value: "2026-01-02T01:04:05.000Z" },
    { label: "Updated (UTC)", value: "2026-01-03T00:00:00.000Z" },
    { label: "Chat ID", value: "chat" },
    { label: "Workspace ID", value: "workspace" },
  ]);
});

it("marks absent or invalid metadata unavailable without inventing a date", () => {
  expect(quickChatInfo({ id: "", workspaceId: "", title: "", createdAt: "not-a-date", updatedAt: "" })).toEqual([
    { label: "Title", value: "Unavailable" },
    { label: "Provider", value: "Unavailable" },
    { label: "State", value: "Unavailable" },
    { label: "Created (UTC)", value: "Unavailable" },
    { label: "Updated (UTC)", value: "Unavailable" },
    { label: "Chat ID", value: "Unavailable" },
    { label: "Workspace ID", value: "Unavailable" },
  ]);
});

it.each(["2026-01-02T03:04:05", "2026-02-30T03:04:05Z", "2026-02-30"])("does not invent UTC for ambiguous or impossible timestamp %s", (createdAt) => {
  expect(quickChatInfo({ id: "chat", workspaceId: "workspace", title: "Title", createdAt })).toContainEqual({ label: "Created (UTC)", value: "Unavailable" });
});

it("includes archive time only for archived chats", () => {
  expect(quickChatInfo({ id: "chat", workspaceId: "workspace", title: "Existing title", archivedAt: "2026-01-04T00:00:00Z" })).toContainEqual({ label: "Archived (UTC)", value: "2026-01-04T00:00:00.000Z" });
  expect(quickChatInfo({ id: "chat", workspaceId: "workspace", title: "Existing title", archivedAt: "invalid" })).toContainEqual({ label: "Archived (UTC)", value: "Unavailable" });
});
