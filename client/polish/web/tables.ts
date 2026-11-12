// Ported from Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md): client/components/markdown/render/table-selection.ts
// Copying and cell selection on Paseo's own tables in replies (web and desktop), only while `tableCopy` is on. Nothing is added to
// Paseo's markup: the copy button and the menu float in the plugin's own layer, and selected cells only gain an attribute.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import { currentPrefs, subscribePrefs } from "../prefs";
import { appendToComposer, hasComposer } from "../selection/actions";
import { BAR_ICONS, barTop } from "../selection/bar-layout";
import { choosePalette, parseColor, type Rgba } from "../selection/palette";
import { say } from "../selection/strings";
import { currentTheme } from "../theme-registry";
import { paneAgentId, type DomElement } from "./dom";
import { alignColumns, cellRange, rangeHas, sameCell, selectionText, tableMarkdown, type CellPos, type CellRange } from "./table-copy";

type PageElement = DomElement & {
  contains(node: unknown): boolean;
  attachShadow(init: { mode: "open" }): { innerHTML: string; querySelector(selector: string): PageElement | null };
  setPointerCapture?(pointerId: number): void;
  offsetWidth: number;
  offsetHeight: number;
};
interface PointerLike {
  target: unknown;
  button: number;
  pointerId: number;
  pointerType?: string;
  clientX: number;
  clientY: number;
  metaKey: boolean;
  ctrlKey: boolean;
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
}
type Listener = (event: PointerLike) => void;
interface EventHost {
  addEventListener(type: string, listener: Listener, capture?: boolean): void;
  removeEventListener(type: string, listener: Listener, capture?: boolean): void;
}
declare const document: EventHost & {
  body: PageElement;
  head: PageElement;
  createElement(tag: "div" | "style"): PageElement;
  elementFromPoint(x: number, y: number): PageElement | null;
};
declare const window: EventHost & {
  innerWidth: number;
  innerHeight: number;
  getSelection(): { removeAllRanges(): void } | null;
  getComputedStyle(el: PageElement): { color: string; backgroundColor: string; fontFamily: string };
  setTimeout(cb: () => void, ms: number): number;
  clearTimeout(handle: number): void;
};
declare const navigator: { userAgent: string };

/** A cell of a table in a reply (Paseo draws reply tables as plain table, thead, tbody, tr, th and td). */
const CELL = '[data-testid="assistant-message"] table :is(th, td)';
const TABLE = '[data-testid="assistant-message"] table';
const SELECTED = "data-cp-cell-selected";
const DRAGGING = "data-cp-table-dragging";
const SIZE = 22;
const GAP = 8;
const NOTE_MS = 900;

// The box-shadow paints over striped and restyled cell backgrounds, which set `background` with higher specificity.
const PAGE_CSS = `
[${SELECTED}] { box-shadow: inset 0 0 0 9999px var(--enrm-selection-bg, rgba(56, 132, 255, 0.26)) !important; }
[${DRAGGING}], [${DRAGGING}] * { user-select: none !important; -webkit-user-select: none !important; }
`;

