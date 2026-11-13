import { useCallback, useSyncExternalStore } from "react";

// Which one item of a list the pointer is over, decided on every pointer move instead of by each item's own
// enter and leave events. A browser drops the hover of a node that is moved without telling it, and a list
// that re-sorts under a resting pointer moves its rows, so a row's own flag could stay on after the pointer left.
// A move marks the item it passes through on its way up, then settles once it has been through every handler
// (on the web, afterPointerMoves in web.ts): a move over no item, anywhere, clears it, as does leaving the window.
export interface HoverTracker {
  mark(key: string): void;
  settle(): void;
  clear(): void;
  get(): string | null;
  subscribe(listener: () => void): () => void;
}

export function createHoverTracker(): HoverTracker {
  let hovered: string | null = null;
  let marked: string | null = null;
  const listeners = new Set<() => void>();
  const set = (next: string | null) => {
    if (next === hovered) return;
    hovered = next;
    listeners.forEach((listener) => listener());
  };
  return {
    mark: (key) => void (marked = key),
    settle() {
      const next = marked;
      marked = null;
      set(next);
    },
    clear() {
      marked = null;
      set(null);
    },
    get: () => hovered,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

// Whether the pointer is over this item; an item re-renders only when its own answer changes.
export function useHovered(tracker: HoverTracker, key: string): boolean {
  const isHovered = useCallback(() => tracker.get() === key, [tracker, key]);
  return useSyncExternalStore(tracker.subscribe, isHovered, isHovered);
}
