// The output panel a Run button opens inside its code block (web and desktop), as Claude Desktop shows
// a command's output under the block: a status dot and time, the newest output, and icon buttons Stop,
// Copy, In chat (the card, for typing into the command, Rerun and Send) and Close. It reads
// the run from the daemon (morphise.run.tail); the card in the chat stays the run's record and shrinks to
// one line while this panel shows (inlineRuns). Colours are the theme's --colors-* variables.
import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { pastedKeys, terminalKeys } from "../../../shared/run/keys";
import { LIMITS } from "../../../shared/run/limits";
import type { Phase } from "../../../shared/run/row";
import { fullOutput, input, stop, tail } from "../../../shared/run/rpc";
import { errorMessage } from "../../../shared/run/text";
import type { DomElement } from "../../polish/web/dom";
import { createKeySender } from "../key-sender";
import { inlineRuns, panelOutput, panelStatus } from "./panel-model";

declare function setTimeout(callback: () => void, ms: number): number;
declare function setInterval(callback: () => void, ms: number): number;
declare function clearInterval(id: number): void;
declare const document: { createElement(tag: "div" | "span" | "button" | "pre" | "textarea"): DomElement };

// The hidden box keys are typed into, and the key events it gets.
interface KeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  // 229: the key went to an input method (Japanese, Chinese, Korean), not to the box.
  keyCode: number;
  preventDefault(): void;
  stopPropagation(): void;
}
interface TypeBox {
  value: string;
  focus(): void;
  blur(): void;
  addEventListener(type: "keydown" | "keypress" | "keyup", listener: (event: KeyEvent) => void): void;
  addEventListener(type: "focus" | "blur" | "compositionstart" | "compositionend", listener: () => void): void;
  addEventListener(type: "input", listener: (event: { isComposing?: boolean }) => void): void;
  addEventListener(type: "paste", listener: (event: { preventDefault(): void; stopPropagation(): void; clipboardData: { getData(type: "text"): string } | null }) => void): void;
}

// A click that ends a text selection is for copying, not for typing.
function noSelection(): boolean {
  const selection = (globalThis as { getSelection?(): { isCollapsed: boolean } | null }).getSelection?.();
  return !selection || selection.isCollapsed;
}

export const PANEL = "data-morphise-run-panel";
const LINE_PX = 18;
// Output lines a panel keeps; Copy takes everything the daemon holds.
const PANEL_LINES = 200;
const PANEL_LINE_CHOICES = [10, 15, 25, 40] as const;

// Lucide icons (ISC), drawn in the text colour.
const svg = (body: string) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  stop: svg('<rect width="14" height="14" x="5" y="5" rx="2"/>'),
  copy: svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
  chat: svg('<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  keyboard: svg('<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>'),
};

// The output scrolls after the chosen number of lines; with "icons", button words show only as hover names.
export const PANEL_CSS = `
[${PANEL}] { margin-top: 10px; padding-top: 6px; border-top: 1px solid var(--colors-border); user-select: text; }
[${PANEL}] [data-part="head"] { display: flex; align-items: center; gap: 2px; font: 12px system-ui, sans-serif; color: var(--colors-foreground-muted); user-select: none; }
[${PANEL}] [data-part="dot"] { flex: none; width: 6px; height: 6px; margin-right: 6px; border-radius: 3px; background: var(--colors-foreground-muted); }
[${PANEL}] [data-part="status"] { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
[${PANEL}] [data-tone="running"] { --tone: var(--colors-accent); }
[${PANEL}] [data-tone="ok"] { --tone: var(--colors-status-success); }
[${PANEL}] [data-tone="error"] { --tone: var(--colors-status-danger); }
[${PANEL}] [data-tone] [data-part="dot"] { background: var(--tone, var(--colors-foreground-muted)); }
[${PANEL}] [data-tone] [data-part="status"] { color: var(--tone, var(--colors-foreground-muted)); }
[${PANEL}] button { display: inline-flex; align-items: center; gap: 4px; height: 24px; min-width: 24px; justify-content: center; padding: 0 5px; border: 0; border-radius: 5px; background: transparent; color: var(--colors-foreground-muted); font: 12px system-ui, sans-serif; cursor: pointer; }
[${PANEL}] button:hover { color: var(--colors-foreground); background: var(--colors-surface2); }
[${PANEL}] button:focus-visible { outline: 2px solid var(--colors-accent); outline-offset: -2px; }
[${PANEL}] button[hidden] { display: none; }
[${PANEL}][data-buttons="icons"] [data-part="label"] { display: none; }
[${PANEL}] pre { margin: 6px 0 0; overflow: auto; white-space: pre-wrap; word-break: break-word; color: var(--colors-foreground); font: 12px/${LINE_PX}px ui-monospace, SFMono-Regular, Menlo, monospace; }
${PANEL_LINE_CHOICES.map((lines) => `[${PANEL}][data-lines="${lines}"] pre { max-height: ${lines * LINE_PX}px; }`).join("\n")}
[${PANEL}] pre:empty { display: none; }
[${PANEL}][data-can-type] pre { cursor: text; }
[${PANEL}][data-typing] pre { outline: 1px solid var(--colors-accent); outline-offset: 3px; border-radius: 3px; }
[${PANEL}][data-typing] [data-part="type"] { color: var(--colors-accent); }
[${PANEL}] [data-part="type-box"] { position: absolute; left: 0; bottom: 0; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; resize: none; overflow: hidden; font-size: 16px; }
`;

