import { describe, expect, it } from "vitest";
import { turnDetailsLine } from "./turn-details";

describe("turn details line", () => {
  it("lists the model, thinking level, duration, tokens and cost Paseo reported", () => {
    const details = { model: "claude-opus-5-5", thinking: "high", usage: { input: 12400, cached: 9100, output: 3200, cost: 0.42 } };
    expect(turnDetailsLine({ seconds: 2314, details })).toBe("claude-opus-5-5 · high · 38m 34s · 12k in (9.1k cached) · 3.2k out · $0.42");
  });

  it("leaves out what is missing, and is empty for recaps made before details existed", () => {
    expect(turnDetailsLine({ seconds: 19, details: { model: "gpt-5", thinking: null, usage: null } })).toBe("gpt-5 · 19s");
    expect(turnDetailsLine({ seconds: 19, details: undefined })).toBeNull();
    expect(turnDetailsLine({ seconds: 19, details: null })).toBeNull();
  });
});
