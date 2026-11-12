import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

// The only module that touches the DOM. This plugin typechecks without the DOM library, so it
// declares just what it uses. On iOS and Android there is no DOM and nothing is applied.
interface StyleElement {
  id: string;
  textContent: string | null;
  remove(): void;
}
type PressListener = (event: { target: unknown }) => void;
interface PageElement {
  getBoundingClientRect(): { top: number; bottom: number };
  scrollIntoView(options: { block: "start"; behavior: "smooth" }): void;
}
declare const document: {
  querySelectorAll(selector: string): ArrayLike<PageElement>;
  querySelector(selector: string): PageElement | null;
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: StyleElement): unknown };
  visibilityState: "visible" | "hidden";
  addEventListener(type: "pointerdown", listener: PressListener, capture: boolean): void;
  removeEventListener(type: "pointerdown", listener: PressListener, capture: boolean): void;
};
interface NotificationConstructor {
  new (title: string, options: { body: string; tag: string }): unknown;
  permission: "default" | "granted" | "denied";
  requestPermission(): Promise<"default" | "granted" | "denied">;
}
declare const globalThis: { Notification?: NotificationConstructor; matchMedia?(query: string): { matches: boolean }; navigator?: { platform?: string; userAgent?: string } };

// Whether this web app runs on a Mac ("Show in Finder" rather than "Show in folder").
export function isMac(): boolean {
  if (Platform.OS !== "web") return Platform.OS === "ios";
  const nav = globalThis.navigator;
  return /Mac/i.test(nav?.platform ?? nav?.userAgent ?? "");
}

// Hover tooltips for Morphise's icon buttons, drawn like Paseo's own (its components/ui/tooltip.tsx:
// the page colour, a 1px border, 12px text and corners, a soft shadow, 6px above the button, no
// delay), so they match the app's. React Native for web has no tooltip, so this places one element on
// the page. `node` is the Pressable's DOM element from its ref; native apps have no hover.
export interface TooltipColors {
  surface0: string;
  border: string;
  foreground: string;
}
interface TipElement {
  style: Record<string, string>;
  textContent: string;
  remove(): void;
  getBoundingClientRect(): { width: number; height: number };
}
interface TipTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
  getBoundingClientRect(): { top: number; bottom: number; left: number; width: number };
  contains?(node: unknown): boolean;
  isConnected?: boolean;
}
declare const window: { innerWidth: number; innerHeight: number };
const TIP_GAP = 6;
let tip: TipElement | null = null;
let tipOwner: TipTarget | null = null;

// While a tooltip shows, the pointer is watched: it closes as soon as the pointer is off its button
// or the button is gone (a button that disappears under the pointer, such as a card's hover-only
// Move, sends no mouseleave), and on scroll.
// Read only when a tooltip shows (web): phones have no document.
const page = () =>
  document as unknown as {
    addEventListener(type: string, listener: (event: { target: unknown }) => void, capture: boolean): void;
    removeEventListener(type: string, listener: (event: { target: unknown }) => void, capture: boolean): void;
  };
function pointerMoved(event: { target: unknown }) {
  const owner = tipOwner;
  if (!owner || owner.isConnected === false || !owner.contains?.(event.target)) hideTooltip();
}

function hideTooltip() {
  tip?.remove();
  if (tip) {
    page().removeEventListener("pointermove", pointerMoved, true);
    page().removeEventListener("scroll", hideTooltip, true);
  }
  tip = null;
  tipOwner = null;
}

