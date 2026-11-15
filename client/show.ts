// The app side of "Show in Paseo" (shared/show.ts): this window holds `show.channel` open, says when
// M starts or stops using it, and runs the requests the daemon sends it. Chats, drafts and Morphise
// screens open from here; terminals and workspaces need app references only the sidebar view holds,
// so its helper registers a navigator (ShowTargets in client/sidebar-view.tsx).
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AppState, Keyboard, Platform } from "react-native";
import { showChannel, showResult, showUsed, type ShowInput } from "../shared/show";
import { watchWindowUse, windowInFront } from "./web";

export interface ShowNavigator {
  /** False when the id is not on that host in this window's lists. */
  openTerminal(hostId: string, terminalId: string): boolean;
  openWorkspace(hostId: string, workspaceId: string): boolean;
}

/** The terminal or workspace with this id on this host: a window lists every host's, and two hosts can share an id. */
export function refOn<Ref extends { hostId: string; id: string }>(refs: readonly Ref[], hostId: string, id: string): Ref | undefined {
  return refs.find((ref) => ref.hostId === hostId && ref.id === id);
}

let current: ShowNavigator | null = null;
/** Registers the sidebar view's navigator; the returned cleanup forgets it unless a newer one replaced it. */
export function registerShowNavigator(
  next: ShowNavigator,
  set: (navigator: ShowNavigator | null) => void = (navigator) => void (current = navigator),
  get: () => ShowNavigator | null = () => current,
): () => void {
  set(next);
  return () => {
    if (get() === next) set(null);
  };
}

interface Composer {
  readonly prompt: string;
  insertText(text: string): void;
  focus(): Promise<void>;
}

export interface ShowDeps {
  composers(agentId: string): readonly Composer[];
  openScreen(screenId: string, params?: Record<string, string>): void;
  navigator(): ShowNavigator | null;
  /** The host the requests come from: this client's own, whose daemon sent them. */
  host(): Promise<string>;
  /** M pressed a key in this window within the last few seconds. */
  typing(): boolean;
}

export interface ShowAnswer {
  ok: boolean;
  message: string;
}

const NEEDS_SIDEBAR = "Turn on Morphise's sidebar view (Settings, Morphise, Sidebar) and select it in Paseo (Settings, Sidebar) so agents can open terminals and workspaces.";
const SCREEN_NAMES = { workbench: "the Workbench", dispatch: "Dispatch" } as const;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const TYPING = "The user is typing in Paseo right now, so nothing was changed; try again in a few seconds.";

/** Runs one request in this window. Always answers: an error becomes a failed answer. */
export async function runShow(input: ShowInput, deps: ShowDeps): Promise<ShowAnswer> {
  try {
    // Moving focus or the view while M types would send the next keys, Enter included, elsewhere.
    if (deps.typing()) return { ok: false, message: TYPING };
    return await perform(input, deps);
  } catch (error) {
    return { ok: false, message: `Paseo could not do that: ${errorText(error)}` };
  }
}

async function perform(input: ShowInput, deps: ShowDeps): Promise<ShowAnswer> {
  switch (input.action) {
    case "chat":
    case "draft": {
      const [box] = deps.composers(input.agentId!);
      if (!box) return { ok: false, message: `No open chat for agent ${input.agentId} here (it may be archived or on another host).` };
      const hasText = (prompt: string) => prompt.trim() !== "";
      if (input.action === "draft" && hasText(box.prompt)) return { ok: false, message: "That chat's message box already has text; nothing was changed." };
      // The chat comes on screen first, so a draft never lands in a box M was not shown.
      try {
        await box.focus();
      } catch (error) {
        return { ok: false, message: `Could not open the chat: ${errorText(error)}` };
      }
      if (input.action === "chat") return { ok: true, message: "Opened the chat." };
      // Opening can take up to 15 s; M may have started typing meanwhile.
      if (deps.typing()) return { ok: false, message: `Opened the chat, but ${TYPING.charAt(0).toLowerCase()}${TYPING.slice(1)}` };
      // Never replaces what M typed: checked again now the box is on screen, and written with an
      // insert, because `prompt` can trail the box by a moment (on web Paseo saves typing after the
      // next paint); if this read is stale, the draft lands beside M's text and nothing is erased.
      const [shown] = deps.composers(input.agentId!);
      if (!shown || hasText(shown.prompt)) return { ok: false, message: "Opened the chat, but its message box now has text; the draft was not added." };
      shown.insertText(input.text!);
      return { ok: true, message: "Put the text in the chat's message box; it was not sent." };
    }
    case "screen": {
      // The screen names are Morphise's screen ids (client/workbench.tsx, client/dispatch.tsx).
      deps.openScreen(input.screen!, input.view ? { view: input.view } : undefined);
      return { ok: true, message: `Opened ${SCREEN_NAMES[input.screen!]}${input.view ? ` (${input.view})` : ""}.` };
    }
    case "terminal": {
      const navigator = deps.navigator();
      if (!navigator) return { ok: false, message: NEEDS_SIDEBAR };
      return navigator.openTerminal(await deps.host(), input.terminalId!) ? { ok: true, message: "Opened the terminal." } : { ok: false, message: `Terminal ${input.terminalId} was not found in this window.` };
    }
    case "workspace": {
      const navigator = deps.navigator();
      if (!navigator) return { ok: false, message: NEEDS_SIDEBAR };
      return navigator.openWorkspace(await deps.host(), input.workspaceId!) ? { ok: true, message: "Opened the workspace." } : { ok: false, message: `Workspace ${input.workspaceId} was not found in this window.` };
    }
    case "pin":
      return { ok: false, message: "Pinning runs on the daemon, not in a window." };
  }
}

