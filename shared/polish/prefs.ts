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

// Each key on its own: a value this version cannot read (from a newer or older Morphise, or a
// hand edit) falls back to its default instead of failing the whole profile. A key this version does
// not know is kept as it is, so a newer version's new option survives a save here; a new value of a
// key this version knows does not (it is read, and then saved, as the default).
function tolerant<Shape extends z.ZodRawShape>(shape: Shape) {
  const fields = Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, (schema as z.ZodType).catch(undefined)]));
  return z.object(fields as unknown as { [Key in keyof Shape]: z.ZodCatch<Shape[Key]> }).catchall(z.json());
}

// As saved: every key optional, written only when it differs from the default, so older
// Morphise versions that do not know a key are not handed one by default.
export const polishSchema = tolerant({
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
  // Merged steps: a run shorter than this stays as separate rows.
  mergeMin: z.union([z.literal(2), z.literal(3), z.literal(5)]).optional(),
  diffLineNumbers: z.boolean().optional(),
  // A folded thought row shows its first line after "Thought".
  thoughtFirstLine: z.boolean().optional(),
  // The selection bar: icons with labels or icons only, above or below the selection, and the
  // side chat's model ("" is the chat's own; otherwise a model id as the provider names it).
  barButtons: z.enum(["both", "icons"]).optional(),
  barPosition: z.enum(["above", "below"]).optional(),
  sideModel: z.string().regex(/^[A-Za-z0-9._:/@-]{1,80}$/, "Expected a model id such as claude-sonnet-4-6").optional(),
  thumbCorners: z.enum(["rounded", "square"]).optional(),
  // Restyle only: the chat column's width, the floating window's corner radius and gap, and the
  // working indicator's colour.
  replyWidth: z.enum(["paseo", "narrow", "wide", "full"]).optional(),
  floatingRadius: z.union([z.literal(8), z.literal(10), z.literal(16)]).optional(),
  floatingGap: z.union([z.literal(4), z.literal(8), z.literal(12)]).optional(),
  loaderColor: z.enum(["paseo", "accent", "text", "muted"]).optional(),
  // HTML pages taller than this scroll inside their frame; 0 (the default, as in 0.16) is no limit.
  pageHeight: z.union([z.literal(500), z.literal(800), z.literal(0)]).optional(),
  // Web: Paseo's prompts and replies in the system font ("Chat font" text, when set, wins).
  uiFont: z.enum(["paseo", "system"]).optional(),
  // Exact sizes for Morphise's rows, in px; unset follows "Text size" and "Code size".
  textPx: z.int().min(9).max(20).optional(),
  codePx: z.int().min(10).max(22).optional(),
  // Web: a reading style for Paseo's replies, in CSS only (Paseo still draws them).
  markdownStyle: z.enum(["paseo", "document", "compact", "terminal"]).optional(),
  // Web: resting on a folded row shows its content after `hoverDelay` seconds.
  hoverPreviews: z.boolean().optional(),
  hoverDelay: z.number().min(0).max(10).optional(),
  previewWrap: z.boolean().optional(),
  previewLineNumbers: z.boolean().optional(),
  previewStripes: z.boolean().optional(),
  // Web: copy and cell selection on Paseo's tables.
  tableCopy: z.boolean().optional(),
  // Web: a Run button beside Copy code on shell code blocks in replies (on unless turned off).
  runButtons: z.boolean().optional(),
  // Web: where a Run button's output shows (under its code block, or only in the chat's card), how many
  // lines the panel under the block shows before it scrolls, its buttons, and whether the chat's card
  // still shows as one line while the panel does.
  runOutput: z.enum(["block", "card"]).optional(),
  runLines: z.union([z.literal(10), z.literal(15), z.literal(25), z.literal(40)]).optional(),
  runPanelButtons: z.enum(["icons", "both"]).optional(),
  runCard: z.enum(["line", "hidden"]).optional(),
  // The shell a Run button uses: the one the block's fence names (```bash runs in bash), or always the
  // login shell. `/run` always uses the login shell.
  runShell: z.enum(["block", "login"]).optional(),
});
export type PolishSettings = z.output<typeof polishSchema>;

