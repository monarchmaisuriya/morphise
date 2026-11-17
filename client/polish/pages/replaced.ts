import { useSyncExternalStore } from "react";

// Pages a later html_render call replaced (its "Replaces:" line), by page id. Filled by the row transformer as it makes
// the later row (html-rows.ts); the earlier row, wherever it is mounted, then shows "Updated below". Page ids are content
// hashes, so one set serves every chat. Kept for the app's lifetime, which is as long as the rows it describes.
const replaced = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export function markReplaced(id: string) {
  if (replaced.has(id)) return;
  replaced.add(id);
  version++;
  // Not during the transformer's own run: subscribers re-render after it.
  queueMicrotask(() => listeners.forEach((listener) => listener()));
}

export const isReplaced = (id: string | undefined) => id !== undefined && replaced.has(id);

/** Whether the page `id` was replaced by a later one, following changes. */
export function useReplaced(id: string | undefined): boolean {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return isReplaced(id);
}
