import { Platform } from "react-native";

// The only module that touches the DOM. This plugin typechecks without the DOM library, so it
// declares just what it uses. On iOS and Android there is no DOM and nothing is applied.
interface StyleElement {
  id: string;
  textContent: string | null;
  remove(): void;
}
declare const document: {
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: StyleElement): unknown };
  visibilityState: "visible" | "hidden";
};
interface NotificationConstructor {
  new (title: string, options: { body: string; tag: string }): unknown;
  permission: "default" | "granted" | "denied";
  requestPermission(): Promise<"default" | "granted" | "denied">;
}
declare const globalThis: { Notification?: NotificationConstructor };

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
