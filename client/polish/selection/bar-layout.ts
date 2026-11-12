// What the selection bar (web/bar.ts) draws for a profile, and where: no DOM, so settings previews and tests can use it too.
import type { Prefs } from "../../../shared/polish/prefs";
import { shownActions } from "./actions";
import type { say } from "./strings";

type Word = Parameters<typeof say>[0];

/** Lucide paths (24 × 24, stroked) for the bar's icons. */
export const BAR_ICONS = {
  quote:
    '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  side: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  markdown: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
} as const;
export type BarIcon = keyof typeof BAR_ICONS;

export type BarAction = "quote" | "reply" | "side" | "copy-text" | "copy-markdown" | "bookmark";

/**
 * One piece of the bar, left to right. A button shows its icon, its word, or both; `title` is its tooltip and `label` its accessible
 * name when the word is not shown. The lead names the copy group; a divider sits only between two groups that both show.
 */
export type BarItem =
  | { kind: "button"; action: BarAction; icon?: BarIcon; word?: Word; label: Word; title: Word }
  | { kind: "lead"; icon: BarIcon; word?: Word }
  | { kind: "divider" };

/** The bar's pieces for the profile's actions and button style; none when the bar is off. */
export function barItems(prefs: Pick<Prefs, "selection" | "selectionActions" | "barButtons">): BarItem[] {
  const shown = shownActions(prefs);
  const iconsOnly = prefs.barButtons === "icons";
  const items: BarItem[] = [];
  for (const action of ["quote", "reply", "side"] as const) {
    if (shown.includes(action)) items.push({ kind: "button", action, icon: action, word: iconsOnly ? undefined : action, label: action, title: `${action}Title` });
  }
  const answers = items.length > 0;
  if (shown.includes("copy")) {
    if (answers) items.push({ kind: "divider" });
    items.push({ kind: "lead", icon: "copy", word: iconsOnly ? undefined : "copy" });
    // With labels the two formats are words only (the lead carries the icon); icons only, each gets its own.
    items.push({ kind: "button", action: "copy-text", icon: iconsOnly ? "text" : undefined, word: iconsOnly ? undefined : "text", label: "text", title: "textTitle" });
    items.push({ kind: "button", action: "copy-markdown", icon: iconsOnly ? "markdown" : undefined, word: iconsOnly ? undefined : "markdown", label: "markdown", title: "markdownTitle" });
  }
  if (shown.includes("bookmark")) {
    if (items.length > 0) items.push({ kind: "divider" });
    // Bookmark is an icon in either style.
    items.push({ kind: "button", action: "bookmark", icon: "bookmark", label: "bookmarkTitle", title: "bookmarkTitle" });
  }
  return items;
}

/**
 * The bar's top edge for a selection line (`anchor`): on the preferred side of it, or the other side when only that one fits in the
 * viewport, then kept inside it. `gap` is the space between the bar, the line and the viewport's edges.
 */
export function barTop(anchor: { top: number; bottom: number }, height: number, viewport: number, prefer: Prefs["barPosition"], gap: number): number {
  const above = anchor.top - height - gap;
  const below = anchor.bottom + gap;
  const fitsAbove = above >= gap;
  const fitsBelow = below + height <= viewport - gap;
  const top = prefer === "above" ? (fitsAbove || !fitsBelow ? above : below) : fitsBelow || !fitsAbove ? below : above;
  return Math.min(Math.max(top, gap), Math.max(gap, viewport - height - gap));
}
