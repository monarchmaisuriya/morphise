import { describe, expect, it } from "vitest";
import { fontSize, heading, headingLineHeight, lineHeight, radius, table, textSize } from "./tokens";

// The values are Paseo 0.16.1's own (see tokens.ts); a change here means Morphise no longer matches the app around it.
describe("Paseo's design scale", () => {
  it("has Paseo's corner radii and font sizes", () => {
    expect(radius).toEqual({ sm: 2, base: 4, md: 6, lg: 8, xl: 12, "2xl": 16, full: 9999 });
    expect(fontSize).toEqual({ code: 12, sm: 12, base: 14, content: 15, lg: 16, xl: 18, "2xl": 20, "3xl": 22 });
  });
  it("sizes text as Paseo's replies do: 15px, 14px in a compact layout, on a line 1.4 times the size", () => {
    expect([textSize(false), textSize(true)]).toEqual([15, 14]);
    expect([lineHeight(15), lineHeight(14)]).toEqual([21, 20]);
  });
  it("sizes headings as Paseo's markdown does", () => {
    expect(heading).toEqual({ h1: 1.6, h2: 1.4, h3: 1.2, h4: 1.1, h5: 1, h6: 1 });
    expect(["h1", "h2", "h3", "h4"].map((h) => Math.round(15 * heading[h as keyof typeof heading]))).toEqual([24, 21, 18, 17]);
    expect(headingLineHeight(24)).toBe(31);
  });
  it("draws tables as Paseo's markdown does", () => {
    expect(table).toEqual({ borderWidth: 1, radius: 6, padY: 8, padX: 12 });
  });
});
