import { Platform } from "react-native";

// The Agents view's DOM parts: its keys, which cards are on screen, and the right-click menu. The
// plugin typechecks without the DOM library, so this declares only what it uses. On iOS and
// Android there is no DOM: keys and right-click do nothing, and every mounted card counts as on screen.

interface KeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: unknown;
  preventDefault(): void;
}
interface BoardNode {
  isConnected?: boolean;
  getClientRects?(): ArrayLike<unknown>;
  addEventListener?(type: "contextmenu", listener: (event: { preventDefault(): void }) => void): void;
  removeEventListener?(type: "contextmenu", listener: (event: { preventDefault(): void }) => void): void;
  scrollIntoView?(options: { block: "nearest"; inline: "nearest" }): void;
}
interface Editable {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}
interface IntersectionObserverLike {
  observe(node: unknown): void;
  disconnect(): void;
}
declare const document: {
  addEventListener(type: "keydown", listener: (event: KeyEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyEvent) => void): void;
};
declare const globalThis: { IntersectionObserver?: new (callback: (entries: { isIntersecting: boolean }[]) => void) => IntersectionObserverLike };

const WEB = Platform.OS === "web";

export type BoardKey = "up" | "down" | "left" | "right" | "open" | "search" | "back";

const KEYS: Record<string, BoardKey> = { j: "down", ArrowDown: "down", k: "up", ArrowUp: "up", h: "left", ArrowLeft: "left", l: "right", ArrowRight: "right", Enter: "open", "/": "search", Escape: "back" };

const editing = (target: unknown) => {
  const node = target as Editable | null;
  return node?.isContentEditable === true || node?.tagName === "INPUT" || node?.tagName === "TEXTAREA" || node?.tagName === "SELECT";
};

// Enter on a focused button, tab or link presses that control; it does not also open the focused card's chat.
const control = (target: unknown) => {
  const node = target as Editable | null;
  const role = node?.getAttribute?.("role");
  return node?.tagName === "BUTTON" || node?.tagName === "A" || role === "button" || role === "tab" || role === "link";
};

// Calls `handle` for the board's keys while `root` is shown; a handled key does nothing else.
// Typing in a field only reaches it with Escape, which leaves the field.
export function onBoardKeys(root: () => unknown, handle: (key: BoardKey) => boolean): () => void {
  if (!WEB) return () => {};
  const listener = (event: KeyEvent) => {
    const key = KEYS[event.key];
    if (!key || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (editing(event.target) && key !== "back") return;
    if (key === "open" && control(event.target)) return;
    // A screen Paseo keeps mounted behind another one has no layout boxes.
    const node = root() as BoardNode | null;
    if (!node?.isConnected || !node.getClientRects?.().length) return;
    if (handle(key)) event.preventDefault();
  };
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}

// Tells whether a card is inside the visible part of its lane, as that changes.
export function observeOnScreen(node: unknown, onChange: (onScreen: boolean) => void): () => void {
  const Observer = WEB ? globalThis.IntersectionObserver : undefined;
  if (!Observer || !node) {
    onChange(true);
    return () => {};
  }
  const observer = new Observer((entries) => onChange(entries.some((entry) => entry.isIntersecting)));
  observer.observe(node);
  return () => observer.disconnect();
}

// The browser's right-click on a card opens the card's menu instead of the browser's own.
export function onRightClick(node: unknown, open: () => void): () => void {
  const target = node as BoardNode | null;
  if (!WEB || !target?.addEventListener) return () => {};
  const listener = (event: { preventDefault(): void }) => {
    event.preventDefault();
    open();
  };
  target.addEventListener("contextmenu", listener);
  return () => target.removeEventListener?.("contextmenu", listener);
}

// Scrolls the card or row the keys moved to into view, as little as needed (web only).
export function reveal(node: unknown): void {
  if (WEB) (node as BoardNode | null)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