export interface PanelLook {
  runLines: number;
  runPanelButtons: "icons" | "both";
}

/** Applies the panel settings to an open panel; called again when they change. */
export function applyPanelLook(element: DomElement, look: PanelLook) {
  element.setAttribute("data-lines", String(look.runLines));
  element.setAttribute("data-buttons", look.runPanelButtons);
}

// `label` is one of this file's fixed words, never text from the chat.
function setButton(button: DomElement, icon: keyof typeof ICONS, label: string, name = label) {
  button.innerHTML = `${ICONS[icon]}<span data-part="label">${label}</span>`;
  button.setAttribute("aria-label", name);
  button.setAttribute("title", name);
}

export interface RunPanel {
  readonly runId: string;
  readonly element: DomElement;
  /** Stops reading the run and takes the panel out; the card shows the run again. */
  close(): void;
  /** Its block left the page (Paseo redrew or scrolled it away): stop reading, keep nothing. */
  detach(): void;
  /** M was typing into it, and did not stop: a panel opened for the redrawn block picks up the typing. */
  isTyping(): boolean;
}

function part(tag: "div" | "span" | "button" | "pre" | "textarea", name: string, text = ""): DomElement {
  const element = document.createElement(tag);
  element.setAttribute("data-part", name);
  element.textContent = text;
  if (tag === "button") element.setAttribute("type", "button");
  return element;
}

const append = (parent: DomElement, child: DomElement) => (parent as unknown as { appendChild(node: DomElement): void }).appendChild(child);

