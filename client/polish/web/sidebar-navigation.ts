import { Platform } from "react-native";
import { applyStyleSheet } from "../../web";
import { watchDom, type DomElement, type WebDocument } from "./dom";
import { currentPrefs, subscribePrefs } from "../prefs";

declare const document: WebDocument;

const BUILTIN = '[data-testid="sidebar-search"], [data-testid="sidebar-global-new-workspace"], [data-testid="sidebar-schedules"], [data-testid="sidebar-sessions"]';
const PLUGIN = '[data-testid^="plugin-sidebar-"]:not([data-testid^="plugin-sidebar-footer-"]):not([data-testid$="-popover"])';
const NAV = `${BUILTIN}, ${PLUGIN}`;
const EXCLUDED = '[data-testid="sidebar-footer"], [data-testid="workspace-explorer-sidebar"], [data-testid^="sidebar-workspace-row-"], [data-testid="left-sidebar-resize-handle"]';

export const SIDEBAR_NAVIGATION_CSS = `
[data-morphise-nav-group] { border-bottom-width: 0 !important; gap: 4px !important; }
[data-morphise-nav-row] { border: 1px solid var(--colors-border) !important; border-radius: 8px !important; background-color: transparent !important; }
[data-morphise-nav-row]:hover, [data-morphise-nav-row]:focus-within, [data-morphise-nav-row]:has(> [aria-selected="true"]) { background-color: var(--colors-surface-sidebar-hover, var(--colors-surface2)) !important; }
[data-morphise-nav-group="center"] [data-morphise-nav-row] > [data-testid] { justify-content: center !important; }
[data-morphise-nav-group="right"] [data-morphise-nav-row] > [data-testid] { justify-content: flex-end !important; }
[data-morphise-nav-group="left"] [data-morphise-nav-row] > [data-testid] { justify-content: flex-start !important; }
[data-morphise-nav-row="filled"] { background-color: var(--colors-surface-sidebar-hover, var(--colors-surface2)) !important; }
[data-morphise-nav-row="filled"]:hover, [data-morphise-nav-row="filled"]:focus-within, [data-morphise-nav-row="filled"]:has(> [aria-selected="true"]) { background-color: color-mix(in srgb, var(--colors-foreground) 12%, var(--colors-surface-sidebar-hover, var(--colors-surface2))) !important; }
[data-morphise-nav-row]:has(> [aria-selected="true"]) { box-shadow: inset 0 0 0 1px var(--colors-foreground-muted, var(--colors-border)); }
[data-morphise-nav-row]:has(> :focus-visible) { outline: 2px solid var(--colors-foreground); outline-offset: -2px; }
[data-morphise-nav-separator] { display: none !important; }
`;

export function installSidebarNavigation() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const tagged = new Map<DomElement, string>();
  let clearStyle: (() => void) | null = null;
  const mark = (element: DomElement, attribute: string, value: string) => {
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
    tagged.set(element, attribute);
  };
  const sync = () => {
    const wanted = new Map<DomElement, [string, string]>();
    if (!currentPrefs().sidebarNavigation) {
      clearStyle?.(); clearStyle = null;
      for (const [element, attribute] of tagged) element.removeAttribute(attribute);
      tagged.clear();
      return;
    }
    if (!clearStyle) clearStyle = applyStyleSheet(SIDEBAR_NAVIGATION_CSS);
    for (const anchor of Array.from(document.querySelectorAll(BUILTIN))) {
      let group = anchor.parentElement?.parentElement ?? null;
      while (group && group !== document.documentElement) {
        if (group.matches(EXCLUDED) || group.querySelector(EXCLUDED)) break;
        const rows = Array.from(group.querySelectorAll(NAV)).filter((element) => element.getAttribute("role") === "button");
        if (group.querySelectorAll(BUILTIN).length >= 2) {
          wanted.set(group, ["data-morphise-nav-group", currentPrefs().sidebarNavigationAlignment]);
          for (const row of rows) if (row.parentElement) wanted.set(row.parentElement, ["data-morphise-nav-row", currentPrefs().sidebarNavigationFill]);
          const scroll = group.closest('[data-testid="sidebar-nav-scroll"]');
          const separator = scroll?.nextElementSibling;
          if (separator?.matches('[data-testid="sidebar-nav-separator"]')) wanted.set(separator, ["data-morphise-nav-separator", ""]);
          else if (separator && !separator.getAttribute("data-testid") && !separator.firstElementChild && !separator.textContent?.trim()) wanted.set(separator, ["data-morphise-nav-separator", ""]);
          break;
        }
        group = group.parentElement;
      }
    }
    for (const [element, attribute] of tagged) if (!wanted.has(element)) { element.removeAttribute(attribute); tagged.delete(element); }
    for (const [element, [attribute, value]] of wanted) mark(element, attribute, value);
  };
  sync();
  const unsubscribe = subscribePrefs(sync);
  return watchDom({ settled: sync }, () => { unsubscribe(); clearStyle?.(); for (const [element, attribute] of tagged) element.removeAttribute(attribute); tagged.clear(); });
}
