// The optional strip under the message box on desktop and web (Settings, Chat, Session stats; off by default): the
// session stats in one line. Paseo gives plugins no place there, so this reads Paseo's page: each message box
// (data-testid "message-input-root"), its pane's selected chat tab, and room made under the box. A Paseo update can
// rename those and hide the strip; the pills keep working. After Harness Stats' client/web.ts by kogekiplay (MIT, see
// NOTICE.md).
import type { StatsReadResult } from "../../shared/stats";
import { agentIdFromTab, stripText } from "../../shared/stats-format";
import type { DomElement, WebDocument } from "../polish/web/dom";

import { fontSize } from "../../shared/design/tokens";
// The plugin compiles without lib.dom (it also runs on phones), so the page globals it uses are declared here.
declare const document: WebDocument & { hidden?: boolean };
declare function getComputedStyle(el: DomElement): { color: string };

const INPUT = '[data-testid="message-input-root"]';
const MARK = "data-morphise-stats-strip";
const REFRESH_MS = 2000;

export function startStatsStrip(read: (agentId: string) => Promise<StatsReadResult>): () => void {
  if (typeof document === "undefined") return () => undefined;
  const style = document.createElement("style");
  style.textContent = `${INPUT} { margin-bottom: 22px !important; } [${MARK}] { position: absolute; left: 12px; right: 12px; bottom: -20px; font-size: ${fontSize.sm}px; line-height: 16px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; font-variant-numeric: tabular-nums; }`;
  document.head.appendChild(style);
  let stopped = false;
  const tick = async () => {
    if (document.hidden) return;
    for (const input of Array.from(document.querySelectorAll(INPUT))) {
      const pane = input.closest('[data-testid^="workspace-pane-"]');
      const agentId = agentIdFromTab(pane?.querySelector('[data-testid^="workspace-tab-agent_"][aria-selected="true"]')?.getAttribute("data-testid"));
      const host = input.parentElement;
      if (!agentId || !host) continue;
      let strip = host.querySelector(`[${MARK}]`);
      if (!strip) {
        strip = document.createElement("div");
        strip.setAttribute(MARK, "");
        strip.style.setProperty("color", getComputedStyle(input).color);
        host.appendChild(strip);
      }
      const result = await read(agentId).catch((error: unknown) => ({ status: "error", error: String(error) }) as const);
      if (!stopped) strip.textContent = stripText(result);
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), REFRESH_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    style.remove();
    for (const strip of Array.from(document.querySelectorAll(`[${MARK}]`))) strip.remove();
  };
}
