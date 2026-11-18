// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/html-frame.ts
import { openExternalUrl } from "@getpaseo/plugin/client";
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { htmlPage, themeCss, type HtmlColors } from "../../../../shared/polish/page";
import { chartPalette } from "../../../../shared/polish/palette";
import { readHostAppearance } from "../../web/host";
import { showAsPopover } from "../../web/popover";
import { usePrefs } from "../../prefs";
import { askAllowed, FRAME_SANDBOX, fitFrame, frameMessage, heightAt, limitFrameHeight, recentPages } from "../frame";

// Web only (html-item.tsx checks Platform.OS); just the DOM this module touches.
declare const navigator: { userAgent: string; userActivation?: { isActive: boolean } } | undefined;
type MessageListener = (event: { source: unknown; data: unknown }) => void;
interface KeyListenerEvent {
  key: string;
  preventDefault(): void;
}
declare const window: {
  addEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "keydown", listener: (event: KeyListenerEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyListenerEvent) => void): void;
};
declare const document: { activeElement: unknown };
interface HoverTarget {
  addEventListener(type: "mouseenter" | "mouseleave", listener: () => void): void;
  removeEventListener(type: "mouseenter" | "mouseleave", listener: () => void): void;
}
declare const KeyboardEvent: new (type: "keydown", init: object) => unknown;
interface Frame {
  clientWidth: number;
  contentWindow: { postMessage(message: unknown, target: string): void } | null;
  dispatchEvent(event: unknown): boolean;
}

// Each page's frame size in the chat. The chat's list unmounts rows it scrolls past; a row mounted again starts at this size rather than
// growing from the default under the reader. Only recent pages: the chat shows a few at a time, and a session can render many.
const lastSizes = recentPages<{ height: number; width: number }>(50);
const START_HEIGHT = 160;

// The width a page's measured heights are read at before its frame has one: the chat's column on desktop.
const COLUMN = 700;

/** The height a page's frame last had in the chat, or else its measured height, for a stand-in of the same size while the page gets ready. */
export const lastFrameHeight = (id: string, heights?: ReadonlyArray<readonly [number, number]>) => lastSizes.get(id)?.height ?? (heights ? heightAt(heights, COLUMN) : START_HEIGHT);
// Mod is Cmd on a Mac, Ctrl elsewhere, as in Paseo's shortcuts.
const isMac = () => typeof navigator !== "undefined" && /Macintosh/.test(navigator.userAgent);
// After a width change, a shorter page has to stay shorter this long before the frame follows (see fitFrame).
const SHRINK_AFTER_MS = 400;
// The last follow-up any page put in a message box (Morphise.ask), for askAllowed.
let lastAsk: { at: number; text: string } | null = null;
// How long the chat waits for a page's SVG before treating it as having none.
const EXPORT_WAIT_MS = 2000;

/** Asks a page's frame for its SVG; set on the `exporter` a caller passes to HtmlFrame. */
export type SvgExporter = { current: (() => Promise<string | null>) | null };

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif';
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** The CSS variables a page gets from the app's theme and fonts. */
export function useHtmlTheme(colors: HtmlColors, compact = false) {
  return useMemo(() => {
    const a = readHostAppearance();
    return themeCss(colors, { sans: a.uiFont ? `${a.uiFont}, ${SANS}` : SANS, mono: a.monoFont ? `${a.monoFont}, ${MONO}` : MONO }, chartPalette(colors.surface0), compact);
  }, [colors, compact]);
}

/**
 * An html_render page in a sandboxed frame: scripts run, but with no same-origin access the page can't reach the app's session or storage.
 * `id` names the page across remounts (its source, before images were inlined). The frame fits the page's reported height (or, with `fill`, its container) and follows the app's theme without reloading, so the page keeps its state.
 * `heights`, the daemon's measurements, size a frame the chat hasn't shown yet, so the page arrives at its size instead of growing into it.
 */
