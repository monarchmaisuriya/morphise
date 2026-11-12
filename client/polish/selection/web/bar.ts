// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): client/web.ts, with Chat Polish's
// (lthieu96/paseo-chat-polish, MIT) client/web/selection-copy.ts "Copy Text / Markdown" in the same
// bar and Morphise's Bookmark added.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import type { SelectionAction } from "../../../../shared/polish/prefs";
import type { PolishContext } from "../../context";
import { currentPrefs, subscribePrefs } from "../../prefs";
import { currentTheme } from "../../theme-registry";
import { SIDE_CHAT_PANEL_ID, appendToComposer, hasComposer, sendReply, shownActions, startSideChat, workspaceOf } from "../actions";
import { formatQuote, formatReply, sendBehaviorOf, type QuoteSource, type SendBehavior } from "../format";
import { choosePalette, parseColor, type Rgba } from "../palette";
import { say } from "../strings";

/*
 * The selection bar: Quote, Reply, Side chat, Copy (Text or Markdown), and Bookmark for text
 * selected in a chat. Web and desktop only: iOS and Android route selection through the platform
 * menu, which a plugin cannot extend.
 *
 * The plugin API has no selection hook and no portal, so this module reads the selection from the
 * host DOM. Every host selector it relies on is listed below; when a Paseo release renames one,
 * this list is the place to fix. Writing into a message box goes through the plugin's composer API.
 *
 * The bar lives in a shadow root on `document.body`: the chat clips and translates its content, and
 * the host's global CSS would otherwise restyle the bar. The reply field is the one exception. It is
 * a light-DOM textarea slotted into the shadow tree, because the host's keyboard shortcuts classify
 * the event target: a textarea reads as "editable", while anything inside a shadow root reads as
 * the shadow host, where Escape interrupts the agent and Space toggles voice.
 */

// ---------------------------------------------------------------------------
// Host DOM contract (checked against the Paseo 0.16.0-beta.2 bundle)

/** One chat transcript. Inactive tabs keep theirs mounted with `display: none`. */
const CHAT_SCROLL = '[data-testid="agent-chat-scroll"]';
/** A split-view pane; its tab row names the agent whose chat it shows. */
const PANE = '[data-testid^="workspace-pane-"]';
const ACTIVE_AGENT_TAB = '[data-testid^="workspace-tab-agent_"][aria-selected="true"]';
const AGENT_TAB_PREFIX = "workspace-tab-agent_";
/** Markdown serialization hints the host puts on rendered assistant messages. */
const CODE_BLOCK = '[data-paseo-markdown-tag="pre"]';
const CODE_SPAN = '[data-paseo-markdown-tag="code"]';
const CODE_LANGUAGE_ATTRIBUTE = "data-paseo-markdown-language";
/** Monospace surfaces such as tool output. */
const CODE_SURFACE = "[data-pmono]";
/** Paseo's app settings; read only, for Settings → Sending → Default send. The legacy key predates it. */
const APP_SETTINGS_KEYS = ["@paseo:app-settings", "@paseo:settings"];

// ---------------------------------------------------------------------------
// The DOM this module uses. The plugin typechecks without the DOM library.

interface DomRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface DomEvent {
  readonly type: string;
  readonly target: DomNode | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface DomKeyboardEvent extends DomEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
}

type DomListener = (event: DomEvent) => void;

interface DomEventTarget {
  addEventListener(type: string, listener: DomListener, capture?: boolean): void;
  removeEventListener(type: string, listener: DomListener, capture?: boolean): void;
  dispatchEvent(event: DomEvent): boolean;
}

interface DomNode extends DomEventTarget {
  readonly nodeType: number;
  readonly parentElement: DomElement | null;
  readonly isConnected: boolean;
}

interface DomStyle {
  setProperty(name: string, value: string, priority?: string): void;
  readonly color: string;
  readonly backgroundColor: string;
  readonly fontFamily: string;
}

