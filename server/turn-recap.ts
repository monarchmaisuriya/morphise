import type { PluginHookContext } from "@getpaseo/plugin/server";
import { TURN_RECAP_KIND, turnRecap } from "../shared/chat-view";
import { activeProfile, type ProfileDocument } from "../shared/document";
import type { SettingsState } from "./settings-watch";

// After each turn of a top-level chat, when the Chat setting "Add a recap after each turn" is on,
// appends one row that sums the turn up. Sub-agents get none, so a parent chat is not filled
// with its helpers' recaps. A failure to build or add the row is logged, never thrown into Paseo.

interface ProfileReader {
  read(): Promise<SettingsState<ProfileDocument>>;
}

interface TurnEnded {
  agent: { id: string; parentAgentId: string | null };
  turnId: string | null;
  outcome: { kind: "completed" } | { kind: "failed"; error: { message: string } } | { kind: "canceled"; reason: string };
}

interface AgentReader {
  refresh(): Promise<unknown>;
  current(): { model?: string | null; thinkingOptionId?: string | null; effectiveThinkingOptionId?: string | null; lastUsage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; totalCostUsd?: number } } | null;
}

// The model, thinking level and token use Paseo reports for the turn that just ended. Missing
// details only leave the recap without them; they never stop it.
export async function turnDetails(handle: AgentReader) {
  try {
    await handle.refresh();
    const agent = handle.current();
    if (!agent) return null;
    const usage = agent.lastUsage;
    return {
      model: agent.model ?? null,
      thinking: agent.effectiveThinkingOptionId ?? agent.thinkingOptionId ?? null,
      usage: usage ? { input: usage.inputTokens ?? null, cached: usage.cachedInputTokens ?? null, output: usage.outputTokens ?? null, cost: usage.totalCostUsd ?? null } : null,
    };
  } catch (error) {
    console.warn("[morphise] The turn recap has no model or token details", error);
    return null;
  }
}

export function createTurnRecap(profile: ProfileReader) {
  return async ({ agent, turnId, outcome }: TurnEnded, { paseo }: Pick<PluginHookContext, "paseo">) => {
    if (agent.parentAgentId) return;
    // The turn ended now; anything later in the chat is the next turn's.
    const endedAt = Date.now();
    try {
      const state = await profile.read();
      if (state.status !== "ready") return;
      const chat = activeProfile(state.values).chat;
      if (chat?.recap !== true || chat.enabled === false) return;
      const handle = paseo.agents.ref(agent.id);
      const page = await handle.timeline.refetch({ direction: "tail", limit: 1000 });
      const recap = turnRecap(page.entries, endedAt, outcome.kind, outcome.kind === "failed" ? outcome.error.message : outcome.kind === "canceled" ? outcome.reason : "");
      if (!recap) return console.warn(`[morphise] No turn recap for ${agent.id}: its prompt is not in the last 1000 timeline entries`);
      // The recap tells what a turn left behind: changed files and failures. A finished turn with neither has
      // nothing to add to Paseo's own "Worked for …".
      if (recap.files.length === 0 && recap.failed.length === 0 && recap.outcome === "completed") return;
      // The recap is plain data (numbers, strings, arrays), so it goes into the timeline as JSON.
      const data = JSON.parse(JSON.stringify({ ...recap, details: await turnDetails(handle) })) as Record<string, never>;
      await handle.timeline.append({ type: "plugin", id: `${TURN_RECAP_KIND}:${recap.prompt}:${turnId ?? ""}`, kind: TURN_RECAP_KIND, version: 1, data });
    } catch (error) {
      console.error("[morphise] Could not add the turn recap", error);
    }
  };
}
