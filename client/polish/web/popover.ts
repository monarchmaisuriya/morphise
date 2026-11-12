// The plugin's own full-window overlays (an image, a page, a diagram) as native popovers, so Escape stays theirs.
import { Platform } from "react-native";
import type { DomElement, WebDocument } from "./dom";

declare const document: WebDocument;

interface PopoverElement {
  isConnected: boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  matches(selector: string): boolean;
  showPopover?(): void;
  hidePopover?(): void;
}

// The browser draws a popover as a small bordered box in the middle of the window. Zero specificity, so the overlay's own styles
// (classes and inline styles) still win wherever they set something; this only replaces the browser's defaults.
const POPOVER_CSS =
  ":where([data-cp-popover]) { position: fixed; inset: 0; width: auto; height: auto; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: none; color: inherit; overflow: visible; }";
let sheet: DomElement | undefined;
let showing = 0;

/**
 * Shows `target` as a native popover (popover="manual") in the page's top layer. Paseo's window-level shortcuts leave Escape alone
 * while a `:popover-open` element exists, so Escape closes the overlay instead of also interrupting the agent. Returns cleanup.
 * A browser without the Popover API keeps the overlay as it was.
 */
export function showAsPopover(target: unknown): () => void {
  const el = target as PopoverElement | null;
  if (Platform.OS !== "web" || typeof document === "undefined" || !el?.isConnected || !el.showPopover || !el.hidePopover) return () => {};
  if (!showing++) {
    sheet = document.createElement("style");
    sheet.textContent = POPOVER_CSS;
    document.head.appendChild(sheet);
  }
  el.setAttribute("data-cp-popover", "");
  el.setAttribute("popover", "manual");
  el.showPopover();
  let shown = true;
  return () => {
    if (!shown) return;
    shown = false;
    // Leaving the DOM already hid it.
    if (el.matches(":popover-open")) el.hidePopover!();
    el.removeAttribute("popover");
    el.removeAttribute("data-cp-popover");
    if (!--showing) {
      sheet?.remove();
      sheet = undefined;
    }
  };
}
