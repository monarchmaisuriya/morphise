import { describe, expect, it } from "vitest";
import { numberedLines, striped } from "./preview-lines";

describe("numberedLines", () => {
  it("numbers lines from 1", () => {
    expect(numberedLines(["a", "b", "c"], 0, false).map((l) => [l.n, l.text])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("continues the count for a part that starts further in (the tail of folded output)", () => {
    expect(numberedLines(["y", "z"], 8, false).map((l) => l.n)).toEqual([9, 10]);
  });

  it("shades every other line, starting with the second", () => {
    expect(numberedLines(["a", "b", "c", "d"], 0, true).map((l) => l.shaded)).toEqual([false, true, false, true]);
  });

  it("keeps the shading of each line where it is in the whole text", () => {
    expect(numberedLines(["y", "z"], 7, true).map((l) => l.shaded)).toEqual([true, false]);
  });

  it("shades nothing with stripes off", () => {
    expect(numberedLines(["a", "b", "c"], 0, false).some((l) => l.shaded)).toBe(false);
  });
});

describe("striped", () => {
  it("is false for every line with stripes off", () => {
    expect([0, 1, 2, 3].map((i) => striped(i, false))).toEqual([false, false, false, false]);
  });
});
