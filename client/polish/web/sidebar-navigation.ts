import { Platform } from "react-native";
import { applyStyleSheet } from "../../web";
import { watchDom, type DomElement, type WebDocument } from "./dom";
import { currentPrefs, subscribePrefs } from "../prefs";

declare const document: WebDocument;
declare function getComputedStyle(element: DomElement): { visibility: string; display: string };

const BUILTIN = '[data-testid="sidebar-search"], [data-testid="sidebar-global-new-workspace"], [data-testid="sidebar-schedules"], [data-testid="sidebar-sessions"]';
const PLUGIN = '[data-testid^="plugin-sidebar-"]:not([data-testid^="plugin-sidebar-footer-"]):not([data-testid$="-popover"])';
const NAV = `${BUILTIN}, ${PLUGIN}`;
const EXCLUDED = '[data-testid="sidebar-footer"], [data-testid="workspace-explorer-sidebar"], [data-testid^="sidebar-workspace-row-"], [data-testid="left-sidebar-resize-handle"]';

export const SIDEBAR_NAVIGATION_CSS = `
[data-morphise-nav-group] { border-bottom-width: 0 !important; padding-bottom: 0 !important; gap: 8px !important; }
[data-morphise-nav-row] { border: 1px solid var(--colors-border) !important; border-radius: 8px !important; background-color: transparent !important; }
[data-morphise-nav-row]:hover, [data-morphise-nav-row]:focus-within, [data-morphise-nav-row]:has(> [aria-selected="true"]) { background-color: var(--colors-surface-sidebar-hover, var(--colors-surface2)) !important; }
[data-morphise-nav-group="center"] [data-morphise-nav-row] > [data-testid] { justify-content: center !important; }
[data-morphise-nav-group="right"] [data-morphise-nav-row] > [data-testid] { justify-content: flex-end !important; }
[data-morphise-nav-group="left"] [data-morphise-nav-row] > [data-testid] { justify-content: flex-start !important; }
[data-morphise-nav-row="filled"] { background-color: var(--colors-surface-sidebar-hover, var(--colors-surface2)) !important; }
[data-morphise-nav-row="filled"]:hover, [data-morphise-nav-row="filled"]:focus-within, [data-morphise-nav-row="filled"]:has(> [aria-selected="true"]) { background-color: color-mix(in srgb, var(--colors-foreground) 12%, var(--colors-surface-sidebar-hover, var(--colors-surface2))) !important; }
[data-morphise-nav-row]:has(> [aria-selected="true"]) { box-shadow: inset 0 0 0 1px var(--colors-foreground-muted, var(--colors-border)); }
[data-morphise-nav-row]:has(> :focus-visible) { outline: 2px solid var(--colors-foreground); outline-offset: -2px; }
[data-morphise-nav-row]:has(> :is([data-testid="sidebar-search"], [data-testid="sidebar-global-new-workspace"])) > :not([data-testid]) { display: none !important; }
[data-morphise-nav-separator] { display: none !important; }
[data-morphise-nav-layout="split"], [data-morphise-nav-layout="tiles"] { display: grid !important; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px !important; padding-inline: 8px; }
[data-morphise-nav-slot]:not([hidden]):not([aria-hidden="true"]) { display: flex !important; }
[data-morphise-nav-slot] { align-items: stretch !important; min-width: 0 !important; grid-column: span 6; padding-inline: 0 !important; }
[data-morphise-nav-slot="half"] { grid-column: span 3; }
[data-morphise-nav-slot="tile"] { grid-column: span 2; }
[data-morphise-nav-tile-columns="2"] { grid-column: span 3; }
[data-morphise-nav-tile-columns="1"] { grid-column: span 6; }
[data-morphise-nav-layout="tiles"] [data-morphise-nav-slot="full"] [data-morphise-nav-row] { min-height: 36px !important; }
[data-morphise-nav-layout="tiles"] [data-morphise-nav-slot="full"] [data-morphise-nav-row] > [data-testid] { min-height: 34px !important; }
[data-morphise-nav-slot] [data-morphise-nav-row] { min-width: 0; }
[data-morphise-nav-stretch] { width: 100% !important; min-width: 0 !important; max-width: 100% !important; align-self: stretch !important; box-sizing: border-box !important; padding-inline: 0 !important; }
[data-morphise-nav-tile-height="56"] { --morphise-nav-tile-height: 56px; }
[data-morphise-nav-tile-height="38"] { --morphise-nav-tile-height: 38px; }
[data-morphise-nav-tile-height="42"] { --morphise-nav-tile-height: 42px; }
[data-morphise-nav-tile-height="64"] { --morphise-nav-tile-height: 64px; }
[data-morphise-nav-tile-height="72"] { --morphise-nav-tile-height: 72px; }
[data-morphise-nav-slot="tile"] [data-morphise-nav-row] { position: relative; min-height: var(--morphise-nav-tile-height, 48px); height: 100%; align-items: stretch !important; }
[data-morphise-nav-slot="tile"] [data-morphise-nav-row] > [data-testid] { flex-direction: column !important; justify-content: center !important; gap: 2px !important; padding: 5px 4px !important; min-width: 0; }
[data-morphise-nav-slot="tile"] [data-morphise-nav-row] > [data-testid] > :last-child { text-align: center; font-size: 11px !important; line-height: 14px !important; white-space: normal !important; overflow-wrap: anywhere; }
[data-morphise-nav-slot="tile"] [data-morphise-nav-row] > :has(> :is([data-testid="quick-chat-state-count"], [data-testid="workbench-state-count"])) { position: absolute !important; display: flex !important; flex-direction: row !important; left: calc(50% + 12px); top: 0; bottom: 0; padding: 0 !important; align-items: center !important; justify-content: center; pointer-events: auto; }
[data-morphise-nav-slot="tile"] :is([data-testid="quick-chat-state-count"], [data-testid="workbench-state-count"]) { font-size: 10px !important; line-height: 14px !important; padding: 0 !important; transform: translateY(-8px); font-variant-numeric: tabular-nums; }
[data-morphise-nav-tile-height="38"] [data-morphise-nav-slot="tile"] [data-morphise-nav-row] > [data-testid] { padding-block: 2px !important; }
[data-morphise-nav-tile-height="38"] [data-morphise-nav-slot="tile"] [data-morphise-nav-row] > [data-testid] svg { width: 14px !important; height: 14px !important; }
[data-morphise-nav-tile-height="38"] [data-morphise-nav-slot="tile"] [data-morphise-nav-row] > [data-testid] > :last-child { line-height: 12px !important; }
`;

