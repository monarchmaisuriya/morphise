// Run buttons on the shell code blocks Paseo draws in replies (web and desktop). Beside Paseo's Copy
// code, Run starts the block's command through Morphise's runner, as the user, in that chat's folder;
// its output arrives as a card in the chat. A command `risksOf` flags asks once first. Paseo's Copy
// code stays as it is. Host markup checked against Paseo 0.16.0-beta.2
// (components/highlighted-code-block.tsx, assistant-selection-copy/markup.ts).
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { start } from "../../../shared/run/rpc";
import { risksOf } from "../../../shared/run/text";
import { currentPrefs, subscribePrefs } from "../../polish/prefs";
import { chatAgentOf } from "../../polish/web/chat-agent";
import { type DomElement, watchDom, within } from "../../polish/web/dom";
import { applyStyleSheet } from "../../web";
import { runStep, shellCommandOf } from "./command";

declare function setTimeout(callback: () => void, ms: number): number;
declare function clearTimeout(id: number): void;
declare const document: { createElement(tag: "button"): DomElement; querySelectorAll(selector: string): ArrayLike<DomElement>; body: DomElement };

const CODE_BLOCK = '[data-paseo-markdown-tag="pre"]';
const LANGUAGE = "data-paseo-markdown-language";
const CODE_TEXT = ':scope > [data-paseo-markdown-tag="code"]';
const RUN = "data-morphise-run";
const CONFIRM_MS = 5000;
// A double-click's second press lands within this; it must not confirm a risky command.
const CONFIRM_GUARD_MS = 400;
const RESULT_MS = 2500;

const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// Paseo's Copy code sits 8px in from the block's top right and is 22px wide; Run sits just left of it,
// shown as Copy is: on hover, or always where nothing can hover. Colours are the theme's, which Paseo
// keeps on :root as --colors-* (see client/polish/web/restyle.ts).
const CSS = `
[${RUN}] { position: absolute; top: 8px; right: 34px; display: flex; align-items: center; gap: 4px; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: var(--colors-foreground-muted); cursor: pointer; opacity: 0; transition: opacity 120ms; font: 600 11px system-ui, sans-serif; user-select: none; }
[${RUN}]:hover { color: var(--colors-foreground); }
${CODE_BLOCK}:hover > [${RUN}], [${RUN}]:focus-visible, [${RUN}][data-state="confirm"], [${RUN}][data-state="error"] { opacity: 1; }
[${RUN}][data-state="confirm"] { color: var(--colors-status-warning); }
[${RUN}][data-state="error"] { color: var(--colors-status-danger); }
[${RUN}]:disabled { cursor: progress; }
@media (hover: none) { [${RUN}] { opacity: 1; } }
`;

type State = "idle" | "confirm" | "busy" | "started" | "error";

function show(button: DomElement, state: State, detail = "") {
  button.setAttribute("data-state", state);
  // `detail` on screen is only ever a risk from risksOf's fixed list, never text from the chat.
  button.innerHTML = state === "started" ? CHECK : state === "confirm" ? `${PLAY}<span>Run anyway? It ${detail}</span>` : PLAY;
  const label = state === "confirm" ? `Run anyway? It ${detail}` : state === "error" ? `Couldn't run: ${detail}` : state === "started" ? "Started; the output is in the chat" : "Run this command in this chat's folder";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  if (state === "busy") button.setAttribute("disabled", "");
  else button.removeAttribute("disabled");
}

export function installRunButtons(client: PluginClientContext): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const timers = new Map<DomElement, number>();
  // The command a button is asking about, and when it started asking: a confirm covers that text only.
  const asking = new Map<DomElement, { command: string; at: number }>();
  const later = (button: DomElement, ms: number, then: () => void) => {
    clearTimeout(timers.get(button) ?? 0);
    timers.set(button, setTimeout(() => (timers.delete(button), then()), ms));
  };

  const commandOf = (block: DomElement) => shellCommandOf(block.getAttribute(LANGUAGE), block.querySelector(CODE_TEXT)?.textContent ?? "");

  async function run(block: DomElement, button: DomElement) {
    const command = commandOf(block);
    const pending = asking.get(button);
    if (pending && Date.now() - pending.at < CONFIRM_GUARD_MS) return;
    // A block still streaming can change after the confirm: the confirm only covers the text it showed.
    const step = runStep(command, chatAgentOf(block), command ? risksOf(command) : [], pending?.command === command);
    asking.delete(button);
    if (step.kind === "skip") return;
    if (step.kind === "no-chat") {
      show(button, "error", "this block is not in a chat Morphise can tell apart; use /run in that chat");
      return later(button, RESULT_MS, () => show(button, "idle"));
    }
    if (step.kind === "confirm") {
      asking.set(button, { command: command!, at: Date.now() });
      show(button, "confirm", step.risks[0]);
      const every = `Run anyway? It ${step.risks.join("; it ")}`;
      button.setAttribute("aria-label", every);
      button.setAttribute("title", every);
      return later(button, CONFIRM_MS, () => (asking.delete(button), show(button, "idle")));
    }
    show(button, "busy");
    try {
      await client.rpc(start, { agentId: step.agentId, command: step.command });
      show(button, "started");
    } catch (error) {
      show(button, "error", error instanceof Error ? error.message : String(error));
    }
    later(button, RESULT_MS, () => show(button, "idle"));
  }

  function addButton(block: DomElement) {
    if (block.querySelector(`:scope > [${RUN}]`) || !commandOf(block)) return;
    const button = document.createElement("button");
    button.setAttribute(RUN, "");
    button.setAttribute("type", "button");
    // Kept out of what Paseo copies as markdown, as its own Copy code is.
    button.setAttribute("data-paseo-markdown-ignore", "true");
    show(button, "idle");
    button.addEventListener("click", (event) => {
      (event as unknown as { preventDefault(): void; stopPropagation(): void }).preventDefault();
      (event as unknown as { stopPropagation(): void }).stopPropagation();
      if (button.getAttribute("data-state") !== "busy") void run(block, button);
    });
    (block as unknown as { appendChild(node: DomElement): void }).appendChild(button);
  }

  const buttons = () => Array.from(document.querySelectorAll(`[${RUN}]`));
  const removeAll = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    asking.clear();
    for (const button of buttons()) button.remove();
  };
  const enabled = () => currentPrefs().runButtons;
  const addWithin = (roots: DomElement[]) => {
    if (!enabled()) return;
    for (const block of within(roots, CODE_BLOCK)) addButton(block);
  };

  const unstyle = applyStyleSheet(CSS);
  const stopWatching = watchDom(
    {
      added: addWithin,
      // A block streams in: an untagged one is only known to be a command once its text has arrived.
      settled: (textRoots) => addWithin(textRoots.map((root) => root.closest(CODE_BLOCK) ?? root)),
    },
    removeAll,
  );
  const unsubscribe = subscribePrefs(() => (enabled() ? addWithin([document.body]) : removeAll()));
  return () => {
    unsubscribe();
    stopWatching();
    removeAll();
    unstyle();
  };
}
