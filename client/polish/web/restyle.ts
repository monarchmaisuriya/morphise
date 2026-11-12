// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/web/restyle.ts
// Turns the restyle of Paseo's own items on and off, and publishes the app theme's colors it draws with.
import { Platform } from "react-native";
import { guardPositional, POSITIONAL, splitTop } from "./css-guard";
import { onAccent } from "../../../shared/polish/theme";
import { darker, hexAlpha, isDark, mix } from "./color";
import { watchDom, type DomElement, type MutationObserverClass, type WebDocument } from "./dom";
import { readHostAppearance } from "./host";
import { dropGhost, ghostOutlinePreview, hoverCardsRemoved, notePointer, stopHoverCards, swapOutlinePreview, watchHoverCards } from "./hover-cards";
import { ICON_VARS } from "./icons";
import { redrawDiagrams, setDiagramColors, themeMermaid, type PeleDiagrams } from "./mermaid";
import { decoratePopovers, markLitRows, MODEL_SELECTOR_CSS, noteClick, noteThinkingFallback, stopLitRows } from "./model-picker";
import { runningRemoved, tagParts } from "./parts";
import { NATIVE_CSS } from "./restyle-css";
import { markBlocks, RICH_TEXT_CSS } from "./rich-text";
import { CTX } from "./selectors";
import { tagWindow, WINDOW_CSS } from "./window";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): { getPropertyValue(name: string): string };
declare const MutationObserver: MutationObserverClass;

const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** The app theme's colors the restyle draws with: Paseo's PluginTheme["colors"]. */
export interface AppColors {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
  accentForeground: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
}

/** Publishes the app theme's colors and the code font as CSS variables for restyleNative. */
export function setNativeColors(c: AppColors) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const a = readHostAppearance();
  const vars: Record<string, string> = {
    "--cp-fg": c.foreground,
    "--cp-muted": c.foregroundMuted,
    "--cp-accent": c.accent,
    "--cp-raised": c.surface1,
    "--cp-control": c.surface2,
    "--cp-accent-fg": onAccent(c.accent, c.accentForeground, c.foreground),
    // Code wells sit below the page: 14% darker on dark themes; on a light page that is a mid grey, so a light theme's well is a
    // small step toward the text color.
    "--cp-sunken": isDark(c.surface0) ? darker(c.surface0) : mix(c.surface0, c.foreground, 0.04),
    "--cp-rule": hexAlpha(c.border, 0.6),
    "--cp-mono": a.monoFont ? `${a.monoFont}, ${MONO_FALLBACK}` : MONO_FALLBACK,
    "--cp-code": `${a.codeSize}px`,
    "--cp-content": `${a.contentSize}px`,
    "--cp-ok": c.statusSuccess,
    "--cp-warn": c.statusWarning,
  };
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  setDiagramColors(c);
}

// Where Paseo's web styles keep each theme color: Unistyles puts the theme on :root as --colors-<kebab name> (Paseo 0.16 beta.2's
// own CSS reads var(--colors-foreground-muted); Chat Polish's CSS reads the rest).
const APP_COLOR_VARS: Record<keyof AppColors, string> = {
  surface0: "--colors-surface0",
  surface1: "--colors-surface1",
  surface2: "--colors-surface2",
  border: "--colors-border",
  foreground: "--colors-foreground",
  foregroundMuted: "--colors-foreground-muted",
  accent: "--colors-accent",
  accentForeground: "--colors-accent-foreground",
  statusSuccess: "--colors-status-success",
  statusWarning: "--colors-status-warning",
  statusDanger: "--colors-status-danger",
};

type ColorCanvas = { fillStyle: string };
let colorCanvas: ColorCanvas | null | undefined;

/**
 * A CSS color as #rrggbb when it is opaque (the color math and mermaid's theme need hex), else as the browser writes it; a value the
 * canvas rejects comes back unchanged. A canvas keeps its old fillStyle on a bad value, so two different starting colors tell.
 */
export function normalizeColor(canvas: ColorCanvas, value: string) {
  canvas.fillStyle = "#000000";
  canvas.fillStyle = value;
  const first = canvas.fillStyle;
  canvas.fillStyle = "#ffffff";
  canvas.fillStyle = value;
  return canvas.fillStyle === first ? first : value;
}

/**
 * The app theme's colors read from Paseo's web styles, or undefined before they are there. Chat Polish got them from its sidebar row's
 * `theme` prop; Morphise has no row of its own that is always mounted, and these variables follow every theme, Paseo's and plugins'.
 * ponytail: the --colors-* names are Unistyles/Paseo internals; switch to a host theme API once plugins get one outside components.
 */
export function readAppColors(): AppColors | undefined {
  const root = getComputedStyle(document.documentElement);
  colorCanvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: false });
  const colors: Partial<AppColors> = {};
  for (const [key, name] of Object.entries(APP_COLOR_VARS) as Array<[keyof AppColors, string]>) {
    const value = root.getPropertyValue(name).trim();
    if (!value) return undefined;
    colors[key] = colorCanvas ? normalizeColor(colorCanvas, value) : value;
  }
  return colors as AppColors;
}

/**
 * Keeps the restyle's colors on the app theme: reads them now, when <html>'s theme class changes, and when `settled` is called (a
 * plugin theme can change its colors under the same class; its re-render settles the DOM). Returns the settle hook and cleanup.
 */
function followAppColors() {
  let last = "";
  const apply = () => {
    const colors = readAppColors();
    const key = colors ? JSON.stringify(colors) : "";
    if (!colors || key === last) return;
    last = key;
    setNativeColors(colors);
  };
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: false, subtree: false, attributes: true, attributeFilter: ["class"] });
  apply();
  return { settled: apply, stop: () => observer.disconnect() };
}

