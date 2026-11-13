// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): client/web.ts, with Chat Polish's
// (lthieu96/paseo-chat-polish, MIT) client/web/selection-copy.ts "Copy Text / Markdown" in the same
// bar and Morphise's Bookmark added.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import type { PolishContext } from "../../context";
import { currentPrefs, subscribePrefs } from "../../prefs";
import { currentTheme } from "../../theme-registry";
import { SIDE_CHAT_PANEL_ID, appendToComposer, hasComposer, sendReply, startSideChat, workspaceOf } from "../actions";
import { BAR_ICONS, barItems, barTop, type BarItem } from "../bar-layout";
import { formatQuote, formatReply, sendBehaviorOf, type QuoteSource, type SendBehavior } from "../format";
import { choosePalette, parseColor, type Rgba } from "../palette";
import { say } from "../strings";
import { CHAT_SCROLL, chatAgentOf } from "../../web/chat-agent";

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

  const lines = lineRects(range);
  if (!lines) return null;

  return { source: readSource(selection, range, start), plain, ...lines, anchor: start, agentId: chatAgentOf(transcript) };
}

/** The range's first and last line boxes where they are now, or null when it has no box on screen. */
function lineRects(range: DomRange): Pick<Snapshot, "first" | "last"> | null {
  const rects = range.getClientRects();
  const bounds = range.getBoundingClientRect();
  const first = rects.length > 0 ? rects[0]! : bounds;
  const last = rects.length > 0 ? rects[rects.length - 1]! : bounds;
  if (first.width === 0 && first.height === 0) return null;
  return { first, last };
}

function readSource(selection: DomSelection, range: DomRange, start: DomElement): QuoteSource {
  const common = elementOf(range.commonAncestorContainer);
  // Text Morphise adds inside a code block (a run's output panel) is not the block's code.
  const block = common?.closest('[data-paseo-markdown-ignore="true"]') ? null : common?.closest(CODE_BLOCK) ?? null;
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

// Words are filled in on every show (`data-word` is the text, `data-title` the tooltip, `data-label` an icon-only button's
// accessible name), so the bar follows Paseo's language without being rebuilt. The bar's buttons are drawn from barItems.
const MARKUP = `
<style>${STYLE}</style>
<div class="panel" data-mode="bar">
  <div class="bar" role="toolbar"></div>
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

function barMarkup(item: BarItem): string {
  if (item.kind === "divider") return '<span class="divider"></span>';
  const icon = item.icon ? svg(BAR_ICONS[item.icon]) : "";
  const word = item.word ? `<span data-word="${item.word}"></span>` : "";
  if (item.kind === "lead") return `<span class="lead">${icon}${word}</span>`;
  const iconOnly = item.word ? "" : ` class="icon-only" data-label="${item.label}"`;
  return `<button data-action="${item.action}" data-title="${item.title}"${iconOnly}>${icon}${word}</button>`;
}

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
  const bar = shadow.querySelector(".bar")!;
  const button = (action: string) => shadow.querySelector(`[data-action="${action}"]`) as DomButton | null;
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
    for (const element of all("[data-label]")) element.setAttribute("aria-label", say(element.getAttribute("data-label") as Parameters<typeof say>[0]));
  };

  const setError = (text: string) => {
    error.textContent = text;
  };

  const place = (anchor: DomRect, prefer: "above" | "below") => {
    const width = panel.offsetWidth;
    const left = clamp(anchor.left + anchor.width / 2 - width / 2, GAP, window.innerWidth - width - GAP);
    host.style.setProperty("left", `${Math.round(left)}px`, "important");
    host.style.setProperty("top", `${Math.round(barTop(anchor, panel.offsetHeight, window.innerHeight, prefer, GAP))}px`, "important");
  };
  // The bar and its notes sit on the side the profile picks: above the selection's first line or below its last.
  const placeBar = (at: Snapshot) => {
    const prefer = currentPrefs().barPosition;
    place(prefer === "below" ? at.last : at.first, prefer);
  };

  const setBusy = (value: boolean) => {
    busy = value;
    field.readOnly = value;
    for (const action of ["add", "send", "ask", "cancel", "bookmark"]) {
      const target = button(action);
      if (target) target.disabled = value;
    }
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

  // The bar's markup as last written (reading innerHTML back gives the browser's own serialisation).
  let barShown = "";
  const showBar = (next: Snapshot, items: BarItem[]) => {
    snapshot = next;
    mode = "bar";
    panel.setAttribute("data-mode", "bar");
    // Rebuilt only when its buttons change: showBar runs again on each release over a shown bar, and a
    // rebuild there would drop a button's focus or a click in progress.
    const markup = items.map(barMarkup).join("");
    if (markup !== barShown) {
      bar.innerHTML = markup;
      barShown = markup;
    }
    relabel();
    // Everything but Copy acts on a chat, named by the active agent tab of the selection's pane.
    for (const action of ["quote", "reply", "side", "bookmark"]) {
      const target = button(action);
      if (target) target.disabled = !next.agentId;
    }
    applyPalette(host, next.anchor);
    host.style.setProperty("display", "block", "important");
    placeBar(next);
  };

  /** Shows a short result where the bar was: a success closes by itself, an error stays until dismissed. */
  const showNote = (at: Snapshot, text: string, tone: "ok" | "error") => {
    window.clearTimeout(noteTimer);
    snapshot = at;
    mode = "note";
    panel.setAttribute("data-mode", "note");
    note.setAttribute("data-tone", tone);
    note.querySelector(".note-icon")!.innerHTML = svg(tone === "ok" ? BAR_ICONS.check : BAR_ICONS.alert);
    note.querySelector(".note-text")!.textContent = text;
    applyPalette(host, at.anchor);
    host.style.setProperty("display", "block", "important");
    placeBar(at);
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
    button("add")!.hidden = kind !== "reply" || !canAdd;
    button("send")!.hidden = kind !== "reply";
    button("ask")!.hidden = kind !== "side";
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
      const side = await startSideChat(client.paseo, { agentId, quote: formatQuote(current.source), question, model: currentPrefs().sideModel });
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
    else if (defer && !button("add")!.hidden) addReply();
    else send();
  };
  field.addEventListener("keydown", onFieldKeyDown);

  const sync = () => {
    pending = 0;
    if (mode === "reply" || mode === "side" || busy) return;
    const items = barItems(currentPrefs());
    const next = items.length > 0 ? readSnapshot(host) : null;
    if (next) showBar(next, items);
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
  // A scroll or resize only moves the selection: the bar follows its lines without reading it again, since reading it fires a
  // copy event through the host on every frame of a streaming reply's auto-scroll.
  let moving = 0;
  const follow = () => {
    moving = 0;
    const selection = window.getSelection();
    if (mode !== "bar" || !snapshot || !selection || selection.isCollapsed || selection.rangeCount !== 1) return;
    const lines = lineRects(selection.getRangeAt(0));
    if (!lines) return hide();
    snapshot = { ...snapshot, ...lines };
    placeBar(snapshot);
  };
  const onViewportChange: DomListener = () => {
    if (mode === "bar" && moving === 0) moving = window.setTimeout(follow, 0);
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
    window.clearTimeout(moving);
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
