import { Platform } from "react-native";
import { SIDEBAR_SPEEDS, SIDEBAR_STATES, sidebarIndicatorLayout, sidebarStatusOptions, type SidebarIndicatorLayout, type SidebarStatusSettings } from "../../../shared/polish/sidebar-status";
import { currentPrefs, subscribePrefs } from "../prefs";
import { applyStyleSheet } from "../../web";

// Preview and live sidebar share geometry, state colours and animation; the original host children stay intact.
export function sidebarStatusCss(settings?: SidebarStatusSettings, target: "sidebar" | "preview" = "sidebar", layoutInput?: SidebarIndicatorLayout): string {
  const options = sidebarStatusOptions(settings);
  const layout = sidebarIndicatorLayout(layoutInput);
  if (target === "sidebar" && options.style === "paseo") return "";
  const rules = SIDEBAR_STATES.map((state) => {
    const preview = `[data-testid="morphise-status-preview-${state}"], [data-testid="morphise-status-nested-preview-${state}"]`;
    const native = `[data-testid^="sidebar-workspace-row-"] [data-testid="workspace-status-indicator-${state}"]`;
    const host = `${native}, [data-testid="morphise-sidebar-status-${state}"]`;
    const selector = target === "preview" ? preview : host;
    const choice = options.states[state];
    const color = state === "loading" || state === "running" ? "var(--colors-status-dot-running, var(--morphise-running-color, #5caaf6))" : state === "done" ? "var(--colors-foreground-muted)" : `var(--colors-status-dot-${state === "needs_input" ? "warning" : state === "failed" ? "danger" : "success"}, var(--colors-status-${state === "needs_input" ? "warning" : state === "failed" ? "danger" : "success"}))`;
    return `${selector} { position: relative !important; color: ${color} !important; --morphise-status-size: ${layout.size}px; }
${target === "preview" ? `[data-testid="morphise-status-nested-preview-${state}"] { --morphise-status-size: ${layout.size}px; }` : ""}
${target === "sidebar" ? `${native} { min-width: ${layout.size}px; }
[data-testid="morphise-sidebar-status-${state}"] { --morphise-status-size: 100%; }` : ""}
${target === "sidebar" ? `${host.split(", ").map((s) => `${s} > *`).join(", ")} { visibility: hidden !important; }` : ""}
${selector.split(", ").flatMap((s) => [`${s}::before`, `${s}::after`]).join(", ")} { content: ""; pointer-events: none; position: absolute; left: 50%; top: 50%; box-sizing: border-box; border-radius: 50%; }
${selector.split(", ").map((s) => `${s}::before`).join(", ")} { width: 6px; height: 6px; margin-left: -3px; margin-top: -3px; background-color: currentColor; opacity: 1; }
${selector.split(", ").map((s) => `${s}::after`).join(", ")} { width: 12px; height: 12px; margin-left: -6px; margin-top: -6px; background: conic-gradient(${choice.speed === "stopped" ? "color-mix(in srgb, currentColor 30%, transparent) 0deg 360deg" : "color-mix(in srgb, currentColor 90%, transparent) 0deg 90deg, color-mix(in srgb, currentColor 30%, transparent) 90deg 360deg"}); mask-image: radial-gradient(circle, transparent 4.5px, #000 4.5px); display: ${state === "done" ? "none" : "block"}; animation: ${state === "done" || choice.speed === "stopped" ? "none" : `morphise-status-turn ${choice.speed === "fast" ? 900 : SIDEBAR_SPEEDS[choice.speed]}ms linear infinite`}; }`;
  });
  return `@keyframes morphise-status-turn { to { transform: rotate(360deg); } }
:root.pluginLight { --morphise-running-color: #268ae0; }
:root.pluginDark { --morphise-running-color: #5caaf6; }
${rules.join("\n")}
@media (prefers-reduced-motion: reduce) { ${target === "preview" ? '[data-testid^="morphise-status-preview-"]::after, [data-testid^="morphise-status-nested-preview-"]::after' : '[data-testid^="sidebar-workspace-row-"] [data-testid^="workspace-status-indicator-"]::after, [data-testid^="morphise-sidebar-status-"]::after'} { animation: none !important; } }`;
}

export function installSidebarStatus(): () => void {
  if (Platform.OS !== "web") return () => {};
  let clear = () => {};
  const sync = () => {
    clear();
    clear = applyStyleSheet(sidebarStatusCss(currentPrefs().sidebarStatus, "sidebar", currentPrefs().sidebarIndicatorLayout));
  };
  sync();
  const stop = subscribePrefs(sync);
  return () => { stop(); clear(); };
}