function showTooltip(target: TipTarget, label: string, colors: TooltipColors) {
  const info = { label, colors };
  hideTooltip();
  const element = (document as unknown as { createElement(tag: "div"): TipElement }).createElement("div");
  element.textContent = info.label;
  Object.assign(element.style, {
    position: "fixed",
    zIndex: "2147483000",
    pointerEvents: "none",
    padding: "4px 8px",
    borderRadius: "12px",
    border: `1px solid ${info.colors.border}`,
    background: info.colors.surface0,
    color: info.colors.foreground,
    font: "12px/16px var(--paseo-ui-font, system-ui, sans-serif)",
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
    whiteSpace: "nowrap",
    maxWidth: "280px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });
  (document as unknown as { body: { appendChild(node: TipElement): unknown } }).body.appendChild(element);
  const anchor = target.getBoundingClientRect();
  const size = element.getBoundingClientRect();
  // Above the button, or below it when there is no room; kept inside the window.
  const top = anchor.top - size.height - TIP_GAP >= 0 ? anchor.top - size.height - TIP_GAP : anchor.bottom + TIP_GAP;
  const left = Math.min(Math.max(4, anchor.left + anchor.width / 2 - size.width / 2), window.innerWidth - size.width - 4);
  element.style.top = `${Math.round(top)}px`;
  element.style.left = `${Math.round(left)}px`;
  tip = element;
  tipOwner = target;
  page().addEventListener("pointermove", pointerMoved, true);
  page().addEventListener("scroll", hideTooltip, true);
}

// Spread on the root view of a Morphise screen: its buttons show a quiet keyboard outline instead of Paseo's
// focus ring, which the desktop app draws after a click too (rule in client/polish/web/plugin-views.ts).
// A data attribute only; other platforms ignore it.
export const FOCUS_SCOPE = { dataSet: { mxFocusScope: "" } } as object;

// The ref to pass to a button: stable across renders, so hovering (which re-renders the button)
// never resets it. The label and colours are read when the pointer arrives, so a changed label
// shows; no label means no tooltip. React calls the returned cleanup when the button goes away or
// stops passing this ref, and it takes the listeners and any tooltip on screen with it. Touch
// screens get none: a tap would leave it up. `data-tooltip` carries the label for styling and tests.
export function useTooltip(label: string | undefined, colors: TooltipColors) {
  const latest = useRef({ label, colors });
  latest.current = { label, colors };
  const node = useRef<TipTarget | null>(null);
  useEffect(() => {
    const target = node.current;
    if (!target) return;
    if (label) target.setAttribute("data-tooltip", label);
    else target.removeAttribute?.("data-tooltip");
  }, [label]);
  return useCallback((element: unknown) => {
    if (Platform.OS !== "web" || cannotHover()) return;
    // A host React older than 19 calls the ref with null instead of the cleanup below.
    if (!element) {
      if (node.current && tipOwner === node.current) hideTooltip();
      node.current = null;
      return;
    }
    const target = element as TipTarget;
    node.current = target;
    if (latest.current.label) target.setAttribute("data-tooltip", latest.current.label);
    const enter = () => {
      const { label: text, colors: palette } = latest.current;
      if (text) showTooltip(target, text, palette);
    };
    target.addEventListener("mouseenter", enter);
    target.addEventListener("mouseleave", hideTooltip);
    target.addEventListener("mousedown", hideTooltip);
    return () => {
      target.removeEventListener?.("mouseenter", enter);
      target.removeEventListener?.("mouseleave", hideTooltip);
      target.removeEventListener?.("mousedown", hideTooltip);
      if (tipOwner === target) hideTooltip();
      node.current = null;
    };
  }, []);
}

// Whether the main pointer cannot hover (a phone or tablet browser), so hover-only controls must
// always show. Native apps answer from the platform instead.
export function cannotHover(): boolean {
  if (Platform.OS !== "web") return true;
  return globalThis.matchMedia?.("(hover: none)").matches === true;
}

// Runs `handler` when the user presses anywhere on the page outside `inside` (a rendered View's
// element on the web). A plugin view's own backdrop cannot catch presses on Paseo's panes, which
// paint above it. Native apps get nothing here: their popovers sit in a modal with a backdrop.
export function onPressOutside(inside: unknown, handler: () => void): () => void {
  if (Platform.OS !== "web" || !inside) return () => {};
  const node = inside as { contains(target: unknown): boolean };
  const listener: PressListener = (event) => {
    if (!node.contains(event.target)) handler();
  };
  document.addEventListener("pointerdown", listener, true);
  return () => document.removeEventListener("pointerdown", listener, true);
}

export function applyStyleSheet(css: string): () => void {
  if (Platform.OS !== "web" || css === "") return () => {};
  const element = document.createElement("style");
  element.id = "morphise-style";
  element.textContent = css;
  document.head.appendChild(element);
  return () => element.remove();
}

// Whether this window is the one the user is looking at; native apps are always "visible".
export function isWindowVisible(): boolean {
  return Platform.OS !== "web" || document.visibilityState === "visible";
}

export type NotificationSupport = "unsupported" | "default" | "granted" | "denied";

export function notificationSupport(): NotificationSupport {
  if (Platform.OS !== "web" || !globalThis.Notification) return "unsupported";
  return globalThis.Notification.permission;
}

// Browsers only ask from a user action, so call this from a press.
export async function requestNotifications(): Promise<NotificationSupport> {
  if (notificationSupport() !== "default") return notificationSupport();
  return globalThis.Notification!.requestPermission();
}

// `tag` collapses the same reminder shown by several windows into one notification.
export function showNotification(title: string, body: string, tag: string): boolean {
  if (notificationSupport() !== "granted") return false;
  try {
    new globalThis.Notification!(title, { body, tag });
    return true;
  } catch (error) {
    // Some browsers (Chrome on Android) only allow notifications from a service worker.
    console.error("[morphise] Could not show a desktop notification", error);
    return false;
  }
}
