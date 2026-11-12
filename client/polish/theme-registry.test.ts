import { describe, expect, it } from "vitest";
import { currentTheme, setCurrentTheme, sixDigitHex } from "./theme-registry";

describe("the profile theme in Chat Polish's shape", () => {
  it("reads every colour form the profile accepts", () => {
    expect(sixDigitHex("#ABC")).toBe("#aabbcc");
    expect(sixDigitHex("#11223344")).toBe("#112233");
    const colors = { background: "#000", foreground: "#ffffff80", raised: "#111111", control: "#222", border: "#333", mutedForeground: "#999", ring: "#777" };
    expect(() => setCurrentTheme({ name: "T", appearance: "dark", colors, sidebar: "#123" }, "plain")).not.toThrow();
    expect(currentTheme()?.colors.foreground).toBe("#ffffff");
    expect(currentTheme()?.sidebar).toBe("#112233");
  });
});