type CssRuleLike = { selectorText?: string; cssRules?: ArrayLike<CssRuleLike> };

function guardRules(rules: ArrayLike<CssRuleLike>) {
  for (const rule of Array.from(rules)) {
    if (rule.cssRules) guardRules(rule.cssRules);
    // An invalid rewrite is ignored by the browser, which keeps the original selector.
    if (rule.selectorText && POSITIONAL.test(rule.selectorText)) rule.selectorText = splitTop(rule.selectorText, (ch) => ch === ",").map((c) => guardPositional(c.trim())).join(", ");
  }
}

// Paseo 0.15 opens menus through element.animate (WEB_CONTENT_ENTERING_KEYFRAMES in menu-overlay.tsx, 150ms), which CSS can't shorten, so
// the call is cut to the 40ms the restyle gives every surface. Matched by its keyframes; if Paseo changes them, menus keep its 150ms.
const MENU_ENTRANCE = "scale(0.97)";
type Animatable = { animate(keyframes: unknown, options?: unknown): unknown };
function quickMenus(enabled: () => boolean) {
  const proto = (globalThis as unknown as { Element?: { prototype: Animatable } }).Element?.prototype;
  if (!proto) return () => {};
  const inherited = proto.animate;
  const ownBefore = Object.prototype.hasOwnProperty.call(proto, "animate");
  const quickAnimate = function (this: Animatable, keyframes: unknown, options?: unknown) {
    const entrance = typeof options === "number" && enabled() && (keyframes as { transform?: unknown[] } | null)?.transform?.[0] === MENU_ENTRANCE;
    return inherited.call(this, keyframes, entrance ? Math.min(options, 40) : options);
  };
  proto.animate = quickAnimate;
  // Puts back exactly what was there, unless someone patched it after us (theirs would call ours, so it stays).
  return () => {
    if (proto.animate !== quickAnimate) return;
    if (ownBefore) proto.animate = inherited;
    else delete (proto as { animate?: unknown }).animate;
  };
}

/**
 * Restyles what Paseo still draws itself (tool call groups, user bubbles, markdown) to the Chat Polish design
 * while `enabled()`; desktop/web only. Returns cleanup.
 * ponytail: CSS keyed on Paseo's testIDs, its DOM nesting and the data-paseo-markdown-* marks on its markdown;
 * a Paseo layout change can silently stop parts of it applying. Turn it off in Morphise's settings if it misfires.
 */
// `onChange` reports when `enabled` may have changed (Morphise's preferences arrive after the page
// first draws, and a quiet page adds no elements to recheck on).
export function restyleNative(enabled: () => boolean, pele?: PeleDiagrams, onChange?: (listener: () => void) => () => void) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  let style: DomElement | undefined;
  let colors: ReturnType<typeof followAppColors> | undefined;
  const unthemeMermaid = themeMermaid(() => !!style, pele);
  const slowMenus = quickMenus(() => !!style);
  const off = () => {
    if (!style) return;
    style.remove();
    style = undefined;
    colors?.stop();
    colors = undefined;
    // Diagrams drawn by Pele go back to Paseo's mermaid.
    redrawDiagrams();
    document.removeEventListener("click", noteClick, true);
    document.removeEventListener("pointerover", notePointer, true);
    dropGhost(false);
    stopHoverCards();
    stopLitRows();
    // A click closes a full screen diagram the way the reader would, taking its key listener with it.
    for (const el of Array.from(document.querySelectorAll("[data-cp-diagram-full]"))) el.click();
    for (const el of Array.from(document.querySelectorAll("[data-cp-rail], [data-cp-tip], [data-cp-hint], [data-cp-redraw], [data-cp-redraw-card], [data-cp-compact]"))) el.remove();
    for (const name of ["data-cp-redrawn", "data-cp-running", "data-cp-running-label"]) for (const el of Array.from(document.querySelectorAll(`[${name}]`))) el.removeAttribute(name);
    // The context card's remembered height (keepCardHeight).
    for (const el of Array.from(document.querySelectorAll(CTX))) el.style.removeProperty("min-height");
  };
  const watcher = {
    added: (roots: DomElement[]) => {
      if (!enabled()) return off();
      if (!style) {
        style = document.createElement("style");
        style.textContent = NATIVE_CSS + RICH_TEXT_CSS + MODEL_SELECTOR_CSS + WINDOW_CSS + ICON_VARS.join("\n");
        document.head.appendChild(style);
        const sheet = (style as unknown as { sheet?: { cssRules: ArrayLike<CssRuleLike> } }).sheet;
        if (sheet) guardRules(sheet.cssRules);
        colors = followAppColors();
        document.addEventListener("click", noteClick, true);
        document.addEventListener("pointerover", notePointer, true);
        redrawDiagrams();
      }
      tagParts(roots);
      tagWindow(roots);
      markBlocks(roots);
      decoratePopovers(roots);
      markLitRows(roots);
      watchHoverCards(roots);
      swapOutlinePreview(roots);
    },
    removed: (nodes: Array<{ el: DomElement; from: DomElement }>) => {
      if (!style) return;
      runningRemoved(nodes);
      hoverCardsRemoved();
      ghostOutlinePreview(nodes);
    },
    wantsAttributeRoots: () => !!style,
    settled: (roots: DomElement[]) => {
      if (!style) return;
      colors?.settled();
      noteThinkingFallback();
      markBlocks(roots);
    },
  };
  const stop = watchDom(watcher, off);
  // On a change, recheck the whole page as if it had just been drawn.
  const unlisten = onChange?.(() => watcher.added([document.body as unknown as DomElement])) ?? (() => {});
  return () => {
    unlisten();
    stop();
    unthemeMermaid();
    slowMenus();
  };
}