interface DomElement extends DomNode {
  readonly style: DomStyle;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
  textContent: string | null;
  innerHTML: string;
  hidden: boolean;
  closest(selector: string): DomElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  appendChild<Child extends DomNode>(child: Child): Child;
  contains(node: DomNode | null): boolean;
  remove(): void;
  getClientRects(): ArrayLike<DomRect>;
  attachShadow(init: { mode: "open" }): DomShadowRoot;
  focus(options?: { preventScroll?: boolean }): void;
}

interface DomButton extends DomElement {
  disabled: boolean;
}

interface DomShadowRoot {
  innerHTML: string;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
}

interface DomTextArea extends DomElement {
  value: string;
  placeholder: string;
  rows: number;
  readOnly: boolean;
}

interface DomRange {
  readonly startContainer: DomNode;
  readonly endContainer: DomNode;
  readonly commonAncestorContainer: DomNode;
  getClientRects(): ArrayLike<DomRect>;
  getBoundingClientRect(): DomRect;
}

interface DomSelection {
  readonly isCollapsed: boolean;
  readonly rangeCount: number;
  getRangeAt(index: number): DomRange;
  toString(): string;
}

interface DomDataTransfer {
  getData(format: string): string;
}

declare const window: DomEventTarget & {
  readonly innerWidth: number;
  readonly innerHeight: number;
  getSelection(): DomSelection | null;
  getComputedStyle(element: DomElement): DomStyle;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
};
declare const document: DomEventTarget & {
  readonly body: DomElement;
  createElement(tag: "div"): DomElement;
  createElement(tag: "textarea"): DomTextArea;
};
declare const DataTransfer: new () => DomDataTransfer;
declare const ClipboardEvent: new (type: string, init: { bubbles: boolean; cancelable: boolean; clipboardData: DomDataTransfer }) => DomEvent;
declare const localStorage: { getItem(key: string): string | null };
declare const navigator: { readonly userAgent: string };

const ELEMENT_NODE = 1;

/** Settings → Sending → Default send, as the composer reads it; Paseo's default off the web. */
export function readSendBehavior(): SendBehavior {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return "steer";
  for (const key of APP_SETTINGS_KEYS) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return "steer";
    }
    const behavior = sendBehaviorOf(raw);
    if (behavior) return behavior;
  }
  return "steer";
}

/** Only called on the web, where `navigator` exists. */
function modKey(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

// ---------------------------------------------------------------------------
// Reading a selection

interface Snapshot {
  source: QuoteSource;
  /** Rendered text as selected: the preview and Copy Text. */
  plain: string;
  first: DomRect;
  last: DomRect;
  /** Where the selection's text is taken from; supplies the bar's colours. */
  anchor: DomElement;
  agentId: string | null;
}

function elementOf(node: DomNode | null): DomElement | null {
  if (!node) return null;
  return node.nodeType === ELEMENT_NODE ? (node as DomElement) : node.parentElement;
}

/** The live selection, or null unless it is non-empty and both of its ends sit in the same chat transcript. */
function readSnapshot(ignore: DomElement): Snapshot | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const plain = selection.toString();
  if (!plain.trim()) return null;

  const range = selection.getRangeAt(0);
  const start = elementOf(range.startContainer);
  const end = elementOf(range.endContainer);
  if (!start || !end || ignore.contains(start)) return null;
  const transcript = start.closest(CHAT_SCROLL);
  if (!transcript || end.closest(CHAT_SCROLL) !== transcript) return null;

  const rects = range.getClientRects();
  const bounds = range.getBoundingClientRect();
  const first = rects.length > 0 ? rects[0]! : bounds;
  const last = rects.length > 0 ? rects[rects.length - 1]! : bounds;
  if (first.width === 0 && first.height === 0) return null;

  return { source: readSource(selection, range, start), plain, first, last, anchor: start, agentId: agentIdOf(nearestUnique(transcript, ACTIVE_AGENT_TAB)) };
}

