import { Platform } from "react-native";
import { SIDEBAR_SPEEDS, SIDEBAR_STATES, sidebarStatusOptions, type SidebarStatusSettings } from "../../../shared/polish/sidebar-status";
import { currentPrefs, subscribePrefs } from "../prefs";
import { applyStyleSheet } from "../../web";
import { BLUE } from "../../ui/hues";

// Preview and live sidebar share geometry, state colours and animation; the original host children stay intact.
export function sidebarStatusCss(settings?: SidebarStatusSettings, target: "sidebar" | "preview" = "sidebar"): string {
  const options = sidebarStatusOptions(settings);
  if (target === "sidebar" && options.style === "paseo") return "";
  const rules = SIDEBAR_STATES.map((state) => {
    const preview = `[data-testid="morphise-status-preview-${state}"]`;
    const host = `[data-testid^="sidebar-workspace-row-"] [data-testid="workspace-status-indicator-${state}"], [data-testid="morphise-sidebar-status-${state}"]`;
    const selector = target === "preview" ? preview : host;
    const choice = options.states[state];
    const color = choice.color ?? (state === "loading" || state === "running" ? BLUE : `var(--colors-${state === "needs_input" ? "status-warning" : state === "failed" ? "status-danger" : state === "attention" ? "status-success" : "foreground-muted"})`);
    return `${selector} { position: relative !important; color: ${color} !important; }
${target === "sidebar" ? `${host.split(", ").map((s) => `${s} > *`).join(", ")} { visibility: hidden !important; }` : ""}
${selector.split(", ").map((s) => `${s}::before`).join(", ")} { content: ""; pointer-events: none; position: absolute; left: 50%; top: 50%; width: 12px; height: 12px; margin: -7px 0 0 -7px; box-sizing: content-box; border: 1px solid currentColor; border-radius: 50%; background: radial-gradient(circle, currentColor 0 2px, transparent 2.5px); border-color: color-mix(in srgb, currentColor 30%, transparent); }
${selector.split(", ").map((s) => `${s}::after`).join(", ")} { content: ""; pointer-events: none; position: absolute; left: 50%; top: 50%; width: 12px; height: 12px; margin: -7px 0 0 -7px; box-sizing: content-box; border: 1px solid transparent; border-top-color: currentColor; border-radius: 50%; display: ${state === "done" && choice.speed === "stopped" ? "none" : "block"}; animation: ${choice.speed === "stopped" ? "none" : `morphise-status-turn ${SIDEBAR_SPEEDS[choice.speed]}ms linear infinite`}; }`;
  });
  return `@keyframes morphise-status-turn { to { transform: rotate(360deg); } }
${rules.join("\n")}
@media (prefers-reduced-motion: reduce) { ${target === "preview" ? '[data-testid^="morphise-status-preview-"]::after' : '[data-testid^="sidebar-workspace-row-"] [data-testid^="workspace-status-indicator-"]::after, [data-testid^="morphise-sidebar-status-"]::after'} { animation: none !important; } }`;
}

export function installSidebarStatus(): () => void {
  if (Platform.OS !== "web") return () => {};
  let clear = () => {};
  const sync = () => {
    clear();
    clear = applyStyleSheet(sidebarStatusCss(currentPrefs().sidebarStatus));
  };
  sync();
  const stop = subscribePrefs(sync);
  return () => { stop(); clear(); };
}
