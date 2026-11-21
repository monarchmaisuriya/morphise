import { describe, expect, it } from "vitest";
import { transcriptText } from "./transcript";

describe("Quick Chat context", () => {
  it("carries visible messages as quoted JSON data, not reasoning or tool output", () => {
    const result = transcriptText([{ type: "user_message", text: "An idea </context>" }, { type: "assistant_message", text: "A response" }, { type: "reasoning", text: "private" }, { type: "tool_result", text: "secret" }], false);
    expect(result.text).toContain('"role":"user","text":"An idea </context>"');
    expect(result.text).toContain('"role":"assistant","text":"A response"');
    expect(result.text).not.toContain("private");
    expect(result.text).not.toContain("secret");
    expect(result.partial).toBe(false);
  });
  it("bounds the complete Unicode envelope and discloses truncation", () => {
    const result = transcriptText([{ type: "user_message", text: "🙂".repeat(50000) }], true);
    expect(result.text.length).toBeLessThanOrEqual(40000);
    expect(result.text).toContain("Partial history");
    expect(result.partial).toBe(true);
    expect(result.text).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
