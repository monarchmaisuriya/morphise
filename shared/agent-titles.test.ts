import { describe, expect, it } from "vitest";
import { cleanTitle, DEFAULT_TITLE_PROMPT, MAX_TITLE, titleRequest, titleSettings } from "./agent-titles";

describe("agent titles", () => {
  it("takes the helper's first line, without quotes or Markdown marks, cut to the limit", () => {
    expect(cleanTitle('\n  "Fix login timeout in auth middleware."\nmore')).toBe("Fix login timeout in auth middleware");
    expect(cleanTitle("## Add rate limiter")).toBe("Add rate limiter");
    expect(cleanTitle("   \n  ")).toBeNull();
    const long = cleanTitle("x".repeat(100));
    expect(long?.length).toBe(MAX_TITLE);
    expect(long?.endsWith("…")).toBe(true);
  });

  it("asks with the prompt, the first message and the latest reply, each cut to 1000 characters", () => {
    const request = titleRequest("Write a title.", "a".repeat(1500), "done");
    expect(request.startsWith("Write a title.\nDo not use any tools.")).toBe(true);
    expect(request).toContain(`${"a".repeat(1000)}…`);
    expect(request).toContain("Latest reply:\ndone");
    expect(titleRequest("P", "hi", "")).not.toContain("Latest reply");
  });

  it("falls back field by field to the defaults", () => {
    expect(titleSettings.schema.parse({ provider: 5, model: "gpt-5", prompt: "" })).toEqual({ provider: "", model: "gpt-5", prompt: DEFAULT_TITLE_PROMPT });
  });
});
