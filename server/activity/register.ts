// The Activity tab's daemon side: the index and the summary RPC (Settings, General, "Activity tab").
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { type ActivitySummary, activitySettings, activitySummary, summarize } from "../../shared/activity";
import { SessionReader } from "../stats/sessions";
import { type ActivityPaseo, ActivityIndex } from "./index";

export const activityIndexFile = (env: NodeJS.ProcessEnv = process.env) => join(env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-cache", "morphise", "activity-index.json");

export function createActivityHandler(index: ActivityIndex, now: () => number = Date.now) {
  return async (input: { provider: string | null; workspaceId: string | null; tzOffsetMinutes: number }, paseo: ActivityPaseo): Promise<ActivitySummary> => {
    const state = await index.run(paseo);
    console.log(`[morphise] activity ${state.indexing.done}/${state.indexing.total}${state.indexing.errors ? ` (${state.indexing.errors} unreadable)` : ""}`);
    const agents = state.agents.filter((agent) => (!input.provider || agent.provider === input.provider) && (!input.workspaceId || agent.workspaceId === input.workspaceId));
    return summarize(agents, { now: now(), tzOffsetMinutes: input.tzOffsetMinutes, indexing: state.indexing, providers: state.providers });
  };
}

export function registerActivity(server: PluginServerContext): void {
  server.registerSettings(activitySettings);
  const index = new ActivityIndex(activityIndexFile(), new SessionReader());
  const handle = createActivityHandler(index);
  server.handle(activitySummary, (input, { paseo }) => handle(input, paseo));
}
