// Hover previews (Chat settings, Hover previews): resting the pointer on a folded Morphise row shows what opening it would show,
// in a floating box by the row. The rows draw the box (rows/hover-preview.tsx); this decides when it shows and places it.
import { Platform } from "react-native";
import { showAsPopover } from "./popover";

declare const document: {
  addEventListener(type: "keydown" | "scroll", listener: (event: { key?: string; target?: unknown }) => void, capture: boolean): void;
  removeEventListener(type: "keydown" | "scroll", listener: (event: { key?: string; target?: unknown }) => void, capture: boolean): void;
};
declare const window: { innerWidth: number; innerHeight: number };

/** How long the pointer may be off both the row and the preview (crossing the gap between them) before the preview closes. */
export const LEAVE_GRACE_MS = 150;

export interface PreviewControl {
  enterRow(): void;
  leaveRow(): void;
  enterPreview(): void;
  leavePreview(): void;
  /** Closes at once and cancels a pending open: Escape, a scroll, the row opening or previews turned off. */
  dismiss(): void;
}

/** When a row's preview opens and closes. Only the pointer arriving on the row starts the delay, so a dismissed preview stays closed
 * until the pointer comes back. `delayMs` is read on arrival. */
export function previewControl(delayMs: () => number, show: (open: boolean) => void): PreviewControl {
  let open = false;
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(opening);
    clearTimeout(closing);
    opening = closing = undefined;
  };
  const dismiss = () => {
    stop();
    if (!open) return;
    open = false;
    show(false);
  };
  const leave = () => {
    if (!open) return stop();
    clearTimeout(closing);
    closing = setTimeout(dismiss, LEAVE_GRACE_MS);
  };
  return {
    enterRow() {
      clearTimeout(closing);
      closing = undefined;
      if (open || opening) return;
      opening = setTimeout(() => {
        opening = undefined;
        open = true;
        show(true);
      }, delayMs());
    },
    leaveRow: leave,
    enterPreview() {
      clearTimeout(closing);
      closing = undefined;
    },
    leavePreview: leave,
    dismiss,
  };
}

const GAP = 4;
const MARGIN = 8;
const MAX_HEIGHT = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
// Below the row unless there is less room than this there and more above.
const ROOM_BELOW = 200;

export interface Placement {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** Under the row, or above it (anchored by its bottom edge, so content that grows extends upward) when the row is low in the
 * window; as wide as the row within limits, and inside the window. */
export function previewPlacement(row: { top: number; bottom: number; left: number; width: number }, viewport: { width: number; height: number }): Placement {
  const below = viewport.height - row.bottom - GAP - MARGIN;
  const above = row.top - GAP - MARGIN;
  const width = Math.min(Math.max(row.width, MIN_WIDTH), MAX_WIDTH, viewport.width - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(row.left, viewport.width - width - MARGIN));
  if (below >= ROOM_BELOW || below >= above) return { top: row.bottom + GAP, left, width, maxHeight: Math.min(MAX_HEIGHT, below) };
  return { bottom: viewport.height - row.top + GAP, left, width, maxHeight: Math.min(MAX_HEIGHT, above) };
}

interface PreviewElement {
  style: { setProperty(name: string, value: string): void };
  contains(node: unknown): boolean;
  addEventListener(type: "pointerenter" | "pointerleave", listener: () => void): void;
  removeEventListener(type: "pointerenter" | "pointerleave", listener: () => void): void;
}

/** Shows the preview element by its row in the page's top layer, and reports the pointer on it, Escape, and a scroll of anything
 * but the preview itself. Returns cleanup. */
export function attachPreview(preview: unknown, row: unknown, on: { enter(): void; leave(): void; dismiss(): void }): () => void {
  const el = preview as PreviewElement | null;
  const anchor = row as { getBoundingClientRect(): { top: number; bottom: number; left: number; width: number } } | null;
  if (Platform.OS !== "web" || typeof document === "undefined" || !el || !anchor) return () => {};
  const px = (value: number | undefined) => (value === undefined ? "auto" : `${Math.round(value)}px`);
  const placeByRow = () => {
    const place = previewPlacement(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    const box: Record<string, string> = { top: px(place.top), bottom: px(place.bottom), left: px(place.left), width: px(place.width), "max-height": px(place.maxHeight) };
    for (const [name, value] of Object.entries(box)) el.style.setProperty(name, value);
  };
  placeByRow();
  const styles: Record<string, string> = {
    position: "fixed",
    right: "auto",
    overflow: "auto",
    // Scrolling to the end of the preview does not carry on into the chat (which would close it).
    "overscroll-behavior": "contain",
    // Above the chat when the browser has no top layer.
    "z-index": "2147483000",
  };
  for (const [name, value] of Object.entries(styles)) el.style.setProperty(name, value);
  const unpop = showAsPopover(el);
  const key = (event: { key?: string }) => event.key === "Escape" && on.dismiss();
  // Paseo scrolls the chat by itself while a reply streams: the preview follows its row, and closes
  // only once the row has left the window.
  const scroll = (event: { target?: unknown }) => {
    if (el.contains(event.target)) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) on.dismiss();
    else placeByRow();
  };
  el.addEventListener("pointerenter", on.enter);
  el.addEventListener("pointerleave", on.leave);
  document.addEventListener("keydown", key, true);
  document.addEventListener("scroll", scroll, true);
  return () => {
    el.removeEventListener("pointerenter", on.enter);
    el.removeEventListener("pointerleave", on.leave);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("scroll", scroll, true);
    unpop();
  };
}