const REPEAT_MS = 1_000;
/**
 * Sends a change at once; while M keeps using the window, repeats at most every second (so coming back
 * from another window within a moment still counts). `reset` makes
 * the next report send whatever it says: a restarted daemon has forgotten every earlier one.
 */
export function createUseReporter(send: (inFront: boolean) => void, now: () => number = Date.now) {
  let last: { inFront: boolean; at: number } | null = null;
  const report = (inFront: boolean) => {
    if (last && last.inFront === inFront && (!inFront || now() - last.at < REPEAT_MS)) return;
    last = { inFront, at: now() };
    send(inFront);
  };
  return Object.assign(report, { reset: () => void (last = null) });
}

const TYPING_MS = 3_000;
/**
 * Whether M is typing in this window: on web and desktop, a key within the last 3 s; on a phone,
 * whose keys this plugin cannot see, the on-screen keyboard being up.
 */
export function createTypingCheck({ web, now = Date.now, keyboardUp }: { web: boolean; now?: () => number; keyboardUp: () => boolean }) {
  let lastKeyAt = -Infinity;
  return {
    typed: () => void (lastKeyAt = now()),
    typing: () => (web ? now() - lastKeyAt < TYPING_MS : keyboardUp()),
  };
}

const newWindowId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Starts this window's side. `reopen` re-subscribes (call it on each workspace snapshot, as the reminder keeper does). */
export function startShow(client: PluginClientContext): { reopen(): void; stop(): void } {
  const windowId = newWindowId();
  const report = createUseReporter((inFront) => void client.rpc(showUsed, { windowId, inFront }).catch(() => {}));
  const keys = createTypingCheck({ web: Platform.OS === "web", keyboardUp: () => Keyboard.isVisible() });
  // Read once it is first needed; a failed read is not kept, so the next request reads again.
  let host: Promise<string> | null = null;
  const deps: ShowDeps = {
    composers: (agentId) => client.composers({ agentId }),
    openScreen: (screenId, params) => client.openScreen({ screenId, params }),
    navigator: () => current,
    host: () =>
      (host ??= client.paseo.hosts.list().then(
        (directory) => directory.self.serverId,
        (error: unknown) => {
          host = null;
          throw error;
        },
      )),
    typing: keys.typing,
  };
  const answer = (requestId: string, result: ShowAnswer) =>
    client.rpc(showResult, { requestId, ok: result.ok, message: result.message.slice(0, 300) }).catch((error: unknown) => console.error("[morphise] Could not answer a show request", error));
  let release: (() => void) | null = null;
  let stopped = false;
  // One request at a time in this window, so one agent's chat cannot pull the screen away from
  // another agent's draft while it is still being placed.
  let queue: Promise<unknown> = Promise.resolve();
  const reopen = () => {
    release?.();
    const handle = client.subscribe(showChannel, { windowId }, (request) => {
      queue = queue.then(() => runShow(request.input, deps).then((result) => answer(request.requestId, result)));
    }, {
      onClosed: ({ error }) => {
        if (error && !stopped) console.error("[morphise] Show-in-Paseo channel closed; it reopens on the next reconnect", error);
      },
    });
    handle.ready
      .then(() => {
        report.reset();
        report(Platform.OS === "web" ? windowInFront() : AppState.currentState === "active");
      })
      .catch(() => {});
    release = handle;
  };
  const appState = Platform.OS === "web" ? null : AppState.addEventListener("change", (state) => report(state === "active"));
  const stopWatching = appState ? () => appState.remove() : watchWindowUse(report, keys.typed);
  return {
    reopen,
    stop() {
      stopped = true;
      stopWatching();
      release?.();
    },
  };
}
