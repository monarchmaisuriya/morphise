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
