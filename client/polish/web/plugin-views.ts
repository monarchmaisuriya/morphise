// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/web/plugin-views.ts
import { Platform } from "react-native";
import type { WebDocument } from "./dom";
import { stopFollowingExpansion } from "./prompts";

declare const document: WebDocument;

/** Browser-only card shapes and hover transitions; native clients keep their fallback styles. */
export function stylePluginViews() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = `
@supports (corner-shape: squircle) { [data-cp-squircle="card"] { border-radius: 28px !important; corner-shape: squircle; } }
[data-cp-row] { transition: opacity 80ms ease-out, background-color 80ms ease-out; }
[data-cp-row] [dir] { transition: color 80ms ease-out; }
/* Paseo rings every focused button (:focus-visible, 2px accent), and its desktop app does so after a click on a row too, which
   boxed in the whole row. A focused row shows the soft fill it has on hover instead, so the keyboard still sees where it is. */
[data-cp-row]:focus-visible { outline: none; background-color: rgb(127 127 127 / 0.12); }
/* The same for Morphise's own screens (data-mx-focus-scope, client/web.ts): a button there shows a quiet inset line for the
   keyboard instead of Paseo's ring after a click. Text fields keep Paseo's ring. */
[data-mx-focus-scope] :focus-visible:not(input, textarea, [contenteditable="true"]) { outline: none !important; box-shadow: inset 0 0 0 2px rgb(127 127 127 / 0.75); }
/* A card's or list row's buttons stay laid out but transparent until hovered; keyboard focus on or inside it shows them too.
   Only keyboard focus (:focus-visible): the desktop app keeps focus on a row after a click, which must not pin them open. */
[data-mx-card]:focus-visible [data-mx-card-actions], [data-mx-card]:has(:focus-visible) [data-mx-card-actions] { opacity: 1 !important; }
/* One scroller for both axes keeps the horizontal bar visible with tall diffs. */
[data-cp-nowrap] { overflow: auto !important; }
[data-cp-nowrap] > div { width: max-content; min-width: 100%; }
[data-cp-nowrap] [data-pmono] { white-space: pre !important; overflow-wrap: normal !important; }
/* A shared light sweep preserves the action/target colors and works when row icons are hidden. */
[data-cp-running-label] {
  --cp-running-mask: linear-gradient(100deg, rgb(0 0 0 / 0.82) 35%, #000 50%, rgb(0 0 0 / 0.82) 65%);
  -webkit-mask-image: var(--cp-running-mask); mask-image: var(--cp-running-mask);
  -webkit-mask-size: 250% 100%; mask-size: 250% 100%;
  animation: cp-running-label 1.8s linear infinite;
}
@keyframes cp-running-label {
  from { -webkit-mask-position: 150% 0; mask-position: 150% 0; }
  to { -webkit-mask-position: -50% 0; mask-position: -50% 0; }
}
/* Animate the grid track instead of guessing a max-height; long and streaming output keep their natural size. */
[data-cp-expand] { display: grid !important; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 100ms cubic-bezier(0.23, 1, 0.32, 1), opacity 100ms ease-out; }
[data-cp-expand="closed"] { grid-template-rows: 0fr; opacity: 0; pointer-events: none; }
@starting-style {
  [data-cp-expand="open"] { grid-template-rows: 0fr; opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  [data-cp-running-label] { animation: none; -webkit-mask-image: none; mask-image: none; }
  [data-cp-expand] { transition: none; }
  [data-cp-row], [data-cp-row] [dir] { transition: none; }
}`;
  document.head.appendChild(style);
  return () => { stopFollowingExpansion(); style.remove(); };
}
