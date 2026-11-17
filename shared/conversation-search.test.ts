import { describe, expect, it } from "vitest";
import { conversationSearch, MAX_EXCERPT, messageExcerpt } from "./conversation-search";

describe("conversation search matching", () => {
  // The next three are ported from Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md):
  // test/unit/tasks-conversation-search-server.test.ts at d4c85cca.
  it("finds a word past the first scan window and after a character whose lower case is longer", () => {
    expect(messageExcerpt("x".repeat(4094) + "Dragonfruit", "dragonfruit")).toContain("Dragonfruit");
    expect(messageExcerpt("İ preceding Dragonfruit", "dragonfruit")).toContain("Dragonfruit");
  });

  it("needs every word in one message, in any order", () => {
    const match = messageExcerpt("refresh " + "x".repeat(5000) + "firmware", "firmware refresh");
    expect(match).toContain("firmware");
    expect(match).toContain("refresh");
    expect(messageExcerpt("firmware only", "firmware refresh")).toBeNull();
  });

  it("keeps a one-word excerpt within 213 characters for a short word", () => {
    expect(messageExcerpt("a".repeat(500) + " Dragonfruit " + "b".repeat(500), "dragonfruit")!.length).toBeLessThanOrEqual(213);
  });

  it("takes 80 characters before the word and the query's length plus 120 after, marking cut ends", () => {
    const text = "a".repeat(100) + "Needle" + "b".repeat(200);
    expect(messageExcerpt(text, "needle")).toBe(`…${"a".repeat(80)}Needle${"b".repeat(120)}…`);
    expect(messageExcerpt("short Needle text", "NEEDLE")).toBe("short Needle text");
  });

  it("joins one excerpt per word, each with marks where it was cut, within the limit", () => {
    const text = "alpha " + "x".repeat(3000) + " beta " + "y".repeat(3000);
    const match = messageExcerpt(text, "beta alpha")!;
    expect(match.startsWith("alpha")).toBe(true);
    expect(match).toMatch(/beta/);
    expect(match).toContain("… …");
    expect(match.length).toBeLessThanOrEqual(MAX_EXCERPT);
  });

  it("stays within the limit for the longest query", () => {
    const words = Array.from({ length: 100 }, (_, index) => `w${String(index).padStart(7, "0")}`);
    const query = words.join(" ").slice(0, 1000);
    const text = words.map((word) => `${word} ${"z".repeat(300)}`).join(" ");
    const match = messageExcerpt(text, query);
    expect(match).not.toBeNull();
    expect(match!.length).toBeLessThanOrEqual(MAX_EXCERPT);
  });

  it("returns null when a word is missing", () => {
    expect(messageExcerpt("nothing here", "absent")).toBeNull();
  });
});

describe("conversation search contract", () => {
  it("trims the query, refuses an empty or over-long one, and accepts a byte cursor", () => {
    expect(conversationSearch.name).toBe("morphise.search.conversation");
    expect(conversationSearch.input.parse({ agentId: "a1", query: "  word " }).query).toBe("word");
    expect(() => conversationSearch.input.parse({ agentId: "a1", query: "   " })).toThrow();
    expect(() => conversationSearch.input.parse({ agentId: "a1", query: "x".repeat(1001) })).toThrow();
    expect(conversationSearch.input.parse({ agentId: "a1", query: "w", cursor: { offset: 10, inode: "123" } }).cursor).toEqual({ offset: 10, inode: "123" });
    expect(() => conversationSearch.input.parse({ agentId: "a1", query: "w", cursor: { offset: -1, inode: "123" } })).toThrow();
  });

  it("answers with an excerpt of at most 1202 characters, a cursor, or why the chat cannot be searched", () => {
    const page = { match: null, nextCursor: { offset: 8, inode: "1" }, unavailable: null };
    expect(conversationSearch.output.parse(page)).toEqual(page);
    expect(() => conversationSearch.output.parse({ ...page, match: "x".repeat(1203) })).toThrow();
    expect(conversationSearch.output.parse({ match: null, nextCursor: null, unavailable: "Not searchable" }).unavailable).toBe("Not searchable");
  });
});
