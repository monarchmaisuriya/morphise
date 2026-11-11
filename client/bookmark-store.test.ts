import { describe, expect, it } from "vitest";
import { EMPTY_BOOKMARKS } from "../shared/bookmarks";
import { bookmarkLastAnswer, createBookmarkWriter } from "./bookmark-store";

function fakeCalls() {
  let revision = 0;
  let values: unknown = EMPTY_BOOKMARKS;
  return {
    read: async () => ({ status: "ready" as const, revision: String(revision), values }),
    write: async (input: { revision: string; values: unknown }) => {
      if (input.revision !== String(revision)) return { status: "conflict" as const, error: "conflict" };
      revision++;
      values = input.values;
      return { status: "saved" as const, revision: String(revision), values };
    },
    current: () => values as typeof EMPTY_BOOKMARKS,
  };
}

describe("bookmark capture", () => {
  it("bookmarks the chat's newest answer with its note", async () => {
    const calls = fakeCalls();
    const apply = createBookmarkWriter(calls);
    await bookmarkLastAnswer({ isRunning: () => false, readTail: async () => ({ entries: [{ item: { type: "assistant_message", text: "The fix is X" } }] }), chatTitle: () => "Fix login", apply }, "a1", "w1", " remember this ");
    expect(calls.current().bookmarks).toEqual([expect.objectContaining({ agentId: "a1", workspaceId: "w1", chat: "Fix login", excerpt: "The fix is X", note: "remember this" })]);
  });

  it("says so when the chat has no answer yet or is still answering, and saves nothing", async () => {
    const calls = fakeCalls();
    await expect(bookmarkLastAnswer({ isRunning: () => false, readTail: async () => ({ entries: [] }), chatTitle: () => "x", apply: createBookmarkWriter(calls) }, "a1", null, "")).rejects.toThrow("no answer");
    await expect(bookmarkLastAnswer({ isRunning: () => true, readTail: async () => ({ entries: [{ item: { type: "assistant_message", text: "half" } }] }), chatTitle: () => "x", apply: createBookmarkWriter(calls) }, "a1", null, "")).rejects.toThrow("still answering");
    expect(calls.current().bookmarks).toEqual([]);
  });
});
