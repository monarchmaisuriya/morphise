import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { KIT_MATH, KIT_SCRIPT } from "./page-kit";

// The maths block, run as the page runs it (plain script), with its functions handed back.
const math = new Function(`${KIT_MATH}; return { mkNiceTicks, mkCompact, mkTruncate, mkLabelStep, mkParseNumber };`)() as {
  mkNiceTicks(min: number, max: number, count: number): number[];
  mkCompact(value: number | null): string;
  mkTruncate(text: string, max: number): string;
  mkLabelStep(labels: string[], band: number): number;
  mkParseNumber(text: string): number | null;
};

describe("page kit maths", () => {
  it("picks round ticks that include zero and cover the data", () => {
    expect(math.mkNiceTicks(3, 87, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(math.mkNiceTicks(-12, 30, 4)).toEqual([-20, 0, 20, 40]);
    expect(math.mkNiceTicks(5, 5, 4)).toEqual([0, 2, 4, 6]);
    expect(math.mkNiceTicks(NaN, NaN, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it("writes numbers compactly", () => {
    expect(math.mkCompact(1234)).toBe("1234");
    expect(math.mkCompact(56_700_000)).toBe("56.7M");
    expect(math.mkCompact(-25_000)).toBe("-25k");
    expect(math.mkCompact(null)).toBe("");
  });
  it("spaces axis labels so they never overlap, and shortens long ones", () => {
    expect(math.mkLabelStep(["Jan", "Feb"], 60)).toBe(1);
    expect(math.mkLabelStep(["September 2026", "October 2026"], 20)).toBeGreaterThan(4);
    expect(math.mkTruncate("A very long store name", 10)).toBe("A very lo…");
  });
  it("reads table numbers with units, currency and separators", () => {
    expect(math.mkParseNumber("$4,200")).toBe(4200);
    expect(math.mkParseNumber("12.5%")).toBe(12.5);
    expect(math.mkParseNumber("3.2k")).toBe(3200);
    expect(math.mkParseNumber("1.5M")).toBe(1_500_000);
    expect(math.mkParseNumber("North")).toBeNull();
  });
  it("is a script a page can run (no syntax errors)", () => {
    expect(() => new Script(KIT_SCRIPT)).not.toThrow();
  });
});
