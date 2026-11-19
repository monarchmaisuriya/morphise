import { describe, expect, it } from "vitest";
import { colorValue, colorHex, channelAt, colorProblem } from "./color-value";

describe("color values", () => {
  it("expands short hex only for preview", () => {
    expect(colorValue("#abc")).toEqual({ red: 170, green: 187, blue: 204, alpha: 255 });
  });
  it("keeps a transparent color's exact alpha byte", () => {
    expect(colorHex({ red: 170, green: 187, blue: 204, alpha: 128 }, true)).toBe("#AABBCC80");
  });
  it("does not turn an invalid value into black", () => {
    expect(colorValue("#nope")).toBeNull();
  });
  it("rejects alpha where the owner accepts opaque colors only", () => {
    expect(colorProblem("#abcdef80", [3, 6], false)).toBe("Use a hex color with 3 or 6 digits, such as #8E4EC6.");
  });
  it("allows an empty optional override", () => {
    expect(colorProblem("", [6], true)).toBeNull();
  });
  it("uses continuous positions rather than visual segment indices", () => {
    expect(channelAt(127, 255)).toBe(127);
  });
  it("clamps positions beyond the track", () => {
    expect(channelAt(300, 255)).toBe(255);
    expect(channelAt(-2, 255)).toBe(0);
    expect(channelAt(10, 0)).toBeNull();
  });
});