/**
 * The first visible match walking up from `from`, stopping at its pane. Two visible matches at the
 * same level mean two chats share it: no answer beats a wrong one.
 */
function nearestUnique(from: DomElement, selector: string): DomElement | null {
  for (let node = from.parentElement; node; node = node.parentElement) {
    const visible = Array.from(node.querySelectorAll(selector)).filter((element) => element.getClientRects().length > 0);
    if (visible.length === 1) return visible[0]!;
    if (visible.length > 1 || node.matches(PANE)) return null;
  }
  return null;
}

function agentIdOf(tab: DomElement | null): string | null {
  const testId = tab?.getAttribute("data-testid");
  return testId?.startsWith(AGENT_TAB_PREFIX) ? testId.slice(AGENT_TAB_PREFIX.length) || null : null;
}

function readSource(selection: DomSelection, range: DomRange, start: DomElement): QuoteSource {
  const common = elementOf(range.commonAncestorContainer);
  const block = common?.closest(CODE_BLOCK) ?? null;
  const inCode = Boolean(block || common?.closest(CODE_SPAN) || common?.closest(CODE_SURFACE));
  const code = inCode ? { language: block?.getAttribute(CODE_LANGUAGE_ATTRIBUTE) ?? null } : null;
  return { text: hostMarkdown(start) ?? selection.toString(), code };
}

/**
 * The selection as Markdown, from the host's own copy handler.
 *
 * Assistant messages carry a copy handler that turns the selection back into Markdown: lists,
 * tables, emphasis, and fences survive. A synthetic copy event with a private DataTransfer runs that
 * handler without touching the system clipboard. Selections the handler does not own come back null.
 */
function hostMarkdown(target: DomElement): string | null {
  if (typeof ClipboardEvent === "undefined" || typeof DataTransfer === "undefined") return null;
  try {
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData });
    target.dispatchEvent(event);
    if (!event.defaultPrevented) return null;
    const text = clipboardData.getData("text/plain");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/** The chat's text colour and its nearest opaque background, for the bar's palette. */
function applyPalette(host: DomElement, anchor: DomElement): void {
  const style = window.getComputedStyle(anchor);
  let background: Rgba | null = null;
  for (let node: DomElement | null = anchor; node && !background; node = node.parentElement) {
    const color = parseColor(window.getComputedStyle(node).backgroundColor);
    if (color && color[3] > 0.95) background = color;
  }
  for (const [name, value] of choosePalette(currentTheme(), parseColor(style.color), background, style.fontFamily)) host.style.setProperty(name, value);
}

// ---------------------------------------------------------------------------
// The bar, the note, and the reply card

const ICON = {
  quote:
    '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  side: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
} as const;

function svg(paths: string): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.panel {
  font-family: var(--pq-font);
  font-size: 13px;
  line-height: 18px;
  color: var(--pq-fg);
  background: var(--pq-bg);
  border: 1px solid var(--pq-border);
  border-radius: 10px;
  box-shadow: var(--pq-shadow);
  user-select: none;
  -webkit-user-select: none;
}
.bar { display: flex; align-items: center; gap: 2px; padding: 3px; }
.note { display: none; align-items: center; gap: 6px; padding: 6px 10px; max-width: min(360px, calc(100vw - 16px)); overflow-wrap: anywhere; }
.note[data-tone="ok"] { color: var(--pq-success); }
.note[data-tone="error"] { color: var(--pq-danger); }
.note svg { flex: 0 0 auto; }
.card { display: none; flex-direction: column; gap: 8px; padding: 10px; width: min(440px, calc(100vw - 16px)); }
.panel[data-mode="note"] .bar, .panel[data-mode="card"] .bar { display: none; }
.panel[data-mode="note"] .note { display: flex; }
.panel[data-mode="card"] .card { display: flex; }
button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  margin: 0;
  padding: 5px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