const svg = (paths: string) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel { display: flex; align-items: center; gap: 2px; padding: 3px; font-family: var(--pq-font); font-size: 13px; line-height: 18px; color: var(--pq-fg); background: var(--pq-bg); border: 1px solid var(--pq-border); border-radius: 10px; box-shadow: var(--pq-shadow); user-select: none; -webkit-user-select: none; }
.panel[data-tone="ok"] { color: var(--pq-success); }
.panel[data-tone="error"] { color: var(--pq-danger); }
.note { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; max-width: min(360px, calc(100vw - 16px)); overflow-wrap: anywhere; }
button { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 5px 9px; border: 0; border-radius: 7px; background: transparent; color: inherit; font: inherit; font-weight: 500; white-space: nowrap; cursor: pointer; }
button:hover { background: var(--pq-hover); }
.corner { width: ${SIZE}px; height: ${SIZE}px; padding: 0; border-radius: 6px; }
.corner button { width: 100%; height: 100%; padding: 0; border-radius: 5px; color: var(--pq-muted); }
.corner button:hover { color: var(--pq-fg); }
`;

/** Command on a Mac, Ctrl elsewhere (Ctrl on a Mac is a right click); a touch never adds. */
function addsRange(event: PointerLike): boolean {
  if (event.pointerType !== undefined && event.pointerType !== "mouse") return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? event.metaKey : event.ctrlKey;
}

const rowsOf = (table: PageElement) => Array.from(table.querySelectorAll("tr"));
const cellsOf = (row: DomElement) => Array.from(row.children);
const gridOf = (table: PageElement) => rowsOf(table).map((row) => cellsOf(row).map((cell) => cell.textContent ?? ""));
const cellOf = (target: unknown) => ((target as PageElement | null)?.closest?.(CELL) ?? null) as PageElement | null;
const tableOf = (cell: PageElement) => cell.closest("table") as PageElement;
function positionOf(cell: PageElement): CellPos {
  const row = cell.parentElement!;
  return { row: rowsOf(tableOf(cell)).indexOf(row), column: cellsOf(row).indexOf(cell) };
}

/** The chat's text colour and its nearest opaque background, as the selection bar reads them. */
function applyPalette(host: PageElement, anchor: PageElement) {
  const style = window.getComputedStyle(anchor);
  let background: Rgba | null = null;
  for (let node: PageElement | null = anchor; node && !background; node = node.parentElement as PageElement | null) {
    const color = parseColor(window.getComputedStyle(node).backgroundColor);
    if (color && color[3] > 0.95) background = color;
  }
  for (const [name, value] of choosePalette(currentTheme(), parseColor(style.color), background, style.fontFamily)) host.style.setProperty(name, value);
}

/** A fixed host on the page's body whose content lives in a shadow root, out of reach of Paseo's CSS. */
function floatingHost(markup: string) {
  const host = document.createElement("div");
  for (const [property, value] of [
    ["position", "fixed"],
    ["top", "0"],
    ["left", "0"],
    ["right", "auto"],
    ["bottom", "auto"],
    ["width", "auto"],
    ["height", "auto"],
    ["z-index", "2147483000"],
    ["display", "none"],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["background", "none"],
    ["overflow", "visible"],
  ] as const)
    host.style.setProperty(property, value, "important");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${STYLE}</style>${markup}`;
  document.body.appendChild(host);
  return { host, panel: shadow.querySelector(".panel")! };
}