/** Opens a panel for `runId` at the end of `block`. `onClose` runs once, however it closes. */
export function openPanel(client: PluginClientContext, block: DomElement, runId: string, look: PanelLook, onClose: () => void, resumeTyping = false): RunPanel {
  const element = document.createElement("div");
  element.setAttribute(PANEL, runId);
  applyPanelLook(element, look);
  // Left out of what Paseo copies as the block's markdown, like its own Copy code.
  element.setAttribute("data-paseo-markdown-ignore", "true");
  const head = part("div", "head");
  const dot = part("span", "dot");
  const status = part("span", "status");
  const typeButton = part("button", "type");
  const typeName = "Type into the command; Esc stops";
  setButton(typeButton, "keyboard", "Type", typeName);
  typeButton.setAttribute("hidden", "");
  const stopButton = part("button", "stop");
  setButton(stopButton, "stop", "Stop");
  const copyButton = part("button", "copy");
  setButton(copyButton, "copy", "Copy", "Copy the output");
  const chatButton = part("button", "chat");
  setButton(chatButton, "chat", "In chat", "Show in the chat card, to type into it, rerun or send it");
  const closeButton = part("button", "close");
  setButton(closeButton, "close", "Close", "Close; the output stays in the chat card");
  const output = part("pre", "output");
  // Keys typed into the command go through this hidden box, as in the run card.
  const typeBox = part("textarea", "type-box");
  for (const [name, value] of [["aria-label", "Type into the command"], ["autocomplete", "off"], ["autocapitalize", "off"], ["autocorrect", "off"], ["spellcheck", "false"], ["tabindex", "-1"]]) typeBox.setAttribute(name, value);
  for (const child of [dot, status, typeButton, stopButton, copyButton, chatButton, closeButton]) append(head, child);
  append(element, head);
  append(element, output);
  append(element, typeBox);
  append(block, element);

  let phase: Phase | null | undefined;
  // From the daemon's live view: the command runs in a terminal, so it can take typing.
  let terminal = false;
  let typing = false;
  // Typing that should carry on: set by focusing the box, cleared by Esc, a click elsewhere, or the run
  // ending, but not when Paseo takes the panel off the page (a redraw), so the next panel resumes it.
  let wantsTyping = resumeTyping;
  let composing = false;
  // Shown in place of the status until the next key, when a key couldn't be sent.
  let typeError: string | null = null;
  const box = typeBox as unknown as TypeBox;
  const canType = () => !closed && terminal && phase?.kind === "running" && phase.stopRequestedAt === null;
  const focused = () => (globalThis as { document?: { activeElement: unknown } }).document?.activeElement === typeBox;
  // The daemon's clock minus this window's: the run's times are the daemon's.
  let clockOffset = 0;
  let closed = false;
  let stopAsked = false;
  let ticker = 0;
  const render = () => {
    if (phase === undefined) return void (status.textContent = "Starting…");
    const shown = panelStatus(phase, Date.now() + clockOffset);
    if (canType()) {
      typeButton.removeAttribute("hidden");
      element.setAttribute("data-can-type", "");
    } else {
      // A typing error belongs to a run that can take keys; once it can't, the run's own status shows.
      typeError = null;
      wantsTyping = false;
      typeButton.setAttribute("hidden", "");
      element.removeAttribute("data-can-type");
      if (focused()) box.blur();
    }
    status.textContent = typeError ?? shown.text;
    head.setAttribute("data-tone", typeError ? "error" : shown.tone);
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
          terminal = reply.view.terminal === true;
          const atBottom = output.scrollTop + 4 >= output.scrollHeight - (output as unknown as { clientHeight: number }).clientHeight;
          output.textContent = panelOutput(reply.view.output.lines);
          if (atBottom) output.scrollTop = output.scrollHeight;
        }
        render();
        keepTicking();
        if (wantsTyping && canType() && !focused()) box.focus();
        if (phase === null || (phase && phase.kind !== "running")) return;
      } catch {
        await new Promise<void>((wake) => setTimeout(wake, LIMITS.pollBackoffMs[Math.min(failures++, LIMITS.pollBackoffMs.length - 1)]));
      }
    }
  }

  const detach = () => {
    if (closed) return;
    closed = true;
    if (focused()) box.blur();
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
  const flash = (copied: boolean) => {
    setButton(copyButton, copied ? "check" : "alert", copied ? "Copied" : "Couldn't copy");
    setTimeout(() => setButton(copyButton, "copy", "Copy", "Copy the output"), 1500);
  };
  // The daemon's full output, or what the panel shows when the daemon no longer holds it.
  clicked(copyButton, () => {
    void client
      .rpc(fullOutput, { runId })
      .then((full) => copyText(full?.text ?? output.textContent ?? ""))
      .then(() => flash(true), () => flash(false));
  });
  // Typing: click the output (unless that click selected text) or the keyboard button; Esc stops.
  const sendKeys = createKeySender((keys) => client.rpc(input, { runId, keys }), {
    onError: (error) => {
      typeError = `Couldn't type: ${errorMessage(error)}`;
      render();
    },
  });
  const typeKeys = (keys: string) => {
    if (typeError) {
      typeError = null;
      render();
    }
    sendKeys(keys);
  };
  const startTyping = () => canType() && box.focus();
  clicked(typeButton, startTyping);
  clicked(output, () => noSelection() && startTyping());
  // The box holds focus only while the run can take keys.
  box.addEventListener("focus", () => {
    if (!canType()) return void box.blur();
    typing = true;
    wantsTyping = true;
    element.setAttribute("data-typing", "");
  });
  box.addEventListener("blur", () => {
    typing = false;
    element.removeAttribute("data-typing");
    // Off the page means Paseo redrew the block: the next panel picks the typing up.
    if (element.isConnected) wantsTyping = false;
    // Still focused after a blur means the window went to the background. Coming back would focus the
    // box again without a click, as in the run card.
    if (focused()) box.blur();
  });
  // Keys stop here, so listeners on the page around the panel don't see them. Paseo's own shortcuts
  // listen earlier, on the window, and still take the few keys bound to them (see OVERVIEW).
  box.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      wantsTyping = false;
      return box.blur();
    }
    const keys = terminalKeys(event);
    if (keys === null) return;
    event.preventDefault();
    typeKeys(keys);
  });
  box.addEventListener("keypress", (event) => event.stopPropagation());
  box.addEventListener("keyup", (event) => event.stopPropagation());
  // Letters arrive as typed text; the box stays empty. A word an input method (or a dead key such as
  // Option+E) is still putting together goes when it is finished.
  const sendTyped = () => {
    const text = box.value;
    box.value = "";
    if (text) typeKeys(text.replace(/\n/g, ""));
  };
  box.addEventListener("compositionstart", () => (composing = true));
  box.addEventListener("compositionend", () => {
    composing = false;
    sendTyped();
  });
  box.addEventListener("input", (event) => {
    if (composing || event.isComposing) return;
    sendTyped();
  });
  box.addEventListener("paste", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const keys = pastedKeys(event.clipboardData?.getData("text") ?? "");
    if (keys === null) return;
    if (keys.length > LIMITS.commandChars) {
      typeError = `Couldn't paste: the limit is ${LIMITS.commandChars.toLocaleString("en-US")} characters`;
      return render();
    }
    typeKeys(keys);
  });
  clicked(chatButton, close);
  clicked(closeButton, close);
  // Text selected in the panel copies as the browser has it, lines and all: Paseo's own copy handler on the
  // reply skips text marked as outside the markdown and would flatten it.
  (element as unknown as { addEventListener(type: "copy", listener: (event: { stopPropagation(): void }) => void): void }).addEventListener("copy", (event) => event.stopPropagation());

  render();
  inlineRuns.show(runId, close);
  void follow();
  return { runId, element, close, detach, isTyping: () => wantsTyping };
}
