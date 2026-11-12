import { describe, expect, it } from "vitest";
import { withAlpha } from "./hues";

describe("withAlpha", () => {
  it("reads every colour form a theme uses", () => {
    expect(withAlpha("#0a0", 0.5)).toBe("rgba(0, 170, 0, 0.5)");
    expect(withAlpha("#00AA00", 0.33)).toBe("rgba(0, 170, 0, 0.33)");
    expect(withAlpha("#00aa0080", 0.5)).toBe("rgba(0, 170, 0, 0.251)");
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgba(1, 2, 3, 0.5)");
    expect(withAlpha("rgba(1,2,3,0.5)", 0.5)).toBe("rgba(1, 2, 3, 0.25)");
  });

  it("returns null for a form it cannot read", () => {
    expect(withAlpha("green", 0.5)).toBeNull();
    expect(withAlpha("hsl(120 50% 50%)", 0.5)).toBeNull();
  });
});
