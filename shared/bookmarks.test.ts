import { describe, expect, it } from "vitest";
import { applyBookmark, EMPTY_BOOKMARKS, excerptOf, lastAnswer, MAX_BOOKMARKS, MAX_EXCERPT } from "./bookmarks";

const mark = (id: string, excerpt = `answer ${id}`, agentId = "a1") => ({ id, agentId, workspaceId: "w1", chat: "Chat", excerpt, note: "", at: "2026-11-12T10:00:00Z" });

describe("bookmarks", () => {
  it("adds newest first, ignores the same answer twice, removes by id", () => {
    let document = applyBookmark(EMPTY_BOOKMARKS, { kind: "add", bookmark: mark("1") });
    document = applyBookmark(document, { kind: "add", bookmark: mark("2") });
    expect(document.bookmarks.map((item) => item.id)).toEqual(["2", "1"]);
    expect(applyBookmark(document, { kind: "add", bookmark: mark("3", "answer 1") })).toBe(document);
    expect(applyBookmark(document, { kind: "add", bookmark: mark("3", "answer 1", "a2") }).bookmarks).toHaveLength(3);
    expect(applyBookmark(document, { kind: "remove", id: "1" }).bookmarks.map((item) => item.id)).toEqual(["2"]);
  });

  it("drops the oldest past the limit", () => {
    let document = EMPTY_BOOKMARKS;
    for (let index = 0; index <= MAX_BOOKMARKS; index++) document = applyBookmark(document, { kind: "add", bookmark: mark(String(index)) });
    expect(document.bookmarks).toHaveLength(MAX_BOOKMARKS);
    expect(document.bookmarks[0].id).toBe(String(MAX_BOOKMARKS));
  });

  it("keeps an excerpt within the limit and finds the newest answer", () => {
    expect(excerptOf("  short  ")).toBe("short");
    expect(excerptOf("x".repeat(MAX_EXCERPT + 50))).toHaveLength(MAX_EXCERPT);
    expect(lastAnswer([{ item: { type: "assistant_message", text: "first" } }, { item: { type: "assistant_message", text: "second" } }, { item: { type: "tool_call" } }])).toBe("second");
    expect(lastAnswer([{ item: { type: "user_message", text: "hi" } }])).toBeNull();
  });
});
