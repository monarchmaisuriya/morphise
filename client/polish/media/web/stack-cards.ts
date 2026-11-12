// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): the ImagesItem stack rules in client/web/plugin-views.ts
import { Platform } from "react-native";
import type { WebDocument } from "../../web/dom";

declare const document: WebDocument;

// ImagesItem's stack cards (views.tsx): in view they deal into their slots as the row opens (staggered by an inline
// animation-delay), out of view they're placed at once. Folding, the row's cards shrink toward the first, then the two
// behind it fan out from under it. Nothing flies across the row.
const STACK_CARD_CSS = `
[data-cp-stack-card="deal"] { animation: cp-stack-deal 220ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
[data-cp-stack-card="out"] { animation: cp-stack-out 110ms cubic-bezier(0.4, 0, 1, 1) forwards; }
[data-cp-stack-card="fan"] { animation: cp-stack-fan 150ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
/* The stack row's bar: thin, in the theme's text color. Paseo sets scrollbar-color on the page, which turns off
   ::-webkit-scrollbar styling, so this uses the standard properties. */
[data-cp-stack-scroll] { scrollbar-width: thin !important; scrollbar-color: color-mix(in srgb, var(--cp-fg, var(--colors-foreground)) 32%, transparent) transparent !important; }
@keyframes cp-stack-deal { from { opacity: 0; scale: 0.88; translate: 0 8px; } }
@keyframes cp-stack-out { to { opacity: 0; scale: 0.92; translate: -16px 0; } }
@keyframes cp-stack-fan { from { opacity: 0; transform: none; } }
[data-cp-stack-lift] { transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease-out, box-shadow 160ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  [data-cp-stack-card], [data-cp-stack-lift] { transition: none !important; animation: none !important; }
}`;

/** Adds the stack cards' animations to the page (web only; elsewhere the cards just move). Returns cleanup. */
export function styleStackCards() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = STACK_CARD_CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
