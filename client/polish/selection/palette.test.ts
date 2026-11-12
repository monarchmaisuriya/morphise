import { describe, expect, it } from "vitest";
import { PRESETS, themeSchema } from "../../../shared/polish/theme";
import { choosePalette, paletteFromPage, parseColor } from "./palette";

const value = (palette: Array<[string, string]>, name: string) => palette.find(([key]) => key === name)?.[1];
const mariana = themeSchema.parse({ ...PRESETS[0], sidebar: PRESETS[0]!.sidebar });

describe("parseColor", () => {
  it("reads rgb, rgba with spaces or commas, and hex", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
    expect(parseColor("rgba(1 2 3 / 0.5)")).toEqual([1, 2, 3, 0.5]);
    expect(parseColor("#23272e")).toEqual([0x23, 0x27, 0x2e, 1]);
    expect(parseColor("transparent")).toBeNull();
  });
});

describe("paletteFromPage", () => {
  it("draws a dark bar on a dark chat and a light one on a light chat", () => {
    const dark = paletteFromPage([230, 230, 230, 1], [20, 20, 20, 1], "Inter");
    expect(value(dark, "--pq-danger")).toBe("#f87171");
    expect(value(dark, "--pq-font")).toBe("Inter");
    const light = paletteFromPage([20, 20, 20, 1], [250, 250, 250, 1], "");
    expect(value(light, "--pq-danger")).toBe("#dc2626");
    expect(value(light, "--pq-font")).toBe("system-ui, sans-serif");
  });

  it("picks the background opposite the text when the chat has no opaque one", () => {
    expect(value(paletteFromPage([240, 240, 240, 1], null, "x"), "--pq-field")).toBe("rgba(24, 24, 27, 1)");
  });
});

describe("choosePalette", () => {
  it("uses the profile's theme while Paseo shows it", () => {
    const palette = choosePalette(mariana, [1, 1, 1, 1], parseColor(mariana.colors.background), "x");
    expect(value(palette, "--pq-muted")).toBe(mariana.colors.mutedForeground);
    expect(value(palette, "--pq-bg")).toBe("rgba(44, 49, 58, 1)");
  });

  it("reads the chat's colours when Paseo shows another theme or there is none", () => {
    const page = choosePalette(mariana, [10, 10, 10, 1], [250, 250, 250, 1], "x");
    expect(value(page, "--pq-fg")).toBe("rgba(10, 10, 10, 1)");
    expect(choosePalette(undefined, [10, 10, 10, 1], [250, 250, 250, 1], "x")).toEqual(page);
  });
});
