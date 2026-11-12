import { describe, expect, it } from "vitest";
import { isDarkSurface, statusColor, withAlpha } from "./hues";

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

describe("running status colour", () => {
  const colors = (surface0: string) => ({ statusWarning: "#db932e", statusDanger: "#f7796d", statusSuccess: "#35c264", foregroundMuted: "#888888", foreground: "#ffffff", surface0 });
  it("is Paseo's running blue, not the text colour", () => {
    expect(statusColor(colors("#18181b"), "running")).toBe("#5caaf6");
    expect(statusColor(colors("#ffffff"), "running")).toBe("#268ae0");
    expect(statusColor(colors("rgb(0,0,0)"), "running")).toBe("#5caaf6");
  });
  it("tells dark backgrounds from light", () => {
    expect([isDarkSurface("#111"), isDarkSurface("#f5f5f5"), isDarkSurface("#a0a0a0")]).toEqual([true, false, false]);
    expect([isDarkSurface("rgb(255, 255, 255)"), isDarkSurface("rgba(20, 20, 24, 1)"), isDarkSurface("white")]).toEqual([false, true, true]);
  });
});