// Each option's default; a saved value equal to it is removed (older Morphise versions reject keys
// they do not know, so an unchanged profile carries none).
export const POLISH_DEFAULTS: Partial<Record<keyof PolishSettings, unknown>> = { mergeMin: 2, diffLineNumbers: true, thoughtFirstLine: false, barButtons: "both", barPosition: "above", sideModel: "", thumbCorners: "rounded", replyWidth: "paseo", floatingRadius: 10, floatingGap: 8, loaderColor: "paseo", pageHeight: 0, uiFont: "paseo", markdownStyle: "paseo", hoverPreviews: false, hoverDelay: 1, previewWrap: true, previewLineNumbers: true, previewStripes: false, tableCopy: false, runButtons: true, runOutput: "block", runLines: 15, runPanelButtons: "icons", runCard: "line", runShell: "block", merge: true, failedOpen: true, images: "native", imageStacks: false, imageStackOpen: "hover", selection: true, restyle: false, window: "paseo", loader: "dots", loaderSize: "s", diagrams: "mermaid", iconSet: "lucide", html: false, syntax: "one-dark-darker-mariana" };

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
  mergeMin: 2 | 3 | 5;
  diffLineNumbers: boolean;
  thoughtFirstLine: boolean;
  barButtons: "both" | "icons";
  barPosition: "above" | "below";
  // "" is the chat's own model.
  sideModel: string;
  thumbCorners: "rounded" | "square";
  replyWidth: "paseo" | "narrow" | "wide" | "full";
  floatingRadius: 8 | 10 | 16;
  floatingGap: 4 | 8 | 12;
  loaderColor: "paseo" | "accent" | "text" | "muted";
  pageHeight: 500 | 800 | 0;
  uiFont: "paseo" | "system";
  // null follows the step sizes.
  textPx: number | null;
  codePx: number | null;
  markdownStyle: "paseo" | "document" | "compact" | "terminal";
  hoverPreviews: boolean;
  hoverDelay: number;
  previewWrap: boolean;
  previewLineNumbers: boolean;
  previewStripes: boolean;
  tableCopy: boolean;
  runButtons: boolean;
  runOutput: "block" | "card";
  runLines: 10 | 15 | 25 | 40;
  runPanelButtons: "icons" | "both";
  runCard: "line" | "hidden";
  runShell: "block" | "login";
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
    mergeMin: polish.mergeMin ?? 2,
    diffLineNumbers: polish.diffLineNumbers !== false,
    thoughtFirstLine: polish.thoughtFirstLine === true,
    barButtons: polish.barButtons ?? "both",
    barPosition: polish.barPosition ?? "above",
    sideModel: polish.sideModel ?? "",
    thumbCorners: polish.thumbCorners ?? "rounded",
    replyWidth: polish.replyWidth ?? "paseo",
    floatingRadius: polish.floatingRadius ?? 10,
    floatingGap: polish.floatingGap ?? 8,
    loaderColor: polish.loaderColor ?? "paseo",
    pageHeight: polish.pageHeight ?? 0,
    uiFont: polish.uiFont ?? "paseo",
    textPx: polish.textPx ?? null,
    codePx: polish.codePx ?? null,
    markdownStyle: polish.markdownStyle ?? "paseo",
    hoverPreviews: polish.hoverPreviews === true,
    hoverDelay: Math.round((polish.hoverDelay ?? 1) * 10) / 10,
    previewWrap: polish.previewWrap !== false,
    previewLineNumbers: polish.previewLineNumbers !== false,
    previewStripes: polish.previewStripes === true,
    tableCopy: polish.tableCopy === true,
    runButtons: polish.runButtons !== false,
    runOutput: polish.runOutput ?? "block",
    runLines: polish.runLines ?? 15,
    runPanelButtons: polish.runPanelButtons ?? "icons",
    runCard: polish.runCard ?? "line",
    runShell: polish.runShell ?? "block",
  };
}
