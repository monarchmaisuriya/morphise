// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): client/actions.ts
// What the bar's buttons do, through the plugin API only (no DOM): write into a chat's message box,
// send a reply, start a side chat.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { type Prefs, SELECTION_ACTIONS, type SelectionAction } from "../../../shared/polish/prefs";
import { buildSideChatSystemPrompt, joinParagraph, sideChatTitle, type ChatTurn, type SendBehavior } from "./format";
import { say } from "./strings";

type PaseoApi = PluginClientContext["paseo"];
type AgentHandle = ReturnType<PaseoApi["agents"]["ref"]>;
type Composers = PluginClientContext["composers"];

/** The right-hand panel a side chat opens in. */
export const SIDE_CHAT_PANEL_ID = "side-chat";

/** Long enough for any turn; the wait ends early when the agent needs attention. */
const QUEUE_WAIT_MS = 6 * 60 * 60 * 1000;

/** Drops each queued reply still waiting. Paseo's wait can't be aborted, so a dropped reply is just never sent. */
const queuedReplies = new Set<() => void>();

/** Drops every queued reply still waiting for its turn to end; the selection part calls it when the plugin unloads. */
export function cancelQueuedReplies() {
  for (const drop of queuedReplies) drop();
  queuedReplies.clear();
}

/** The bar's buttons the profile turns on, in the bar's order; none when the bar is off. */
export function shownActions(prefs: Pick<Prefs, "selection" | "selectionActions">): SelectionAction[] {
  if (prefs.selection === "off") return [];
  return SELECTION_ACTIONS.filter((action) => prefs.selectionActions.includes(action));
}

/** Whether `agentId`'s message box can be written; it need not be on screen. */
export function hasComposer(composers: Composers, agentId: string): boolean {
  return composers({ agentId }).length > 0;
}

/**
 * Appends `snippet` to `agentId`'s message box as a new paragraph and puts the cursor after it.
 * The chat is named by id, so the text lands in the chat it came from with any number of tabs and
 * split panes; Paseo brings that chat's tab forward when it is not on screen.
 */
export async function appendToComposer(composers: Composers, agentId: string, snippet: string): Promise<void> {
  const composer = composers({ agentId })[0];
  if (!composer) throw new Error(say("noComposer"));
  const before = composer.prompt;
  const next = before + joinParagraph(before, snippet);
  composer.setPrompt(next);
  await composer.focus({ selection: { start: next.length, end: next.length } });
}

/**
 * Sends the text as an ordinary user message, the way the composer's Enter would: steer or
 * interrupt a running turn, or hold it until the turn ends.
 *
 * Paseo's own queue lives inside the composer, out of a plugin's reach, so a queued reply waits
 * here instead and is not shown in the composer's queue.
 */
export async function sendReply(paseo: PaseoApi, agentId: string, text: string, behavior: SendBehavior): Promise<"sent" | "queued"> {
  const agent = paseo.agents.ref(agentId);
  if (behavior === "queue") {
    const status = (await agent.refresh())?.agent.status;
    if (status === "running" || status === "initializing") {
      // A turn that stops for a permission ends the wait; the composer interrupts in that case too.
      let dropped = false;
      const drop = () => void (dropped = true);
      queuedReplies.add(drop);
      void agent
        .waitForFinish(QUEUE_WAIT_MS)
        .then(() => (dropped ? undefined : agent.send(text, { activeTurnBehavior: "interrupt" })))
        .catch((cause: unknown) => console.error("[morphise] Queued reply was not sent", cause))
        .finally(() => queuedReplies.delete(drop));
      return "queued";
    }
  }
  await agent.send(text, { activeTurnBehavior: behavior === "steer" ? "steer" : "interrupt" });
  return "sent";
}

export interface SideChat {
  agentId: string;
  workspaceId: string;
}

/**
 * The side chat's provider and model, as agents.create takes it: the parent's provider with `chosen` (Settings, Side chat model)
 * when set, else the parent's own model. A model the provider rejects fails the side chat; it never falls back to another.
 */
export function sideChatModel(provider: string, parentModel: string | null, chosen: string): { provider: string; ownModel: boolean } {
  const model = chosen || parentModel;
  return { provider: model ? `${provider}/${model}` : provider, ownModel: !chosen || chosen === parentModel };
}

/**
 * Starts a child agent next to `agentId` with the same provider, mode, and thinking level, and the
 * same model unless `model` names another. Its first message is the quote and the question; the
 * recent main-chat turns travel as instructions so the question has context.
 */
export async function startSideChat(paseo: PaseoApi, input: { agentId: string; quote: string; question: string; model?: string }): Promise<SideChat> {
  const parent = paseo.agents.ref(input.agentId);
  const [refetched, turns] = await Promise.all([parent.refresh(), readTurns(parent, 120)]);
  const snapshot = refetched?.agent ?? parent.current();
  if (!snapshot) throw new Error(say("noMainChat"));
  const workspaceId = snapshot.workspaceId;
  if (!workspaceId) throw new Error(say("noWorkspace"));

  const { provider, ownModel } = sideChatModel(snapshot.provider, snapshot.model ?? snapshot.runtimeInfo?.model ?? null, input.model ?? "");
  const child = await paseo.workspaces.ref(workspaceId).agents.create({
    config: {
      provider,
      modeId: snapshot.currentModeId ?? undefined,
      // Thinking levels are per model: another model starts at its own default.
      thinkingOptionId: ownModel ? (snapshot.thinkingOptionId ?? undefined) : undefined,
      systemPrompt: buildSideChatSystemPrompt(turns, input.quote),
    },
    parent: input.agentId,
    title: sideChatTitle(input.question, say("side")),
    prompt: `${input.quote}\n\n${input.question.trim()}`,
  });
  return { agentId: child.id, workspaceId };
}

/** The workspace a chat belongs to, for a bookmark; null when Paseo cannot say. */
export async function workspaceOf(paseo: PaseoApi, agentId: string): Promise<string | null> {
  const agent = paseo.agents.ref(agentId);
  return agent.current()?.workspaceId ?? (await agent.refresh())?.agent.workspaceId ?? null;
}

/**
 * The conversation as user and assistant turns. The projected timeline merges streamed chunks;
 * text split by tool calls is joined back into one turn.
 */
export async function readTurns(agent: AgentHandle, limit: number): Promise<ChatTurn[]> {
  const page = await agent.timeline.refetch({ direction: "tail", limit, projection: "projected" });
  const turns: ChatTurn[] = [];
  for (const entry of page.entries) {
    const item = entry.item;
    if (item.type !== "user_message" && item.type !== "assistant_message") continue;
    const role = item.type === "user_message" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text}\n\n${item.text}`;
    } else {
      turns.push({ role, text: item.text });
    }
  }
  return turns;
}
