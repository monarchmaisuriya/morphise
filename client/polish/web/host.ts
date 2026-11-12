// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/web/host.ts
// Paseo's own app settings (Settings → Appearance), read and written where the plugin API has no way in.
import { Platform } from "react-native";

// Read only: Morphise never writes Paseo's own settings (M, 2026-11-12).
declare const localStorage: { getItem(key: string): string | null };

const SETTINGS_KEY = "@paseo:app-settings";

export interface HostAppearance {
  uiFont?: string;
  monoFont?: string;
  contentSize: number;
  codeSize: number;
  pluginThemeId?: string;
  /** Settings → Appearance → Theme: a Paseo theme id, or "plugin" for one a plugin contributes. */
  theme?: string;
  /** Settings → Appearance → Always expand reasoning. */
  autoExpandReasoning: boolean;
  /** Settings → Chat → Chat display (Paseo 0.14): every call, consecutive calls grouped, or answered turns folded into a summary. */
  chatDisplay: "full" | "collapseToolCalls" | "collapseTurns";
}

export const DEFAULTS: HostAppearance = { contentSize: 15, codeSize: 12, autoExpandReasoning: false, chatDisplay: "full" };
let cache: { at: number; value: HostAppearance } | undefined;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const size = (v: unknown, fallback: number) => (typeof v === "number" && v >= 8 && v <= 32 ? v : fallback);

/**
 * Settings → Appearance fonts, sizes and reasoning expansion, which the plugin API doesn't pass to plugins.
 * ponytail: reads the desktop/web app's own `@paseo:app-settings` storage (undocumented, may move);
 * iOS/Android get defaults. Switch to a host settings API once Paseo exposes one.
 */
export function readHostAppearance(): HostAppearance {
  if (Platform.OS !== "web") return DEFAULTS;
  if (cache && Date.now() - cache.at < 2000) return cache.value;
  let value = DEFAULTS;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Record<string, unknown> | null;
    if (s && typeof s === "object") {
      value = {
        uiFont: text(s.uiFontFamily),
        monoFont: text(s.monoFontFamily),
        contentSize: size(s.contentFontSize, DEFAULTS.contentSize),
        codeSize: size(s.codeFontSize, DEFAULTS.codeSize),
        pluginThemeId: s.theme === "plugin" ? text(s.pluginThemeId) : undefined,
        theme: text(s.theme),
        autoExpandReasoning: s.autoExpandReasoning === true,
        // Same fallback as Paseo: before 0.14 the tool call display (Summary was "overview", earlier "concise"), then the compactToolCalls flag.
        chatDisplay: ["full", "collapseToolCalls", "collapseTurns"].includes(String(s.chatDisplay))
          ? (s.chatDisplay as HostAppearance["chatDisplay"])
          : ["overview", "concise"].includes(String(s.toolCallDetailLevel)) || (s.toolCallDetailLevel === undefined && s.compactToolCalls === true) ? "collapseToolCalls" : "full",
      };
    }
  } catch {
    // Unreadable or missing settings: keep Paseo's defaults.
  }
  cache = { at: Date.now(), value };
  return value;
}

/**
 * Paseo's font stacks when Settings → Appearance leaves a font empty.
 * ponytail: copied from Paseo 0.11.x (DEFAULT_UI_FONT_STACK / DEFAULT_MONO_FONT_STACK); update if Paseo changes them.
 */
export const PASEO_FONT_STACKS = {
  ui: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

/** Paseo's current code-block syntax theme (Settings → Appearance), desktop/web only. */
export function readSyntaxTheme(): string | undefined {
  if (Platform.OS !== "web") return undefined;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as { syntaxTheme?: unknown } | null;
    return typeof s?.syntaxTheme === "string" ? s.syntaxTheme : "one";
  } catch {
    return undefined;
  }
}