button:hover:not(:disabled) { background: var(--pq-hover); }
button:disabled { opacity: 0.4; cursor: default; }
.icon-only { padding: 5px 7px; }
.lead { display: inline-flex; align-items: center; gap: 5px; padding: 0 2px 0 7px; color: var(--pq-muted); }
.divider { width: 1px; align-self: stretch; margin: 4px 2px; background: var(--pq-border); }
.quote {
  max-height: 54px;
  overflow: hidden;
  padding-left: 9px;
  border-left: 2px solid var(--pq-border);
  color: var(--pq-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.footer { display: flex; align-items: center; gap: 6px; }
.hint { flex: 1 1 auto; min-width: 0; color: var(--pq-faint); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.error { flex: 1 1 auto; min-width: 0; color: var(--pq-danger); font-size: 12px; overflow-wrap: anywhere; }
.error:empty { display: none; }
.error:not(:empty) + .hint { display: none; }
.primary { background: var(--pq-fg); color: var(--pq-primary-fg); }
.primary:hover:not(:disabled) { background: var(--pq-fg); opacity: 0.88; }
`;

// Words are filled in on every show (`data-word` is the text, `data-title` the tooltip), so the bar
// follows Paseo's language without being rebuilt.
const MARKUP = `
<style>${STYLE}</style>
<div class="panel" data-mode="bar">
  <div class="bar" role="toolbar">
    <button data-action="quote" data-title="quoteTitle">${svg(ICON.quote)}<span data-word="quote"></span></button>
    <button data-action="reply" data-title="replyTitle">${svg(ICON.reply)}<span data-word="reply"></span></button>
    <button data-action="side" data-title="sideTitle">${svg(ICON.side)}<span data-word="side"></span></button>
    <span class="divider" data-divider="copy"></span>
    <span class="lead" data-group="copy">${svg(ICON.copy)}<span data-word="copy"></span></span>
    <button data-action="copy-text" data-group="copy" data-title="textTitle"><span data-word="text"></span></button>
    <button data-action="copy-markdown" data-group="copy" data-title="markdownTitle"><span data-word="markdown"></span></button>
    <span class="divider" data-divider="bookmark"></span>
    <button data-action="bookmark" class="icon-only" data-title="bookmarkTitle">${svg(ICON.bookmark)}</button>
  </div>
  <div class="note" role="status"><span class="note-icon"></span><span class="note-text"></span></div>
  <div class="card">
    <div class="quote"></div>
    <slot name="input"></slot>
    <div class="footer">
      <span class="error" role="alert"></span>
      <span class="hint"></span>
      <button data-action="cancel"><span data-word="cancel"></span></button>
      <button data-action="add"><span data-word="add"></span></button>
      <button data-action="send" class="primary"><span data-word="send"></span></button>
      <button data-action="ask" class="primary"><span data-word="ask"></span></button>
    </div>
  </div>
</div>
`;

type Mode = "hidden" | "bar" | "note" | "reply" | "side";

const GAP = 8;
/** How long a success note ("Copied", "Bookmarked") stays before the bar closes. */
const NOTE_MS = 900;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

type BarDeps = Pick<PolishContext, "client" | "bookmarkPassage">;

/** Installs the selection bar. Returns cleanup; a no-op off the web. */
export function installSelectionBar({ client, bookmarkPassage }: BarDeps): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const composers: PluginClientContext["composers"] = (selector) => client.composers(selector);

  const host = document.createElement("div");
  host.setAttribute("data-morphise-selection", "");
  for (const [property, value] of [
    ["position", "fixed"],
    ["top", "0"],
    ["left", "0"],
    ["z-index", "2147483000"],
    ["display", "none"],
    ["margin", "0"],
    ["padding", "0"],
  ] as const) {
    host.style.setProperty(property, value, "important");
  }
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = MARKUP;
  const panel = shadow.querySelector(".panel")!;
  const note = shadow.querySelector(".note")!;
  const quotePreview = shadow.querySelector(".quote")!;
  const hint = shadow.querySelector(".hint")!;
  const error = shadow.querySelector(".error")!;
  const button = (action: string) => shadow.querySelector(`[data-action="${action}"]`) as DomButton;
  const all = (selector: string) => Array.from(shadow.querySelectorAll(selector));

  const field = document.createElement("textarea");
  field.setAttribute("slot", "input");
  field.setAttribute("spellcheck", "true");
  field.rows = 3;
  for (const [property, value] of [
    ["all", "unset"],
    ["display", "block"],
    ["box-sizing", "border-box"],
    ["width", "100%"],
    ["min-height", "62px"],
    ["max-height", "220px"],
    ["padding", "8px 10px"],
    ["border", "1px solid var(--pq-border)"],
    ["border-radius", "8px"],
    ["background", "var(--pq-field)"],
    ["color", "var(--pq-fg)"],
    ["font-family", "var(--pq-font)"],
    ["font-size", "13px"],
    ["line-height", "19px"],
    ["white-space", "pre-wrap"],
    ["overflow-wrap", "anywhere"],
    ["overflow-y", "auto"],
    ["resize", "vertical"],
    ["user-select", "text"],
    ["-webkit-user-select", "text"],
    ["cursor", "text"],
  ] as const) {
    field.style.setProperty(property, value, "important");
  }
  host.appendChild(field);
  document.body.appendChild(host);

  let mode: Mode = "hidden";
  let snapshot: Snapshot | null = null;
  let busy = false;
  let pending = 0;
  let noteTimer = 0;

  const relabel = () => {
    for (const element of all("[data-word]")) element.textContent = say(element.getAttribute("data-word") as Parameters<typeof say>[0]);
    for (const element of all("[data-title]")) element.setAttribute("title", say(element.getAttribute("data-title") as Parameters<typeof say>[0]));
  };

  // Only the actions the profile turns on; a divider only between two groups that both show.
  const showActions = (shown: SelectionAction[]) => {
    const on = (action: SelectionAction) => shown.includes(action);
    for (const action of ["quote", "reply", "side", "bookmark"] as const) button(action).hidden = !on(action);
    for (const element of all('[data-group="copy"]')) element.hidden = !on("copy");
    const answers = on("quote") || on("reply") || on("side");
    shadow.querySelector('[data-divider="copy"]')!.hidden = !(on("copy") && answers);
    shadow.querySelector('[data-divider="bookmark"]')!.hidden = !(on("bookmark") && (answers || on("copy")));
  };

  const setError = (text: string) => {
    error.textContent = text;
  };

  const place = (anchor: DomRect, prefer: "above" | "below") => {
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = clamp(anchor.left + anchor.width / 2 - width / 2, GAP, window.innerWidth - width - GAP);
    const above = anchor.top - height - GAP;
    const below = anchor.bottom + GAP;
    const fitsAbove = above >= GAP;
    const fitsBelow = below + height <= window.innerHeight - GAP;
    const top = prefer === "above" ? (fitsAbove || !fitsBelow ? above : below) : fitsBelow || !fitsAbove ? below : above;
    host.style.setProperty("left", `${Math.round(left)}px`, "important");
    host.style.setProperty("top", `${Math.round(clamp(top, GAP, window.innerHeight - height - GAP))}px`, "important");
  };

  const setBusy = (value: boolean) => {
    busy = value;
    field.readOnly = value;
    for (const action of ["add", "send", "ask", "cancel", "bookmark"]) button(action).disabled = value;
  };

  const hide = () => {
    window.clearTimeout(noteTimer);
    mode = "hidden";
    snapshot = null;
    setBusy(false);
    field.value = "";
    setError("");
    panel.setAttribute("data-mode", "bar");
    host.style.setProperty("display", "none", "important");
  };

  const showBar = (next: Snapshot, shown: SelectionAction[]) => {
    snapshot = next;
    mode = "bar";
    panel.setAttribute("data-mode", "bar");
    relabel();
    showActions(shown);
    // Everything but Copy acts on a chat, named by the active agent tab of the selection's pane.
    for (const action of ["quote", "reply", "side", "bookmark"]) button(action).disabled = !next.agentId;
    applyPalette(host, next.anchor);
    host.style.setProperty("display", "block", "important");
    place(next.first, "above");
  };

  /** Shows a short result where the bar was: a success closes by itself, an error stays until dismissed. */
  const showNote = (at: Snapshot, text: string, tone: "ok" | "error") => {
    window.clearTimeout(noteTimer);
    snapshot = at;
    mode = "note";
    panel.setAttribute("data-mode", "note");
    note.setAttribute("data-tone", tone);
    note.querySelector(".note-icon")!.innerHTML = svg(tone === "ok" ? ICON.check : ICON.alert);
    note.querySelector(".note-text")!.textContent = text;
    applyPalette(host, at.anchor);
    host.style.setProperty("display", "block", "important");
    place(at.first, "above");
    if (tone === "ok") noteTimer = window.setTimeout(hide, NOTE_MS);
  };

  const openCard = (kind: "reply" | "side") => {
    if (!snapshot?.agentId) return;
    mode = kind;
    panel.setAttribute("data-mode", "card");
    quotePreview.textContent = snapshot.plain.trim();
    setError("");
    field.value = "";
    const canAdd = hasComposer(composers, snapshot.agentId);
    button("add").hidden = kind !== "reply" || !canAdd;
    button("send").hidden = kind !== "reply";
    button("ask").hidden = kind !== "side";
    if (kind === "reply") {
      field.placeholder = say("replyPlaceholder");
      hint.textContent = canAdd ? say("hintSendAdd", { mod: modKey() }) : say("hintSend");
    } else {
      field.placeholder = say("sidePlaceholder");
      hint.textContent = say("hintAsk");
    }
    place(snapshot.last, "below");
    field.focus({ preventScroll: true });
  };

  /** Runs a bar button's work; the note says how it went. Without a note the bar just closes. */
  const runBar = (work: (current: Snapshot) => Promise<string | void>) => {
    const current = snapshot;
    if (!current || busy) return;
    setBusy(true);
    work(current).then(
      (done) => {
        setBusy(false);
        if (done) showNote(current, done, "ok");
        else hide();
      },
      (cause: unknown) => {
        setBusy(false);
        showNote(current, message(cause), "error");
      },
    );
  };

  const quote = () =>
    runBar(async (current) => {
      if (current.agentId) await appendToComposer(composers, current.agentId, `${formatQuote(current.source)}\n\n`);
    });

  const copy = (kind: "text" | "markdown") =>
    runBar(async (current) => {
      await copyText(kind === "text" ? current.plain : current.source.text.trim());
      return say("copied");
    });

  const bookmark = () =>
    runBar(async (current) => {
      const agentId = current.agentId;
      if (!agentId) return;
      await bookmarkPassage({ agentId, workspaceId: await workspaceOf(client.paseo, agentId), excerpt: current.source.text.trim() });
      return say("bookmarked");
    });

  /** Runs a card's work, then closes; a returned note stays on screen for a moment first. */
  const runCard = async (work: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const done = await work();
      if (!done) {
        hide();
        return;
      }
      hint.textContent = done;
      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(hide, 1400);
    } catch (cause) {
      setBusy(false);
      setError(message(cause));
      field.focus({ preventScroll: true });
    }
  };

  const addReply = () => {
    const current = snapshot;
    if (!current?.agentId) return;
    const agentId = current.agentId;
    const text = formatReply(current.source, field.value);
    void runCard(() => appendToComposer(composers, agentId, text));
  };

  const send = () => {
    const current = snapshot;
    if (!current?.agentId || !field.value.trim()) return;
    const agentId = current.agentId;
    const text = formatReply(current.source, field.value);
    void runCard(async () => ((await sendReply(client.paseo, agentId, text, readSendBehavior())) === "queued" ? say("queued") : undefined));
  };

  const askSide = () => {
    const current = snapshot;
    if (!current?.agentId || !field.value.trim()) return;
    const agentId = current.agentId;
    const question = field.value;
    void runCard(async () => {
      const side = await startSideChat(client.paseo, { agentId, quote: formatQuote(current.source), question });
      client.openPanel(SIDE_CHAT_PANEL_ID, { workspaceId: side.workspaceId, agentId: side.agentId, location: "explorer" });
    });
  };

  const actions: Record<string, () => void> = {
    quote,
    reply: () => openCard("reply"),
    side: () => openCard("side"),
    "copy-text": () => copy("text"),
    "copy-markdown": () => copy("markdown"),
    bookmark,
    cancel: hide,
    add: addReply,
    send,
    ask: askSide,
  };

  // A press inside the panel must not move the caret, or the page selection is gone by the time
  // the click lands. The slotted field is exempt: it needs focus.
  const onPanelPointerDown: DomListener = (event) => {
    if (event.target !== field) event.preventDefault();
  };
  const onPanelClick: DomListener = (event) => {
    const target = elementOf(event.target)?.closest("button[data-action]") as DomButton | null;
    const action = target?.getAttribute("data-action");
    if (action && !target!.disabled) actions[action]?.();
  };
  // On the panel, inside the shadow tree: a listener on the host would only ever see the host as the target.
  panel.addEventListener("mousedown", onPanelPointerDown);
  panel.addEventListener("click", onPanelClick);

  const onFieldKeyDown: DomListener = (raw) => {
    const event = raw as DomKeyboardEvent;
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Enter is the highlighted action, Send; the modifier defers into the composer.
    const defer = event.ctrlKey || event.metaKey;
    if (mode === "side") askSide();
    else if (defer && !button("add").hidden) addReply();
    else send();
  };
  field.addEventListener("keydown", onFieldKeyDown);

  const sync = () => {
    pending = 0;
    if (mode === "reply" || mode === "side" || busy) return;
    const shown = shownActions(currentPrefs());
    const next = shown.length > 0 ? readSnapshot(host) : null;
    if (next) showBar(next, shown);
    else if (mode === "bar") hide();
  };
  const schedule = () => {
    if (pending === 0) pending = window.setTimeout(sync, 0);
  };

  const inside = (event: DomEvent) => event.target !== null && host.contains(event.target);

  const onPointerDown: DomListener = (event) => {
    if (inside(event) || mode === "hidden") return;
    // An unsent reply survives a stray click; Escape or Cancel discards it.
    if ((mode === "reply" || mode === "side") && field.value.trim()) return;
    hide();
  };
  const onPointerUp: DomListener = (event) => {
    if (!inside(event)) schedule();
  };
  const onKeyUp: DomListener = (raw) => {
    const event = raw as DomKeyboardEvent;
    if (event.shiftKey && !inside(event)) schedule();
  };
  const onSelectionChange: DomListener = () => {
    // Show on release, not while dragging; hide as soon as the selection goes.
    if (mode !== "bar" || busy) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) hide();
  };
  const onViewportChange: DomListener = () => {
    if (mode === "bar") schedule();
  };
  // A bar drawn with the old buttons closes when the profile changes them.
  const stopPrefs = subscribePrefs(() => {
    if (mode === "bar") hide();
  });

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);

  return () => {
    stopPrefs();
    window.clearTimeout(pending);
    window.clearTimeout(noteTimer);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("selectionchange", onSelectionChange);
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
    panel.removeEventListener("mousedown", onPanelPointerDown);
    panel.removeEventListener("click", onPanelClick);
    field.removeEventListener("keydown", onFieldKeyDown);
    host.remove();
  };
}