export function HtmlFrame({
  html,
  id = html,
  title,
  colors,
  compact = false,
  heights,
  fill = false,
  onEscape,
  onAsk,
  exporter,
}: {
  html: string;
  id?: string;
  title: string;
  colors: HtmlColors;
  // Paseo's compact layout, which sets the page's text size as it does a reply's.
  compact?: boolean;
  heights?: ReadonlyArray<readonly [number, number]>;
  fill?: boolean;
  onEscape?: () => void;
  // A follow-up the page asked for (Morphise.ask) after a click in it; it goes into the message box, never sent.
  onAsk?: (text: string) => void;
  exporter?: SvgExporter;
}) {
  const ref = useRef<Frame | null>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;
  const ask = useRef(onAsk);
  ask.current = onAsk;
  const pendingSvg = useRef(new Map<string, (svg: string | null) => void>());
  const css = useHtmlTheme(colors, compact);
  const latest = useRef(css);
  latest.current = css;
  // The page starts in the theme of its first render; later themes are posted, since a new srcdoc would reload it.
  const srcDoc = useMemo(() => htmlPage(html, latest.current), [html]);
  // Width -1 until the page reports one, so its first report always sets the frame: up at once, down after SHRINK_AFTER_MS (fitFrame).
  const shown = useRef(lastSizes.get(id) ?? { height: lastFrameHeight(id, heights), width: -1 });
  const [height, setHeight] = useState(shown.current.height);
  // The page's own height is still tracked (fitFrame, lastSizes); only the frame on screen stops at the limit.
  const limit = usePrefs().pageHeight;
  const shrink = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resize = (size: { height: number; width: number }) => {
    shown.current = size;
    if (!fill) lastSizes.set(id, size);
    setHeight(size.height);
  };
  const postTheme = () => ref.current?.contentWindow?.postMessage({ type: "cp-html-theme", css: latest.current }, "*");
  // The frame's width is known from the commit that inserts it, before it's painted: its measured height there.
  useLayoutEffect(() => {
    const width = ref.current?.clientWidth;
    if (!fill && heights && width && !lastSizes.get(id)) resize({ height: heightAt(heights, width), width: -1 });
  }, []);
  // Listen from the commit that inserts the frame: a fast page can report its height before a passive effect runs.
  useLayoutEffect(() => {
    const onMessage: MessageListener = ({ source, data }) => {
      const frame = ref.current;
      if (!frame) return;
      const activated = typeof navigator !== "undefined" && navigator.userActivation?.isActive === true;
      const message = frameMessage(data, { own: source === frame.contentWindow, focused: document.activeElement === frame, mac: isMac(), activated });
      if (message?.kind === "ask") {
        const now = Date.now();
        if (!askAllowed(message.text, now, lastAsk)) return;
        lastAsk = { at: now, text: message.text };
        return ask.current?.(message.text);
      }
      if (message?.kind === "svg") {
        pendingSvg.current.get(message.id)?.(message.svg);
        return void pendingSvg.current.delete(message.id);
      }
      if (message?.kind === "link") return void openExternalUrl(message.url).catch((error: unknown) => console.warn("[morphise] Opening a page's link failed", error));
      // Esc only leaves full screen; an allowed shortcut replays on the frame element, so the app's listeners get it as if the chat had focus.
      if (message?.kind === "escape") return escape.current?.();
      if (message?.kind === "shortcut") return void frame.dispatchEvent(new KeyboardEvent("keydown", { ...message.key, bubbles: true, cancelable: true }));
      if (message?.kind !== "report") return;
      const report = message.report;
      clearTimeout(shrink.current);
      const next = fitFrame(shown.current, report);
      if (!next) return;
      if (next.later) shrink.current = setTimeout(() => resize(report), SHRINK_AFTER_MS);
      else resize({ height: next.height, width: report.width });
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(shrink.current);
    };
  }, []);
  useEffect(postTheme, [css]);
  useEffect(() => {
    if (!exporter) return;
    exporter.current = () =>
      new Promise((resolve) => {
        const request = Math.random().toString(36).slice(2);
        pendingSvg.current.set(request, resolve);
        ref.current?.contentWindow?.postMessage({ type: "cp-html-export-svg", id: request }, "*");
        setTimeout(() => {
          if (pendingSvg.current.delete(request)) resolve(null);
        }, EXPORT_WAIT_MS);
      });
    return () => {
      exporter.current = null;
    };
  }, [exporter]);
  return createElement("iframe", {
    ref,
    srcDoc,
    title,
    // No modals, forms or same-origin access; links reach the chat as messages (see BOOT in shared/polish/page.ts).
    sandbox: FRAME_SANDBOX,
    onLoad: postTheme,
    style: { display: "block", width: "100%", height: fill ? "100%" : limitFrameHeight(height, limit), border: 0, background: "transparent", colorScheme: /color-scheme:light/.test(css) ? "light" : "dark" },
  });
}

/**
 * Whether the pointer is over the element behind `ref`, its frame and buttons included. mouseenter/leave don't fire when the pointer moves
 * between descendants, so moving from the page onto a button keeps it; react-native-web's nested Pressable hover flickered there.
 */
export function useHovered(ref: { current: unknown }) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const el = ref.current as HoverTarget | null;
    if (!el?.addEventListener) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, [ref]);
  return hovered;
}

/** Esc pressed outside a full-screen page (its header, after a click on the backdrop); the page passes its own through HtmlFrame's onEscape. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    // Phones have no window to listen on (React Native's window has no addEventListener); their back gesture closes the modal.
    if (!active || Platform.OS !== "web") return;
    const onKey = (event: KeyListenerEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

/** A ref that shows its element (a full-window overlay) as a native popover while it is mounted, so Escape stays the overlay's (see showAsPopover). */
export function usePopoverRef() {
  const hide = useRef<() => void>(undefined);
  return useCallback((el: unknown) => {
    hide.current?.();
    hide.current = el ? showAsPopover(el) : undefined;
  }, []);
}

/** Room for the macOS window buttons, which Paseo's desktop app draws over its own content, at the start of a full-window header. */
export const windowButtonsInset = () => (typeof navigator !== "undefined" && /Electron/.test(navigator.userAgent) && /Macintosh/.test(navigator.userAgent) ? 80 : 16);
