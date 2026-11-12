// The settings previews' rules that need no React: what each mock draws for a choice.
import type { PluginTheme } from "@getpaseo/plugin";
import type { ChatSettings } from "../../../shared/chat-view";
import type { Prefs } from "../../../shared/polish/prefs";
import { contrast, isHex, onAccent } from "../../../shared/polish/theme";
import { PLAIN_SYNTAX, SYNTAX_THEMES } from "../../polish/rows/highlight";
import type { Profile } from "../../../shared/profile";
import type { StepsOptions } from "../../../shared/steps";

// The chat column's share of the mock chat panel for each reply width.
export function replyColumnShare(width: Prefs["replyWidth"]): number {
  return { paseo: 0.72, narrow: 0.56, wide: 0.88, full: 1 }[width];
}

// "paseo": Paseo draws its dots in the text colour (sparkle and orb take the accent).
export function loaderTint(color: Prefs["loaderColor"], colors: PluginTheme["colors"]): string {
  return { paseo: colors.foreground, accent: colors.accent, text: colors.foreground, muted: colors.foregroundMuted }[color];
}

// Lines a long prompt is clamped to (Chat tab, Experimental (web)); null shows it whole.
export function promptClampLines(chat: ChatSettings | undefined): number | null {
  const lines = chat?.web?.clampPrompts;
  return lines && lines > 0 ? lines : null;
}

// The rich text variants a reply is drawn with: the chosen ones while Paseo is restyled, Paseo's plain look otherwise.
export function shownRichText(prefs: Prefs): Prefs["richText"] {
  if (prefs.nativeStyle === "design") return prefs.richText;
  return { quote: "a", table: "a", code: "a", inline: "a", heading: "a", list: "a", callout: "a", rule: "a" };
}

// The theme a mock draws in: the profile's own theme when it has one (its accent falling back to the app's), with the
// sidebar in its sidebar colour; the app's theme otherwise.
export function mockTheme(host: PluginTheme, profileTheme: Profile["theme"]): { theme: PluginTheme; sidebar: string } {
  if (!profileTheme) return { theme: host, sidebar: host.colors.surface0 };
  const c = profileTheme.colors;
  const accent = c.accent ?? host.colors.accent;
  return {
    theme: {
      colors: {
        ...host.colors,
        surface0: c.background,
        surface1: c.raised,
        surface2: c.control,
        border: c.border,
        foreground: c.foreground,
        foregroundMuted: c.mutedForeground,
        accent,
        accentForeground: onAccent(accent, c.background, c.foreground),
      },
    },
    sidebar: profileTheme.sidebar ?? c.background,
  };
}

// Where the steps card shows, as a short label, and whether it is drawn as the chat's card or the sidebar's.
export function stepsPlacement(options: Pick<StepsOptions, "position" | "scope">): { inline: boolean; label: string; title: string | null } {
  const where = options.position === "chat" ? "In the chat, under each plan update" : options.position === "top" ? "At the top of the sidebar" : "At the bottom of the sidebar";
  const inline = options.position === "chat";
  // In the sidebar with every chat of the workspace, each card names its chat.
  return { inline, label: where, title: !inline && options.scope === "workspace" ? "Auth middleware" : null };
}

export function pageHeightNote(pageHeight: Prefs["pageHeight"]): string {
  return pageHeight === 0 ? "Pages show at their full height." : `Pages taller than ${pageHeight} px scroll inside their frame.`;
}

// Whether code shows in the chosen colours: rows draw a dark palette plain on a light theme, and the reverse
// (client/polish/rows/row.tsx, useSyntax).
export function syntaxShown(syntax: string, surface0: string): "colours" | "plain" | "other-appearance" {
  const palette = SYNTAX_THEMES.find((theme) => theme.id === syntax);
  if (syntax === PLAIN_SYNTAX || !palette) return "plain";
  const dark = isHex(surface0) && contrast(surface0, "#ffffff") > contrast(surface0, "#000000");
  return (palette.appearance === "dark") === dark ? "colours" : "other-appearance";
}
