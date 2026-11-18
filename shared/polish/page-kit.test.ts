import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { KIT_MATH, KIT_SCRIPT } from "./page-kit";

// The maths block, run as the page runs it (plain script), with its functions handed back.
const math = new Function(`${KIT_MATH}; return { mkNiceTicks, mkCompact, mkTruncate, mkLabelStep, mkParseNumber, mkWrap, mkBarSize, mkNearest, mkTipPlace, mkSceneAt, mkSceneStart };`)() as {
  mkNiceTicks(min: number, max: number, count: number): number[];
  mkCompact(value: number | null): string;
  mkTruncate(text: string, max: number): string;
  mkLabelStep(labels: string[], band: number): number;
  mkParseNumber(text: string): number | null;
  mkWrap(text: string, maxWidth: number): { lines: string[]; short: boolean };
  mkBarSize(band: number, groups: number, cap: number): number;
  mkNearest(centres: number[], x: number): number;
  mkTipPlace(anchor: { x: number; top: number; bottom: number }, tip: { width: number; height: number }, room: { width: number; height: number }): { left: number; top: number };
  mkSceneAt(durations: number[], t: number): { index: number; p: number };
  mkSceneStart(durations: number[], index: number): number;
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
  it("wraps a label to the room it has: one line when it fits, two before shortening", () => {
    expect(math.mkWrap("Google", 200)).toEqual({ lines: ["Google"], short: false });
    expect(math.mkWrap("Popups with A/B test", 90)).toEqual({ lines: ["Popups with", "A/B test"], short: false });
    const tight = math.mkWrap("Exit popup: % vs fixed off and more words", 70);
    expect(tight.lines).toHaveLength(2);
    expect(tight.short).toBe(true);
    expect(tight.lines[1]!.endsWith("\u2026")).toBe(true);
    for (const line of tight.lines) expect(line.length * 6.6).toBeLessThanOrEqual(70);
  });
  it("breaks a single long word that cannot fit a line", () => {
    const word = math.mkWrap("Supercalifragilisticexpialidocious", 66);
    expect(word.lines).toHaveLength(2);
    for (const line of word.lines) expect(line.length * 6.6).toBeLessThanOrEqual(66);
  });
  it("keeps bars from becoming slabs on wide charts, and thin bars visible", () => {
    expect(math.mkBarSize(400, 1, 48)).toBe(48);
    expect(math.mkBarSize(40, 1, 48)).toBeCloseTo(28.8);
    expect(math.mkBarSize(40, 4, 48)).toBeCloseTo(7.2);
    expect(math.mkBarSize(2, 4, 48)).toBe(2);
  });
  it("finds the point nearest the pointer", () => {
    expect(math.mkNearest([10, 50, 90], 0)).toBe(0);
    expect(math.mkNearest([10, 50, 90], 69)).toBe(1);
    expect(math.mkNearest([10, 50, 90], 71)).toBe(2);
    expect(math.mkNearest([], 5)).toBe(-1);
  });
  it("places a tooltip above its mark, below when there is no room, and always inside the box", () => {
    const room = { width: 300, height: 200 }, tip = { width: 100, height: 40 };
    expect(math.mkTipPlace({ x: 150, top: 120, bottom: 130 }, tip, room)).toEqual({ left: 100, top: 72 });
    expect(math.mkTipPlace({ x: 150, top: 20, bottom: 30 }, tip, room)).toEqual({ left: 100, top: 38 });
    expect(math.mkTipPlace({ x: 290, top: 120, bottom: 130 }, tip, room).left).toBe(200);
    expect(math.mkTipPlace({ x: 5, top: 120, bottom: 130 }, tip, room).left).toBe(0);
    expect(math.mkTipPlace({ x: 150, top: 10, bottom: 190 }, tip, room).top).toBe(160);
  });
  it("finds the scene and its progress at a time on the whole timeline", () => {
    const d = [1000, 2000, 1000];
    expect(math.mkSceneAt(d, 0)).toEqual({ index: 0, p: 0 });
    expect(math.mkSceneAt(d, 500)).toEqual({ index: 0, p: 0.5 });
    expect(math.mkSceneAt(d, 1000)).toEqual({ index: 1, p: 0 });
    expect(math.mkSceneAt(d, 2000)).toEqual({ index: 1, p: 0.5 });
    expect(math.mkSceneAt(d, 4000)).toEqual({ index: 2, p: 1 });
    expect(math.mkSceneAt(d, 9999)).toEqual({ index: 2, p: 1 });
    expect(math.mkSceneAt(d, -5)).toEqual({ index: 0, p: 0 });
    expect(math.mkSceneAt([], 100)).toEqual({ index: -1, p: 0 });
  });
  it("raises scenes shorter than 300ms to 300ms, so nothing flickers past", () => {
    expect(math.mkSceneAt([100, 1000], 150)).toEqual({ index: 0, p: 0.5 });
    expect(math.mkSceneStart([100, 1000], 1)).toBe(300);
  });
  it("gives the start time of a scene", () => {
    expect(math.mkSceneStart([1000, 2000, 1000], 0)).toBe(0);
    expect(math.mkSceneStart([1000, 2000, 1000], 2)).toBe(3000);
    expect(math.mkSceneStart([1000, 2000, 1000], 5)).toBe(4000);
  });
  it("is a script a page can run (no syntax errors)", () => {
    expect(() => new Script(KIT_SCRIPT)).not.toThrow();
  });
});
