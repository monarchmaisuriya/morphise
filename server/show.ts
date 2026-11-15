// The daemon side of "Show in Paseo" (shared/show.ts). Every Paseo window holds `show.channel`
// open; the daemon sends each request to the window M used last and waits for its answer, so an
// action runs in one window only. Pinning needs no window and runs here.
import { randomUUID } from "node:crypto";
import { defineAgentTool, type AgentToolDefinition } from "@getpaseo/plugin/server";
import { SHOW_TOOL, showEnabled, showInput, type ShowInput, type ShowRequest } from "../shared/show";
import { PARENT_AGENT_ID_LABEL } from "../shared/chat-status";
import { TITLE_HELPER } from "./titles";

export interface ShowAnswer {
  ok: boolean;
  message: string;
}

interface Subscription {
  windowId: string;
  openedAt: number;
  push(request: ShowRequest): Promise<void>;
}

interface Pending {
  agentId: string;
  subscription: Subscription;
  finish(answer: ShowAnswer): void;
}

const NO_WINDOW = "No Paseo window is open, so nothing could be shown.";
const CLOSED = "The Paseo window closed before it answered.";
const STOPPED = "Morphise stopped before the window answered.";
const BUSY = "A request from this agent is still waiting; try again when it answers.";

export function createShowWindows({
  now = Date.now,
  newId = randomUUID,
  // Longer than Paseo's own 15 s wait for a chat to come on screen (agent-composer REVEAL_TIMEOUT_MS
  // in 0.16.0-beta.2), so the agent gets Paseo's answer rather than a timeout.
  timeoutMs = 20_000,
}: { now?: () => number; newId?: () => string; timeoutMs?: number } = {}) {
  // Keyed by subscription, so a reconnect's late close removes only the old one.
  const subscriptions = new Set<Subscription>();
  // Kept per window id, so it outlives a reconnect.
  const usage = new Map<string, { at: number; inFront: boolean }>();
  const pending = new Map<string, Pending>();

  const usedAt = (subscription: Subscription) => usage.get(subscription.windowId)?.at ?? -Infinity;
  // The window used last that M has not since left; if M left them all, the one used last;
  // with no reports at all, the newest.
  function target(): Subscription | null {
    const all = [...subscriptions];
    if (all.length === 0) return null;
    const byUse = (list: Subscription[]) => list.sort((a, b) => usedAt(b) - usedAt(a) || b.openedAt - a.openedAt)[0]!;
    const inFront = all.filter((subscription) => usage.get(subscription.windowId)?.inFront);
    return byUse(inFront.length ? inFront : all);
  }

  return {
    /** Serves one window's subscription until it closes. */
    serve(windowId: string, push: (request: ShowRequest) => Promise<void>, signal: AbortSignal): Promise<void> {
      const subscription: Subscription = { windowId, openedAt: now(), push };
      subscriptions.add(subscription);
      return new Promise<void>((resolve) => {
        const close = () => {
          subscriptions.delete(subscription);
          for (const request of pending.values()) if (request.subscription === subscription) request.finish({ ok: false, message: CLOSED });
          resolve();
        };
        if (signal.aborted) close();
        else signal.addEventListener("abort", close, { once: true });
      });
    },
    used(windowId: string, inFront: boolean) {
      // Leaving is not a use: a window that only ever reported leaving ranks below any that was used.
      usage.set(windowId, { at: inFront ? now() : (usage.get(windowId)?.at ?? -Infinity), inFront });
    },
    /** A window's answer; an unknown or expired request id is ignored. */
    answer(requestId: string, ok: boolean, message: string) {
      pending.get(requestId)?.finish({ ok, message });
    },
    request(agentId: string, input: ShowInput, signal?: AbortSignal): Promise<ShowAnswer> {
      if ([...pending.values()].some((request) => request.agentId === agentId)) return Promise.resolve({ ok: false, message: BUSY });
      const subscription = target();
      if (!subscription) return Promise.resolve({ ok: false, message: NO_WINDOW });
      const requestId = newId();
      return new Promise<ShowAnswer>((resolve) => {
        const finish = (answer: ShowAnswer) => {
          if (!pending.delete(requestId)) return;
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          resolve(answer);
        };
        const cancel = () => finish({ ok: false, message: "Cancelled." });
        const timer = setTimeout(
          () => finish({ ok: false, message: `The Paseo window did not answer within ${timeoutMs / 1000} s; it may still open. Do not ask again at once.` }),
          timeoutMs,
        );
        pending.set(requestId, { agentId, subscription, finish });
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) return cancel();
        subscription.push({ requestId, input }).catch((error: unknown) => finish({ ok: false, message: `Could not reach the Paseo window: ${error instanceof Error ? error.message : String(error)}` }));
      });
    },
    stop() {
      for (const request of [...pending.values()]) request.finish({ ok: false, message: STOPPED });
    },
  };
}
export type ShowWindows = ReturnType<typeof createShowWindows>;

