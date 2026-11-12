// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): client/web.ts (colors)
// The bar's colours as CSS custom properties: from the profile's theme while Paseo shows it, read
// from the chat the selection is in otherwise, so the bar follows whatever theme Paseo shows.
import type { ThemeDraft } from "../../../shared/polish/theme";

export type Rgba = [number, number, number, number];
export type Palette = Array<[name: string, value: string]>;

/** `rgb()`, `rgba()` (comma or space separated) and `#rrggbb`; anything else is null. */
export function parseColor(value: string): Rgba | null {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
}

function css([r, g, b]: Rgba, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function mix(a: Rgba, b: Rgba, amount: number): Rgba {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount, 1];
}

export function luminance([r, g, b]: Rgba): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * The palette from the chat's own text and background colours. `background` is null when no
 * opaque ancestor was found; the bar then picks the side opposite the text.
 */
export function paletteFromPage(foreground: Rgba | null, background: Rgba | null, font: string): Palette {
  const fg = foreground ?? [220, 220, 220, 1];
  const bg = background ?? (luminance(fg) > 0.5 ? [24, 24, 27, 1] : [250, 250, 250, 1]);
  const dark = luminance(bg) < 0.5;
  return tokens({ fg, bg, surface: mix(bg, fg, dark ? 0.07 : 0.025), muted: css(fg, 0.62), faint: css(fg, 0.42), dark, font });
}

/** The palette from the profile's theme: its raised surface, text and secondary text colours. */
export function paletteFromTheme(theme: ThemeDraft, font: string): Palette {
  const c = theme.colors;
  const fg = parseColor(c.foreground) ?? [220, 220, 220, 1];
  const bg = parseColor(c.background) ?? [24, 24, 27, 1];
  const surface = parseColor(c.raised) ?? bg;
  return tokens({ fg, bg, surface, muted: c.mutedForeground, faint: c.ring, dark: theme.appearance === "dark", font });
}

/**
 * The profile's theme when Paseo is showing it (the chat's background is the theme's), the chat's
 * own colours otherwise: Paseo shows a contributed theme only once it is picked in its settings.
 */
export function choosePalette(theme: ThemeDraft | undefined, foreground: Rgba | null, background: Rgba | null, font: string): Palette {
  const themed = theme ? parseColor(theme.colors.background) : null;
  const showing = themed && background && themed.slice(0, 3).every((channel, index) => Math.abs(channel - background[index]!) <= 2);
  return theme && showing ? paletteFromTheme(theme, font) : paletteFromPage(foreground, background, font);
}

function tokens(input: { fg: Rgba; bg: Rgba; surface: Rgba; muted: string; faint: string; dark: boolean; font: string }): Palette {
  const { fg, bg, dark } = input;
  return [
    ["--pq-fg", css(fg)],
    ["--pq-muted", input.muted],
    ["--pq-faint", input.faint],
    ["--pq-border", css(fg, dark ? 0.16 : 0.14)],
    ["--pq-hover", css(fg, 0.09)],
    ["--pq-bg", css(input.surface)],
    ["--pq-field", css(bg)],
    ["--pq-primary-fg", css(bg)],
    ["--pq-danger", dark ? "#f87171" : "#dc2626"],
    ["--pq-success", dark ? "#4ade80" : "#16a34a"],
    ["--pq-shadow", dark ? "0 12px 32px rgba(0, 0, 0, 0.5)" : "0 12px 32px rgba(0, 0, 0, 0.16)"],
    ["--pq-font", input.font || "system-ui, sans-serif"],
  ];
}
