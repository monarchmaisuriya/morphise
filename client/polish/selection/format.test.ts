import { describe, expect, it } from "vitest";
import { buildSideChatSystemPrompt, formatQuote, formatReply, joinParagraph, sendBehaviorOf, sideChatTitle, splitBlocks } from "./format";

describe("formatQuote", () => {
  it("quotes every prose line and keeps blank lines as bare markers", () => {
    expect(formatQuote({ text: "  first line\n\nsecond line  ", code: null })).toBe("> first line\n>\n> second line");
  });

  it("turns non-breaking spaces and CRLF into plain text and drops trailing spaces", () => {
    expect(formatQuote({ text: "a b   \r\nc", code: null })).toBe("> a b\n> c");
  });

  it("fences multi-line code with its language and keeps indentation", () => {
    expect(formatQuote({ text: "if (x) {\n  y();\n}", code: { language: "ts" } })).toBe("```ts\nif (x) {\n  y();\n}\n```");
  });

  it("uses a longer fence when the code itself contains one", () => {
    expect(formatQuote({ text: "```\ninner\n```", code: { language: null } })).toBe("````\n```\ninner\n```\n````");
  });

  it("keeps one line of code as a quoted code span with backticks escaped", () => {
    expect(formatQuote({ text: "a `b` c", code: { language: null } })).toBe("> `a \\`b\\` c`");
  });
});

describe("formatReply", () => {
  it("puts the reply a blank line under the quote", () => {
    expect(formatReply({ text: "passage", code: null }, "  my answer \n")).toBe("> passage\n\nmy answer");
  });

  it("is just the quote when the reply is empty", () => {
    expect(formatReply({ text: "passage", code: null }, "   ")).toBe("> passage");
  });
});

describe("joinParagraph", () => {
  it("separates the snippet from earlier text by exactly one blank line", () => {
    expect(joinParagraph("", "S")).toBe("S");
    expect(joinParagraph("  \n", "S")).toBe("S");
    expect(joinParagraph("text", "S")).toBe("\n\nS");
    expect(joinParagraph("text\n", "S")).toBe("\nS");
    expect(joinParagraph("text\n\n", "S")).toBe("S");
  });
});

describe("buildSideChatSystemPrompt", () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? ("assistant" as const) : ("user" as const), text: `turn ${index} body` }));

  it("carries the last 8 turns, oldest first", () => {
    const prompt = buildSideChatSystemPrompt(turns, "> nothing that matches");
    expect(prompt).toContain("<main_conversation>");
    expect(prompt).not.toContain("turn 3 body");
    expect(prompt.indexOf("turn 4 body")).toBeLessThan(prompt.indexOf("turn 11 body"));
  });

  it("adds an older turn the quote was taken from", () => {
    const withSource = [{ role: "assistant" as const, text: "The cache key includes the tenant id, always." }, ...turns];
    const prompt = buildSideChatSystemPrompt(withSource, "> The cache key includes the tenant id");
    expect(prompt).toContain("The cache key includes the tenant id, always.");
    expect(prompt).not.toContain("turn 2 body");
  });

  it("clips a very long turn in the middle", () => {
    const prompt = buildSideChatSystemPrompt([{ role: "assistant", text: "a".repeat(10_000) }], "q");
    expect(prompt).toContain("\n[…]\n");
    expect(prompt.length).toBeLessThan(7_000);
  });
});

describe("sideChatTitle", () => {
  it("uses the question's first line, shortened", () => {
    expect(sideChatTitle("why?\nmore")).toBe("Side chat: why?");
    expect(sideChatTitle("x".repeat(60), "侧边对话")).toBe(`侧边对话: ${"x".repeat(47)}…`);
    expect(sideChatTitle("  ")).toBe("Side chat: quote");
  });
});

describe("splitBlocks", () => {
  it("splits a reply into text, quote and code blocks", () => {
    expect(splitBlocks("> quoted\n> more\nanswer\n```ts\nconst x = 1;\n```\nafter")).toEqual([
      { kind: "quote", text: "quoted\nmore" },
      { kind: "text", text: "answer" },
      { kind: "code", text: "const x = 1;" },
      { kind: "text", text: "after" },
    ]);
  });
});

describe("sendBehaviorOf", () => {
  it("reads Default send from Paseo's settings and falls back like Paseo does", () => {
    expect(sendBehaviorOf(null)).toBeNull();
    expect(sendBehaviorOf("not json")).toBeNull();
    expect(sendBehaviorOf(JSON.stringify({ sendBehavior: "queue" }))).toBe("queue");
    expect(sendBehaviorOf(JSON.stringify({ sendBehavior: "interrupt" }))).toBe("interrupt");
    expect(sendBehaviorOf(JSON.stringify({ sendBehavior: "something new" }))).toBe("steer");
    expect(sendBehaviorOf(JSON.stringify({}))).toBe("steer");
  });
});
