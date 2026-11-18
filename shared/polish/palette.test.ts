import { describe, expect, it } from "vitest";
import { CHART_DARK, CHART_LIGHT, chartPalette } from "./palette";
import { contrast } from "./theme";

describe("chart palette", () => {
  it("picks the dark set on a dark background and the light set on a light one", () => {
    expect(chartPalette("#181818")).toEqual(CHART_DARK);
    expect(chartPalette("#1e1f22")).toEqual(CHART_DARK);
    expect(chartPalette("#ffffff")).toEqual(CHART_LIGHT);
    expect(chartPalette("#f5f5f5")).toEqual(CHART_LIGHT);
  });

  it("falls back to the dark set for a background it can't read", () => {
    expect(chartPalette("transparent")).toEqual(CHART_DARK);
  });

  it("has six distinct colours in each set", () => {
    for (const set of [CHART_DARK, CHART_LIGHT]) {
      expect(set).toHaveLength(6);
      expect(new Set(set).size).toBe(6);
    }
  });

  it("keeps every dark colour at 3:1 or more on the page and card backgrounds of dark themes", () => {
    for (const background of ["#181818", "#212121", "#1e1f22", "#2b2d31"]) {
      for (const color of CHART_DARK) expect(contrast(color, background)).toBeGreaterThanOrEqual(3);
    }
  });
});
