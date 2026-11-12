import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeColor, readAppColors } from "./restyle";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

// A canvas's fillStyle as browsers keep it: opaque colors read back as lowercase #rrggbb, others
// as rgba(); a value it can't parse leaves the previous one.
function fakeCanvas() {
  let fill = "#000000";
  return {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value: string) {
      const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
      if (/^#[0-9a-f]{6}$/i.test(value)) fill = value.toLowerCase();
      else if (rgb) fill = `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
      else if (/^rgba\(/.test(value)) fill = value;
    },
  };
}

// Paseo 0.16's theme variables as Unistyles publishes them on :root.
const PASEO_VARS: Record<string, string> = {
  "--colors-surface0": " #23272E",
  "--colors-surface1": "rgb(44, 49, 58)",
  "--colors-surface2": "#323842",
  "--colors-border": "#3e4452",
  "--colors-foreground": "#abb2bf",
  "--colors-foreground-muted": "#959aa1",
  "--colors-accent": "#6699cc",
  "--colors-accent-foreground": "#23272e",
  "--colors-status-success": "#98c379",
  "--colors-status-warning": "rgba(229, 192, 123, 0.5)",
  "--colors-status-danger": "#e06c75",
};

function stubPage(vars: Record<string, string>, canvas: ReturnType<typeof fakeCanvas> | null) {
  vi.stubGlobal("document", { documentElement: {}, createElement: () => ({ getContext: () => canvas }) });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (name: string) => vars[name] ?? "" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("app colors for the restyle", () => {
  it("reads opaque colors as hex, which the color math and mermaid's theme need", () => {
    const canvas = fakeCanvas();
    expect(normalizeColor(canvas, "#ABCDEF")).toBe("#abcdef");
    expect(normalizeColor(canvas, "rgb(1, 2, 3)")).toBe("#010203");
    expect(normalizeColor(canvas, "rgba(1, 2, 3, 0.5)")).toBe("rgba(1, 2, 3, 0.5)");
    // Not a color the canvas takes: given back as it was, not as the canvas's last color.
    expect(normalizeColor(canvas, "var(--x)")).toBe("var(--x)");
  });

  it("reads every theme color from Paseo's --colors-* variables", () => {
    stubPage(PASEO_VARS, fakeCanvas());
    expect(readAppColors()).toEqual({
      surface0: "#23272e",
      surface1: "#2c313a",
      surface2: "#323842",
      border: "#3e4452",
      foreground: "#abb2bf",
      foregroundMuted: "#959aa1",
      accent: "#6699cc",
      accentForeground: "#23272e",
      statusSuccess: "#98c379",
      statusWarning: "rgba(229, 192, 123, 0.5)",
      statusDanger: "#e06c75",
    });
  });

  it("waits while a variable is missing, rather than drawing with an empty color", () => {
    const { "--colors-accent": _accent, ...partial } = PASEO_VARS;
    stubPage(partial, fakeCanvas());
    expect(readAppColors()).toBeUndefined();
  });
});
