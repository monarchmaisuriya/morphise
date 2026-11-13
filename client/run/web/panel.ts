// The output panel a Run button opens inside its code block (web and desktop), as Claude Desktop shows
// a command's output under the block: status and time, the newest output, Stop, Copy, In chat (the card,
// for typing into the command, Rerun and Send) and Close. It reads
// the run from the daemon (morphise.run.tail); the card in the chat stays the run's record and shrinks to
// one line while this panel shows (inlineRuns). Colours are the theme's --colors-* variables.
import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { LIMITS } from "../../../shared/run/limits";
import type { Phase } from "../../../shared/run/row";
import { fullOutput, stop, tail } from "../../../shared/run/rpc";
import type { DomElement } from "../../polish/web/dom";
import { inlineRuns, panelOutput, panelStatus } from "./panel-model";

declare function setTimeout(callback: () => void, ms: number): number;
declare function setInterval(callback: () => void, ms: number): number;
declare function clearInterval(id: number): void;
declare const document: { createElement(tag: "div" | "span" | "button" | "pre"): DomElement };

export const PANEL = "data-morphise-run-panel";
// Output lines a panel keeps; Copy takes everything the daemon holds.
const PANEL_LINES = 200;

export const PANEL_CSS = `
[${PANEL}] { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--colors-border); user-select: text; }
[${PANEL}] [data-part="head"] { display: flex; align-items: center; gap: 6px; font: 12px system-ui, sans-serif; color: var(--colors-foreground-muted); user-select: none; }
[${PANEL}] [data-part="status"] { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[${PANEL}] [data-tone="running"] { color: var(--colors-accent); }
[${PANEL}] [data-tone="ok"] { color: var(--colors-status-success); }
[${PANEL}] [data-tone="error"] { color: var(--colors-status-danger); }
[${PANEL}] button { padding: 2px 8px; border: 1px solid var(--colors-border); border-radius: 4px; background: transparent; color: var(--colors-foreground-muted); font: 12px system-ui, sans-serif; cursor: pointer; }
[${PANEL}] button:hover { color: var(--colors-foreground); }
[${PANEL}] button[hidden] { display: none; }
[${PANEL}] pre { margin: 6px 0 0; max-height: 240px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: var(--colors-foreground); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
[${PANEL}] pre:empty { display: none; }
`;

export interface RunPanel {
  readonly runId: string;
  readonly element: DomElement;
  /** Stops reading the run and takes the panel out; the card shows the run again. */
  close(): void;
  /** Its block left the page (Paseo redrew or scrolled it away): stop reading, keep nothing. */
  detach(): void;
}

function part(tag: "div" | "span" | "button" | "pre", name: string, text = ""): DomElement {
  const element = document.createElement(tag);
  element.setAttribute("data-part", name);
  element.textContent = text;
  if (tag === "button") element.setAttribute("type", "button");
  return element;
}

const append = (parent: DomElement, child: DomElement) => (parent as unknown as { appendChild(node: DomElement): void }).appendChild(child);

/** Opens a panel for `runId` at the end of `block`. `onClose` runs once, however it closes. */
export function openPanel(client: PluginClientContext, block: DomElement, runId: string, onClose: () => void): RunPanel {
  const element = document.createElement("div");
  element.setAttribute(PANEL, runId);
  // Left out of what Paseo copies as the block's markdown, like its own Copy code.
  element.setAttribute("data-paseo-markdown-ignore", "true");
  const head = part("div", "head");
  const status = part("span", "status");
  const stopButton = part("button", "stop", "Stop");
  const copyButton = part("button", "copy", "Copy");
  const chatButton = part("button", "chat", "In chat");
  chatButton.setAttribute("aria-label", "Show this run in its card in the chat, to type into it, rerun or send it");
  const closeButton = part("button", "close", "Close");
  closeButton.setAttribute("aria-label", "Close the output; it stays in the card below");
  const output = part("pre", "output");
  for (const child of [status, stopButton, copyButton, chatButton, closeButton]) append(head, child);
  append(element, head);
  append(element, output);
  append(block, element);

  let phase: Phase | null | undefined;
  // The daemon's clock minus this window's: the run's times are the daemon's.
  let clockOffset = 0;
  let closed = false;
  let stopAsked = false;
  let ticker = 0;
  const render = () => {
    if (phase === undefined) return void (status.textContent = "Starting…");
    const shown = panelStatus(phase, Date.now() + clockOffset);
    status.textContent = shown.text;
    status.setAttribute("data-tone", shown.tone);
    if (phase?.kind === "running") stopButton.removeAttribute("hidden");
    else stopButton.setAttribute("hidden", "");
  };
  const keepTicking = () => {
    if (phase?.kind === "running" && !ticker) ticker = setInterval(render, 1000);
    if (phase?.kind !== "running" && ticker) (clearInterval(ticker), (ticker = 0));
  };

  async function follow() {
    let since: number | null = null;
    let failures = 0;
    while (!closed) {
      try {
        const reply: RpcOutput<typeof tail> = await client.rpc(tail, { runId, lines: PANEL_LINES, since, waitMs: LIMITS.tailWaitMs });
        failures = 0;
        if (closed) return;
        if (reply.state === "unknown") phase = null;
        if (reply.state === "view") {
          since = reply.view.rev;
          phase = reply.view.phase;
          clockOffset = reply.view.serverNow - Date.now();
          const atBottom = output.scrollTop + 4 >= output.scrollHeight - (output as unknown as { clientHeight: number }).clientHeight;
          output.textContent = panelOutput(reply.view.output.lines);
          if (atBottom) output.scrollTop = output.scrollHeight;
        }
        render();
        keepTicking();
        if (phase === null || (phase && phase.kind !== "running")) return;
      } catch {
        await new Promise<void>((wake) => setTimeout(wake, LIMITS.pollBackoffMs[Math.min(failures++, LIMITS.pollBackoffMs.length - 1)]));
      }
    }
  }

  const detach = () => {
    if (closed) return;
    closed = true;
    if (ticker) clearInterval(ticker);
    inlineRuns.hide(runId);
  };
  const close = () => {
    if (closed) return;
    detach();
    element.remove();
    onClose();
  };
  const clicked = (button: DomElement, act: () => void) =>
    button.addEventListener("click", (event) => {
      (event as unknown as { stopPropagation(): void }).stopPropagation();
      act();
    });
  // A second Stop forces it, as in the card.
  clicked(stopButton, () => {
    void client.rpc(stop, { runId, force: stopAsked }).catch(() => undefined);
    stopAsked = true;
  });
  const flash = (text: string) => {
    copyButton.textContent = text;
    setTimeout(() => (copyButton.textContent = "Copy"), 1500);
  };
  // The daemon's full output, or what the panel shows when the daemon no longer holds it.
  clicked(copyButton, () => {
    void client
      .rpc(fullOutput, { runId })
      .then((full) => copyText(full?.text ?? output.textContent ?? ""))
      .then(() => flash("Copied"), () => flash("Couldn't copy"));
  });
  clicked(chatButton, close);
  clicked(closeButton, close);
  // Text selected in the panel copies as the browser has it, lines and all: Paseo's own copy handler on the
  // reply skips text marked as outside the markdown and would flatten it.
  (element as unknown as { addEventListener(type: "copy", listener: (event: { stopPropagation(): void }) => void): void }).addEventListener("copy", (event) => event.stopPropagation());

  render();
  inlineRuns.show(runId, close);
  void follow();
  return { runId, element, close, detach };
}