/** At most `perMinute` calls per agent in any 60 s, counting every call, refused ones included. */
export function createRateLimit({ perMinute = 10, now = Date.now }: { perMinute?: number; now?: () => number } = {}) {
  const recent = new Map<string, number[]>();
  return {
    perMinute,
    allow(agentId: string): boolean {
      const since = now() - 60_000;
      const calls = (recent.get(agentId) ?? []).filter((at) => at > since);
      if (calls.length >= perMinute) return (recent.set(agentId, calls), false);
      recent.set(agentId, [...calls, now()]);
      return true;
    },
  };
}

interface ToolAgent {
  id: string;
  workspaceId: string | null;
  parentAgentId: string | null;
  // Sent by Paseo 0.16.0-beta.2 and later; absent from the installed SDK's type.
  background?: boolean;
}

interface Pinning {
  workspaces: { ref(workspaceId: string): { setPinned(pinned: boolean): Promise<unknown> } };
}

const SUBJECT: Record<ShowInput["action"], (input: ShowInput) => string | undefined> = {
  chat: (input) => input.agentId,
  draft: (input) => input.agentId,
  terminal: (input) => input.terminalId,
  workspace: (input) => input.workspaceId,
  pin: (input) => input.workspaceId,
  screen: (input) => [input.screen, input.view].filter(Boolean).join(" "),
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * An agent may leave out its own chat or workspace id. Fills it from the caller Paseo describes,
 * never from the input, so "your own" cannot point anywhere else. `filled` names what was used.
 */
function fillOwnIds(input: ShowInput, caller: ToolAgent): { input: ShowInput; filled: string | null } | { refusal: string } {
  if ((input.action === "chat" || input.action === "draft") && input.agentId === undefined) {
    return { input: { ...input, agentId: caller.id }, filled: `your own chat: ${caller.id}` };
  }
  if ((input.action === "workspace" || input.action === "pin") && input.workspaceId === undefined) {
    if (!caller.workspaceId) return { refusal: "This chat has no workspace; give a workspaceId." };
    return { input: { ...input, workspaceId: caller.workspaceId }, filled: `your workspace: ${caller.workspaceId}` };
  }
  return { input, filled: null };
}

export function createShowTool({
  windows,
  enabled,
  log,
  rate = createRateLimit(),
}: {
  windows: ShowWindows;
  enabled(): Promise<boolean>;
  log(line: string): void;
  rate?: ReturnType<typeof createRateLimit>;
}): AgentToolDefinition {
  // An unreadable setting counts as off, and is logged.
  const isOn = () =>
    enabled().catch((error: unknown) => {
      log(`[morphise] show_in_paseo setting unreadable, treated as off: ${errorText(error)}`);
      return false;
    });
  // The guards run first; then the caller's own ids are filled in, and the action gets complete ids.
  async function run(caller: ToolAgent, given: ShowInput, paseo: Pinning, signal: AbortSignal): Promise<{ input: ShowInput; answer: ShowAnswer }> {
    const refuse = (message: string) => ({ input: given, answer: { ok: false, message } });
    if (!(await isOn())) return refuse("Show in Paseo is turned off in Morphise's settings.");
    if (caller.parentAgentId || caller.background === true) return refuse("Only the user's own chats can show things in Paseo, not sub-agents or background helpers.");
    if (!rate.allow(caller.id)) return refuse(`Too many requests from this agent; at most ${rate.perMinute} a minute.`);
    const own = fillOwnIds(given, caller);
    if ("refusal" in own) return refuse(own.refusal);
    const answer = await act(caller, own.input, paseo, signal);
    // Every answer after a fill names the id used, so the agent learns it even when the action failed.
    return { input: own.input, answer: own.filled ? { ...answer, message: `${answer.message} (${own.filled})` } : answer };
  }
  function act(caller: ToolAgent, input: ShowInput, paseo: Pinning, signal: AbortSignal): Promise<ShowAnswer> {
    if (input.action !== "pin") return windows.request(caller.id, input, signal);
    const done = input.pinned ? "Pinned the workspace." : "Unpinned the workspace.";
    return paseo.workspaces
      .ref(input.workspaceId!)
      .setPinned(input.pinned!)
      .then(
        () => ({ ok: true, message: done }),
        (error: unknown) => ({ ok: false, message: `Could not ${input.pinned ? "pin" : "unpin"}: ${errorText(error)}` }),
      );
  }
  return defineAgentTool({
    name: SHOW_TOOL,
    title: "Show in Paseo",
    description:
      "Bring something to the front of the user's Paseo app, only when the user asks to see or open it: a chat, a terminal, a workspace or a Morphise screen; put text in an agent's empty message box for the user to read and send; or pin a workspace. Leave agentId or workspaceId out to mean your own chat or workspace. Nothing is sent or pressed for the user.",
    input: showInput,
    async execute(input, { agent, paseo, signal }) {
      const caller = agent as unknown as ToolAgent;
      const { input: used, answer } = await run(caller, input, paseo as unknown as Pinning, signal);
      // Every call is logged, refusals included, with the ids actually used.
      log(`[morphise] show_in_paseo ${caller.id} ${used.action} ${SUBJECT[used.action](used)}: ${answer.message}`);
      return answer.ok ? { text: answer.message } : { text: answer.message, isError: true };
    },
  });
}

/** Whether the tool is on: missing means on (M's choice); a document that fails its schema counts as off, and is logged. */
export function readShowSetting(
  read: () => Promise<{ status: "ready"; values: { enabled?: boolean } } | { status: "invalid"; error: string }>,
  log: (line: string) => void,
) {
  return async () => {
    const state = await read();
    if (state.status === "ready") return showEnabled(state.values);
    log(`[morphise] show_in_paseo setting is invalid, treated as off (reset it in Settings, Chat): ${state.error}`);
    return false;
  };
}

interface OpenRequest {
  tools: AgentToolDefinition[];
  labels?: Readonly<Record<string, string>>;
  metadata?: Readonly<Record<string, unknown>>;
  // Sent by Paseo 0.16.0-beta.2 and later; absent from the installed SDK's type.
  background?: boolean;
}

/**
 * For `agent.open.before`: the session gets the tool while the setting is on. Morphise's title
 * helper, sub-agents and background helpers never do; `execute` refuses them again at call time.
 */
export function createShowHook({ enabled, tool }: { enabled(): Promise<boolean>; tool: AgentToolDefinition }) {
  return async <Request extends OpenRequest>({ request }: { request: Request }): Promise<Request | undefined> => {
    if (request.metadata?.[TITLE_HELPER] === true || request.labels?.[PARENT_AGENT_ID_LABEL] || request.background === true) return undefined;
    const on = await enabled().catch((error: unknown) => (console.error("[morphise] Could not read the show-in-Paseo setting; the tool is not attached", error), false));
    if (!on) return undefined;
    return { ...request, tools: [...request.tools, tool] };
  };
}