function placeAt(host: PageElement, left: number, top: number) {
  host.style.setProperty("left", `${Math.round(left)}px`, "important");
  host.style.setProperty("top", `${Math.round(top)}px`, "important");
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

function startTables(composers: PluginClientContext["composers"]): () => void {
  const sheet = document.createElement("style");
  sheet.textContent = PAGE_CSS;
  document.head.appendChild(sheet);

  const corner = floatingHost(`<div class="panel corner"><button></button></div>`);
  const cornerButton = corner.panel.querySelector("button")!;
  const menu = floatingHost(`<div class="panel"></div>`);
  // A native popover leaves Escape to the menu instead of Paseo's window shortcuts (which interrupt the agent).
  menu.host.setAttribute("popover", "manual");
  const popover = menu.host as PageElement & { showPopover?(): void; hidePopover?(): void };

  let selected: { table: PageElement; ranges: CellRange[] } | null = null;
  let press: { table: PageElement; anchor: CellPos; pointer: number; add: boolean; active: boolean } | null = null;
  let swallowClick = false;
  let cornerTable: PageElement | null = null;
  let cornerTimer = 0;
  let menuTimer = 0;
  const marked = new Set<PageElement>();

  const inside = (host: PageElement, target: unknown) => target === host || host.contains(target);

  // The copy button straddles the top-left corner of the table under the pointer.
  const showCorner = (table: PageElement) => {
    if (cornerTable === table && corner.host.style.getPropertyValue("display") === "block") return;
    cornerTable = table;
    window.clearTimeout(cornerTimer);
    cornerButton.innerHTML = svg(BAR_ICONS.copy);
    cornerButton.setAttribute("title", say("markdownTitle"));
    cornerButton.setAttribute("aria-label", say("markdownTitle"));
    applyPalette(corner.host, table);
    const rect = table.getBoundingClientRect();
    const frame = table.parentElement?.getBoundingClientRect();
    placeAt(corner.host, Math.max(rect.left, frame?.left ?? rect.left) - SIZE / 2, rect.top - SIZE / 2);
    corner.host.style.setProperty("display", "block", "important");
  };
  const hideCorner = () => {
    window.clearTimeout(cornerTimer);
    cornerTable = null;
    corner.host.style.setProperty("display", "none", "important");
  };

  const paint = () => {
    for (const cell of marked) cell.removeAttribute(SELECTED);
    marked.clear();
    if (!selected) return;
    const ranges = alignColumns(selected.ranges);
    rowsOf(selected.table).forEach((row, r) =>
      cellsOf(row).forEach((cell, c) => {
        if (!rangeHas(ranges, r, c)) return;
        cell.setAttribute(SELECTED, "");
        marked.add(cell as PageElement);
      }),
    );
  };

  const hideMenu = () => {
    window.clearTimeout(menuTimer);
    if (popover.hidePopover && menu.host.matches(":popover-open")) popover.hidePopover();
    menu.host.style.setProperty("display", "none", "important");
  };
  const clear = () => {
    selected = null;
    paint();
    hideMenu();
  };

  const showMenuContent = (markup: string, tone?: "ok" | "error") => {
    menu.panel.innerHTML = markup;
    if (tone) menu.panel.setAttribute("data-tone", tone);
    else menu.panel.removeAttribute("data-tone");
  };
  // Beside the last range drawn: below it, or above when only that fits.
  const placeMenu = () => {
    const last = alignColumns(selected!.ranges).at(-1)!;
    const rows = rowsOf(selected!.table);
    const first = cellsOf(rows[last.top]!)[last.left]!.getBoundingClientRect();
    const end = cellsOf(rows[last.bottom]!)[last.right]!.getBoundingClientRect();
    const width = menu.panel.offsetWidth;
    const left = Math.min(Math.max(first.left, GAP), Math.max(GAP, window.innerWidth - width - GAP));
    placeAt(menu.host, left, barTop({ top: first.top, bottom: end.bottom }, menu.panel.offsetHeight, window.innerHeight, "below", GAP));
  };
  const showMenu = () => {
    if (!selected) return;
    showMenuContent(`<button data-action="copy">${svg(BAR_ICONS.copy)}<span>${say("copy")}</span></button><button data-action="add">${svg(BAR_ICONS.quote)}<span>${say("add")}</span></button>`);
    applyPalette(menu.host, selected.table);
    menu.host.style.setProperty("display", "block", "important");
    if (popover.showPopover && !menu.host.matches(":popover-open")) popover.showPopover();
    placeMenu();
  };
  const showNote = (text: string, tone: "ok" | "error") => {
    showMenuContent(`<span class="note">${tone === "ok" ? svg(BAR_ICONS.check) : svg(BAR_ICONS.alert)}<span></span></span>`, tone);
    menu.panel.querySelector(".note > span")!.textContent = text;
    if (selected) placeMenu();
    if (tone === "ok") menuTimer = window.setTimeout(clear, NOTE_MS);
  };

  const run = (work: () => Promise<boolean>) =>
    work().then(
      (copied) => (copied ? showNote(say("copied"), "ok") : clear()),
      (cause: unknown) => showNote(message(cause), "error"),
    );
  const copySelection = () => {
    const current = selected;
    if (current) void run(async () => (await copyText(selectionText(gridOf(current.table), current.ranges)), true));
  };
  // Through the composer, as the selection bar's Quote; a chat whose message box can't be found gets a copy instead.
  const addSelection = () => {
    const current = selected;
    if (!current) return;
    const text = selectionText(gridOf(current.table), current.ranges);
    const agentId = paneAgentId(current.table);
    void run(async () => {
      if (!agentId || !hasComposer(composers, agentId)) return (await copyText(text), true);
      await appendToComposer(composers, agentId, `${text}\n\n`);
      return false;
    });
  };
  const copyTable = () => {
    const table = cornerTable;
    if (!table) return;
    copyText(tableMarkdown(gridOf(table))).then(
      () => {
        cornerButton.innerHTML = svg(BAR_ICONS.check);
        window.clearTimeout(cornerTimer);
        cornerTimer = window.setTimeout(() => void (cornerButton.innerHTML = svg(BAR_ICONS.copy)), NOTE_MS);
      },
      (cause: unknown) => console.warn("[morphise] Table copy failed", cause),
    );
  };

  const activate = (current: NonNullable<typeof press>) => {
    current.active = true;
    window.getSelection()?.removeAllRanges();
    current.table.setAttribute(DRAGGING, "");
    try {
      current.table.setPointerCapture?.(current.pointer);
    } catch {
      // The pointer is already gone; its up event ends the range.
    }
    const start = cellRange(current.anchor, current.anchor);
    selected = current.add && selected?.table === current.table ? { table: current.table, ranges: [...selected.ranges, start] } : { table: current.table, ranges: [start] };
    hideMenu();
    paint();
  };
  // The cell under the pointer; past the table's edge, the nearest one in.
  const cellAt = (table: PageElement, x: number, y: number) => {
    const rect = table.getBoundingClientRect();
    const cell = cellOf(document.elementFromPoint(Math.min(Math.max(x, rect.left + 2), rect.right - 2), Math.min(Math.max(y, rect.top + 2), rect.bottom - 2)));
    return cell && tableOf(cell) === table ? positionOf(cell) : null;
  };

  const onPointerDown: Listener = (event) => {
    if (inside(menu.host, event.target) || inside(corner.host, event.target)) return;
    swallowClick = false;
    const cell = event.button === 0 ? cellOf(event.target) : null;
    const add = !!cell && addsRange(event);
    if (!add) clear();
    if (!cell) return;
    press = { table: tableOf(cell), anchor: positionOf(cell), pointer: event.pointerId, add, active: false };
    if (add) {
      // No browser text selection starts under the add key.
      event.preventDefault();
      activate(press);
    }
  };
  const onPointerMove: Listener = (event) => {
    const current = press;
    if (!current || event.pointerId !== current.pointer) return;
    const at = cellAt(current.table, event.clientX, event.clientY);
    if (!current.active) {
      // A drag inside one cell stays the browser's text selection.
      if (!at || sameCell(at, current.anchor)) return;
      activate(current);
    }
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    if (at && selected) {
      selected.ranges[selected.ranges.length - 1] = cellRange(current.anchor, at);
      paint();
    }
  };
  const onPointerUp: Listener = (event) => {
    const current = press;
    if (!current || event.pointerId !== current.pointer) return;
    press = null;
    if (!current.active) return;
    current.table.removeAttribute(DRAGGING);
    // An add press ends in a click, which would otherwise follow a link in the cell.
    swallowClick = current.add;
    showMenu();
  };
  const onClick: Listener = (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const onDoubleClick: Listener = (event) => {
    const cell = event.button === 0 && !addsRange(event) ? cellOf(event.target) : null;
    if (!cell?.textContent?.trim()) return;
    // Drop the browser's word highlight so only the cell's fill remains (and the selection bar finds nothing to show for).
    window.getSelection()?.removeAllRanges();
    const at = positionOf(cell);
    selected = { table: tableOf(cell), ranges: [cellRange(at, at)] };
    paint();
    showMenu();
    event.preventDefault();
  };
  const onKeyDown: Listener = (event) => {
    if (event.key !== "Escape" || !selected) return;
    event.preventDefault();
    event.stopPropagation();
    clear();
  };
  // Paseo scrolls the chat by itself while a reply streams: the button and the menu follow their
  // table, and go only once it has left the window.
  const visible = (table: PageElement) => {
    const rect = table.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };
  const onScroll: Listener = () => {
    if (cornerTable) {
      const table = cornerTable;
      cornerTable = null;
      if (visible(table)) showCorner(table);
      else hideCorner();
    }
    if (!selected || press) return;
    if (!visible(selected.table)) return clear();
    if (menu.host.style.getPropertyValue("display") === "block") placeMenu();
  };
  const onPointerOver: Listener = (event) => {
    if (inside(corner.host, event.target)) return;
    const table = ((event.target as PageElement | null)?.closest?.(TABLE) ?? null) as PageElement | null;
    if (table) showCorner(table);
    else if (cornerTable) hideCorner();
  };
  const onMenuMouseDown: Listener = (event) => event.preventDefault();
  const onMenuClick: Listener = (event) => {
    const action = (event.target as PageElement | null)?.closest?.("button[data-action]")?.getAttribute("data-action");
    if (action === "copy") copySelection();
    if (action === "add") addSelection();
  };
  const onCornerClick: Listener = () => copyTable();

  const page: Array<[EventHost, string, Listener, boolean]> = [
    [document, "pointerdown", onPointerDown, true],
    [document, "pointermove", onPointerMove, true],
    [document, "pointerup", onPointerUp, true],
    [document, "pointercancel", onPointerUp, true],
    [document, "click", onClick, true],
    [document, "dblclick", onDoubleClick, true],
    [document, "keydown", onKeyDown, true],
    [document, "pointerover", onPointerOver, true],
    [window, "scroll", onScroll, true],
    [menu.panel as unknown as EventHost, "mousedown", onMenuMouseDown, false],
    [menu.panel as unknown as EventHost, "click", onMenuClick, false],
    [corner.panel as unknown as EventHost, "click", onCornerClick, false],
  ];
  for (const [target, type, listener, capture] of page) target.addEventListener(type, listener, capture);

  return () => {
    for (const [target, type, listener, capture] of page) target.removeEventListener(type, listener, capture);
    press?.table.removeAttribute(DRAGGING);
    press = null;
    clear();
    window.clearTimeout(cornerTimer);
    corner.host.remove();
    menu.host.remove();
    sheet.remove();
  };
}

/** Table copying and cell selection while the profile's `tableCopy` is on; nothing at all while it is off. Returns cleanup. */
export function watchTables(client: Pick<PluginClientContext, "composers">): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const composers: PluginClientContext["composers"] = (selector) => client.composers(selector);
  let stop: (() => void) | null = null;
  const sync = () => {
    const on = currentPrefs().tableCopy;
    if (on && !stop) stop = startTables(composers);
    if (!on && stop) {
      stop();
      stop = null;
    }
  };
  sync();
  const unsubscribe = subscribePrefs(sync);
  return () => {
    unsubscribe();
    stop?.();
    stop = null;
  };
}
