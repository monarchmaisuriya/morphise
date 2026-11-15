// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/web/color.ts
/** Hex color math for the restyle's derived colors; non-hex input passes through unchanged. */

// Web only, when seriesFrom runs; just the canvas it reads colors back from.
interface Canvas2d {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
}
declare const document: { createElement(tag: "canvas"): { getContext(kind: "2d", options: { willReadFrequently: boolean }): Canvas2d | null } };

export const hexAlpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex);
export const darker = (hex: string) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.86).toString(16).padStart(2, "0")).join("")}` : hex;
export const mix = (a: string, b: string, t: number) =>
  /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)
    ? `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("")}`
    : a;
export const isDark = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) < 384;

/**
 * Chart series colors: the accent's hue turned in even steps, keeping its lightness so each reads like the theme. The status
 * colors can't serve: themes often share a hue between them (Paseo's light accent and success are both green). A gray
 * accent still gets some chroma. Opaque hex, since mermaid and pages derive shades from them; the browser does the color math.
 */
export function seriesFrom(accent: string) {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  return [0, 180, 90, 270, 45, 225, 135, 315].map((turn) => {
    if (!ctx) return accent;
    // A browser without relative colors keeps the accent.
    ctx.fillStyle = accent;
    ctx.fillStyle = `oklch(from ${accent} l max(c, 0.08) calc(h + ${turn}))`;
    ctx.fillRect(0, 0, 1, 1);
    const { data } = ctx.getImageData(0, 0, 1, 1);
    return `#${[data[0], data[1], data[2]].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
  });
}
