import { z } from "zod";
import type { ChatSettings } from "../chat-view";

// Chat Polish's preferences (lthieu96/paseo-chat-polish, MIT, see NOTICE.md), kept in Morphise's
// profile. Options Morphise already had keep their Morphise key (one owner each); the rest live in
// `chat.polish`. `polishPrefs` gives the ported code Chat Polish's `Prefs` shape.

export const HIDEABLE = ["read", "search", "fetch", "task", "todo"] as const;
export type Hideable = (typeof HIDEABLE)[number];
export const RICH_TEXT = ["quote", "table", "code", "inline", "heading", "list", "callout", "rule"] as const;
export type RichText = (typeof RICH_TEXT)[number];
export const LOADERS = ["dots", "sparkle", "spokes", "dotring", "orb", "matrix", "snake"] as const;
export type Loader = (typeof LOADERS)[number];
export const ICON_SETS = ["untitled", "hugeicons"] as const;
export type IconSet = "lucide" | (typeof ICON_SETS)[number];
export const ICON_KINDS = ["steps", "tool", "thought"] as const;
export type IconKind = (typeof ICON_KINDS)[number];
export const SELECTION_ACTIONS = ["quote", "reply", "side", "copy", "bookmark"] as const;
export type SelectionAction = (typeof SELECTION_ACTIONS)[number];

const variant = z.enum(["a", "b", "c"]);
const shown = z.enum(["show", "hide"]);

// As saved: every key optional, written only when it differs from the default, so older
// Morphise versions that do not know a key are not handed one by default.
export const polishSchema = z.strictObject({
  // Thoughts and tool calls between two replies folded into one row.
  merge: z.boolean().optional(),
  rowIcons: z.strictObject({ steps: shown.optional(), tool: shown.optional(), thought: shown.optional() }).optional(),
  // Failed calls start open (true, the default) or follow the fold rules like any other.
  failedOpen: z.boolean().optional(),
  // Image-only replies as thumbnails (needs the daemon's image library), or Paseo's images.
  images: z.enum(["native", "small", "large", "xlarge"]).optional(),
  imageStacks: z.boolean().optional(),
  imageStackOpen: z.enum(["hover", "click"]).optional(),
  // The bar over text selected in a chat (web and desktop); unset shows every action.
  selection: z.boolean().optional(),
  selectionActions: z.array(z.enum(SELECTION_ACTIONS)).max(SELECTION_ACTIONS.length).optional(),
  // Paseo's own items restyled to Chat Polish's design (web and desktop, experimental).
  restyle: z.boolean().optional(),
  window: z.enum(["paseo", "flat", "floating"]).optional(),
  loader: z.enum(LOADERS).optional(),
  loaderSize: z.enum(["s", "m", "l"]).optional(),
  richText: z.strictObject({ quote: variant.optional(), table: z.enum(["a", "b", "c", "d"]).optional(), code: variant.optional(), inline: variant.optional(), heading: variant.optional(), list: variant.optional(), callout: variant.optional(), rule: variant.optional() }).optional(),
  diagrams: z.enum(["mermaid", "pele"]).optional(),
  iconSet: z.enum(["lucide", ...ICON_SETS]).optional(),
  // New agents get the HTML page tools (off unless turned on).
  html: z.boolean().optional(),
  // Code colours for commands, diffs and JSON: a highlight theme id, or "plain".
  syntax: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
});
export type PolishSettings = z.output<typeof polishSchema>;

// Each option's default; a saved value equal to it is removed (older Morphise versions reject keys
// they do not know, so an unchanged profile carries none).
export const POLISH_DEFAULTS: Partial<Record<keyof PolishSettings, unknown>> = { merge: true, failedOpen: true, images: "native", imageStacks: false, imageStackOpen: "hover", selection: true, restyle: false, window: "paseo", loader: "dots", loaderSize: "s", diagrams: "mermaid", iconSet: "lucide", html: false, syntax: "one-dark-darker-mariana" };

// Chat Polish's Prefs, as its ported code reads them.
export interface Prefs {
  reasoning: "paseo" | "collapsed" | "expanded";
  commandColors: "expanded" | "always";
  diffWrap: "on" | "off";
  hidden: Hideable[];
  steps: "dim" | "faded" | "soft" | "full";
  density: "compact" | "normal" | "spacious";
  rowIcons: Record<IconKind, "show" | "hide">;
  merge: "on" | "off";
  phoneChat: "on" | "off";
  iconSet: IconSet;
  loader: Loader;
  loaderSize: "s" | "m" | "l";
  nativeStyle: "design" | "paseo";
  windowStyle: "paseo" | "flat" | "floating";
  recap: "on" | "off";
  diagrams: "pele" | "mermaid";
  html: "on" | "off";
  images: "small" | "large" | "xlarge" | "native";
  imageStacks: "on" | "off";
  imageStackOpen: "hover" | "click";
  richText: Record<Exclude<RichText, "table">, "a" | "b" | "c"> & { table: "a" | "b" | "c" | "d" };
  selection: "on" | "off";
  selectionActions: SelectionAction[];
  failedOpen: boolean;
  syntax: string;
}

const hidden = (kinds: readonly string[] | undefined): Hideable[] => HIDEABLE.filter((kind) => kinds?.includes(kind));

export function polishPrefs(chat: ChatSettings | undefined): Prefs {
  const polish = chat?.polish ?? {};
  const icon = (kind: IconKind) => (chat?.labels === "label" ? "hide" : polish.rowIcons?.[kind] ?? "show");
  return {
    reasoning: chat?.reasoning === "fold" ? "collapsed" : chat?.reasoning === "expand" ? "expanded" : "paseo",
    commandColors: chat?.commandColors === false ? "expanded" : "always",
    diffWrap: chat?.wrap === false ? "off" : "on",
    hidden: hidden(chat?.hideFinished),
    steps: chat?.strength ?? "full",
    density: chat?.density ?? "normal",
    rowIcons: { steps: icon("steps"), tool: icon("tool"), thought: icon("thought") },
    merge: polish.merge === false ? "off" : "on",
    phoneChat: chat?.phones === "paseo" ? "off" : "on",
    iconSet: polish.iconSet ?? "lucide",
    loader: polish.loader ?? "dots",
    loaderSize: polish.loaderSize ?? "s",
    nativeStyle: polish.restyle === true ? "design" : "paseo",
    windowStyle: polish.window ?? "paseo",
    recap: chat?.recap === true ? "on" : "off",
    diagrams: polish.diagrams ?? "mermaid",
    html: polish.html === true ? "on" : "off",
    images: polish.images ?? "native",
    imageStacks: polish.imageStacks === true ? "on" : "off",
    imageStackOpen: polish.imageStackOpen ?? "hover",
    richText: { quote: "a", table: "a", code: "a", inline: "a", heading: "a", list: "a", callout: "a", rule: "a", ...polish.richText },
    selection: polish.selection === false ? "off" : "on",
    selectionActions: polish.selectionActions ? [...polish.selectionActions] : [...SELECTION_ACTIONS],
    failedOpen: polish.failedOpen !== false,
    syntax: polish.syntax ?? "one-dark-darker-mariana",
  };
}