export function installSidebarNavigation() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const tagged = new Map<DomElement, Map<string, string>>();
  let clearStyle: (() => void) | null = null;
  const clearTags = () => {
    for (const [element, attributes] of tagged) for (const attribute of attributes.keys()) element.removeAttribute(attribute);
    tagged.clear();
  };
  const sync = () => {
    const wanted = new Map<DomElement, Map<string, string>>();
    const want = (element: DomElement, attribute: string, value: string) => {
      const attributes = wanted.get(element) ?? new Map<string, string>();
      attributes.set(attribute, value); wanted.set(element, attributes);
    };
    if (!currentPrefs().sidebarNavigation) {
      clearStyle?.(); clearStyle = null;
      clearTags();
      return;
    }
    if (!clearStyle) clearStyle = applyStyleSheet(SIDEBAR_NAVIGATION_CSS);
    const handled = new Set<DomElement>();
    for (const anchor of Array.from(document.querySelectorAll(NAV))) {
      let group = anchor.parentElement?.parentElement ?? null;
      while (group && group !== document.documentElement) {
        if (group.matches(EXCLUDED) || group.querySelector(EXCLUDED)) break;
        const rows = Array.from(group.querySelectorAll(NAV)).filter((element) => element.getAttribute("role") === "button");
        const scroll = group.closest('[data-testid="sidebar-nav-scroll"]');
        const namedBoundary = scroll?.nextElementSibling?.matches('[data-testid="sidebar-nav-separator"]');
        const knownGroup = group.matches('[data-cp-win="nav"]') || (namedBoundary && group === scroll?.firstElementChild);
        if (group.querySelectorAll(BUILTIN).length >= 2 || knownGroup) {
          if (handled.has(group)) break;
          handled.add(group);
          const visibleRows = rows.filter((row) => !row.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(row).visibility === "visible" && row.getClientRects().length > 0 && row.getBoundingClientRect().height > 0);
          want(group, "data-morphise-nav-group", currentPrefs().sidebarNavigationAlignment);
          want(group, "data-morphise-nav-tile-height", String(currentPrefs().sidebarNavigationTileHeight));
          for (const row of visibleRows) if (row.parentElement) want(row.parentElement, "data-morphise-nav-row", currentPrefs().sidebarNavigationFill);
          const slots = visibleRows.map((row) => {
            let slot = row.parentElement;
            while (slot && slot.parentElement !== group) slot = slot.parentElement;
            return slot;
          });
          // Every displayed direct child participates in grid placement, even when its button is hidden.
          const managedChildren = Array.from(group.children).every((child) => slots.includes(child) || getComputedStyle(child).display === "none");
          const simpleSlots = managedChildren && slots.every((slot) => slot && slot.querySelectorAll(NAV).length === 1) && new Set(slots).size === slots.length;
          if (simpleSlots) {
            const layout = currentPrefs().sidebarNavigationLayout;
            want(group, "data-morphise-nav-layout", layout);
            slots.forEach((slot, index) => {
              if (!slot || layout === "stacked") return;
              const kind = layout === "split" && slots.length >= 2 && index < 2 ? "half" : layout === "tiles" && index > 0 && index < slots.length - 1 ? "tile" : "full";
              want(slot, "data-morphise-nav-slot", kind);
              if (kind === "tile") {
                const middleCount = slots.length - 2;
                const rowStart = Math.floor((index - 1) / 3) * 3;
                want(slot, "data-morphise-nav-tile-columns", String(Math.min(3, middleCount - rowStart)));
              }
              // Plugin rows add wrappers between the grid slot and the bordered row frame.
              let frame = visibleRows[index]?.parentElement ?? null;
              while (frame && frame !== slot) {
                want(frame, "data-morphise-nav-stretch", "");
                frame = frame.parentElement;
              }
            });
          }
          const separator = scroll?.nextElementSibling;
          if (separator?.matches('[data-testid="sidebar-nav-separator"]')) want(separator, "data-morphise-nav-separator", "");
          else if (separator && !separator.getAttribute("data-testid") && !separator.firstElementChild && !separator.textContent?.trim()) want(separator, "data-morphise-nav-separator", "");
          break;
        }
        group = group.parentElement;
      }
    }
    for (const [element, attributes] of tagged) for (const attribute of attributes.keys()) if (!wanted.get(element)?.has(attribute)) element.removeAttribute(attribute);
    for (const [element, attributes] of wanted) for (const [attribute, value] of attributes) if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
    tagged.clear();
    for (const [element, attributes] of wanted) tagged.set(element, attributes);
  };
  sync();
  const unsubscribe = subscribePrefs(sync);
  return watchDom({ settled: sync }, () => { unsubscribe(); clearStyle?.(); clearTags(); });
}
