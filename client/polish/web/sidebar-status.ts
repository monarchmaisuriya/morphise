import { Platform } from "react-native";
import { SIDEBAR_SPEEDS, SIDEBAR_STATES, sidebarIndicatorLayout, sidebarStatusOptions, type SidebarIndicatorLayout, type SidebarStatusSettings } from "../../../shared/polish/sidebar-status";
import { currentPrefs, subscribePrefs } from "../prefs";
import { applyStyleSheet } from "../../web";
import { BLUE } from "../../ui/hues";

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
    const color = choice.color ?? (state === "loading" || state === "running" ? BLUE : `var(--colors-${state === "needs_input" ? "status-warning" : state === "failed" ? "status-danger" : state === "attention" ? "status-success" : "foreground-muted"})`);
    return `${selector} { position: relative !important; color: ${color} !important; --morphise-status-size: ${layout.size}px; }
${target === "preview" ? `[data-testid="morphise-status-nested-preview-${state}"] { --morphise-status-size: ${layout.size * 0.8}px; }` : ""}
${target === "sidebar" ? `${native} { min-width: ${layout.size}px; }
[data-testid="morphise-sidebar-status-${state}"] { --morphise-status-size: 100%; }` : ""}
${target === "sidebar" ? `${host.split(", ").map((s) => `${s} > *`).join(", ")} { visibility: hidden !important; }` : ""}
${selector.split(", ").flatMap((s) => [`${s}::before`, `${s}::after`]).join(", ")} { content: ""; pointer-events: none; position: absolute; left: 50%; top: 50%; width: var(--morphise-status-size); height: var(--morphise-status-size); margin-left: calc(var(--morphise-status-size) / -2); margin-top: calc(var(--morphise-status-size) / -2); box-sizing: border-box; border: 1px solid transparent; border-radius: 50%; }
${selector.split(", ").map((s) => `${s}::before`).join(", ")} { --morphise-status-track: color-mix(in srgb, currentColor 30%, transparent); background: radial-gradient(circle, var(--morphise-status-track) 0 20%, transparent 25%); border-color: var(--morphise-status-track); }
${selector.split(", ").map((s) => `${s}::after`).join(", ")} { border-top-color: currentColor; display: ${state === "done" && choice.speed === "stopped" ? "none" : "block"}; animation: ${choice.speed === "stopped" ? "none" : `morphise-status-turn ${SIDEBAR_SPEEDS[choice.speed]}ms linear infinite`}; }`;
  });
  return `@keyframes morphise-status-turn { to { transform: rotate(360deg); } }
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
