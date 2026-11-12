// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/theme-registry.ts.
// Morphise contributes the profile's theme itself (client/sections.tsx, section "theme"); this keeps
// the same theme, in Chat Polish's shape, for the sidebar painter and code highlighting.
import { useSyncExternalStore } from "react";
import { PRESETS, themeSchema, type ThemeDraft } from "../../shared/polish/theme";

interface ProfileTheme {
  name: string;
  appearance: "light" | "dark";
  colors: Omit<ThemeDraft["colors"], "accent"> & { accent?: string };
  sidebar?: string;
}

let current: ThemeDraft | undefined;
const listeners = new Set<() => void>();

/** The profile's theme, or undefined while it has none (Paseo's own theme is in use). */
export const currentTheme = () => current;

export const subscribeTheme = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

export function useCurrentTheme() {
  return useSyncExternalStore(subscribeTheme, currentTheme);
}

// The profile takes #rgb, #rrggbb and #rrggbbaa; Chat Polish's code reads #rrggbb, so short forms
// are expanded and transparency is dropped.
export function sixDigitHex(color: string): string {
  const hex = color.slice(1);
  if (hex.length === 3) return `#${[...hex].map((digit) => digit + digit).join("")}`.toLowerCase();
  return `#${hex.slice(0, 6)}`.toLowerCase();
}

// Called by the theme section whenever the profile's theme or the syntax choice changes.
export function setCurrentTheme(theme: ProfileTheme | null, syntax: string) {
  const colors = theme ? (Object.fromEntries(Object.entries({ ...theme.colors, accent: theme.colors.accent ?? PRESETS[0]!.colors.accent }).map(([key, value]) => [key, sixDigitHex(value)])) as ThemeDraft["colors"]) : null;
  current = theme && colors
    ? themeSchema.parse({
        name: theme.name,
        appearance: theme.appearance,
        colors,
        sidebar: theme.sidebar ? sixDigitHex(theme.sidebar) : "",
        syntax,
      })
    : undefined;
  listeners.forEach((listener) => listener());
}
