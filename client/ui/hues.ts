// A colour at the given opacity (0 to 1), for any colour a theme gives as #rgb, #rrggbb,
// #rrggbbaa, rgb() or rgba(); null for any other form, so callers pick a visible fallback
// instead of an invalid colour string.
export function withAlpha(color: string, alpha: number): string | null {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex.slice(0, 6);
    const [red, green, blue] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
    const base = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return `rgba(${red}, ${green}, ${blue}, ${+(base * alpha).toFixed(3)})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${+((rgb[4] === undefined ? 1 : Number(rgb[4])) * alpha).toFixed(3)})`;
  return null;
}

// Paseo themes have no blue or purple, so these two hues are fixed; both read on light and dark.
export const BLUE = "#4c8dff";
export const PURPLE = "#a371f7";
// Done is gray: the theme's muted text colour, drawn faint in the sidebar (as in 0.7).
export const DONE_OPACITY = 0.6;

type StatusColors = { statusWarning: string; statusDanger: string; statusSuccess: string; foregroundMuted: string; foreground: string };
type Status = "needs_input" | "failed" | "running" | "attention" | "done";

// One colour per status, used wherever a status is drawn: waiting on you amber, failed red,
// running white, finished but unread green, done gray (drawn at DONE_OPACITY in the sidebar).
export function statusColor(colors: StatusColors, status: Status): string {
  if (status === "needs_input") return colors.statusWarning;
  if (status === "failed") return colors.statusDanger;
  if (status === "running") return colors.foreground;
  if (status === "attention") return colors.statusSuccess;
  return colors.foregroundMuted;
}

// Letter tiles for projects, as Paseo's own sidebar draws them; picked by the project's name.
// Project tiles take a hue, never gray, white or black, so every project reads as its own.
const TILE_COLORS = [
  "#b05c80", // rose
  "#c08a3e", // amber
  "#4f9a8f", // teal
  "#5b7fc7", // blue
  "#8a6cc7", // violet
  "#c76b5b", // coral
  "#6b9a4f", // green
  "#3a9cc4", // cyan
  "#6a5fd1", // indigo
  "#b54fb0", // magenta
  "#c24d5e", // crimson
  "#d07a2f", // orange
  "#2e9a76", // emerald
  "#8e4f8f", // plum
  "#a5553a", // brick
  "#b08d2a", // mustard
];
export function tileColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}
