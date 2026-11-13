// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/index.server.ts (the run handlers; the folder rule is Morphise's)
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { RUN_KIND, RUN_VERSION, cardIdOf } from "../../shared/run/row";
import { fullOutput, input, send, start, stop, tail } from "../../shared/run/rpc";
import { errorMessage } from "../../shared/run/text";
import { createLogStore, defaultLogRoot } from "./logs";
import { createRunRegistry } from "./runs";
import { agentOf, sendToAgent, sendVia } from "./send";

type AgentLookup = { agents: { ref(agentId: string): { refresh(): Promise<{ agent: { cwd: string | null } } | null> } } };

// The folder a run starts in is always the agent's own, read from the daemon here; the client
// never names it. An agent the daemon doesn't know, or one with no folder, runs nothing.
export async function agentFolder(paseo: AgentLookup, agentId: string): Promise<string> {
  const found = await paseo.agents
    .ref(agentId)
    .refresh()
    .catch((error: unknown) => {
      throw new Error(`Paseo doesn't know this chat, so nothing ran (${errorMessage(error)}).`);
    });
  if (!found) throw new Error("Paseo doesn't know this chat, so nothing ran.");
  if (!found.agent.cwd) throw new Error("This chat has no folder, so nothing ran.");
  return found.agent.cwd;
}

// Commands run as the user from /run, the Run buttons and Rerun, each as a "run" row in
// the chat. Returns cleanup: running commands are marked interrupted and their processes ended.
export function registerRun(server: PluginServerContext): () => Promise<void> {
  // `paseo` exists only inside handler and hook contexts; every one of them hands over the
  // same object, so the first call remembers it for the process events that fire later.
  let paseo: PluginHandlerContext["paseo"] | null = null;
  const bind = (context: PluginHandlerContext) => (paseo = context.paseo);

  const runs = createRunRegistry({
    publish: async (agentId, row) => {
      if (!paseo) throw new Error("Paseo isn't connected yet.");
      await paseo.agents.ref(agentId).timeline.append({ type: "plugin", id: cardIdOf(row), kind: RUN_KIND, version: RUN_VERSION, data: row });
    },
    now: Date.now,
    env: process.env,
  });
  const sendCounts = new Map<string, number>();
  const logs = createLogStore({ root: defaultLogRoot() });
  void logs.prune().catch(() => undefined);

  server.handle(start, async ({ agentId, command, rerunOf }, context) => {
    bind(context);
    const cwd = await agentFolder(context.paseo, agentId);
    return runs.start({ agentId, cwd, command, rerunOf });
  });
  server.handle(stop, ({ runId, force }, context) => (bind(context), runs.stop(runId, force), { ok: true as const }));
  server.handle(input, ({ runId, keys }) => (runs.input(runId, keys), { ok: true as const }));
  server.handle(tail, ({ runId, lines, since, waitMs }, context) => (bind(context), runs.tail(runId, lines, since, waitMs)));
  server.handle(fullOutput, ({ runId }) => runs.fullText(runId));
  server.handle(send, (params, context) =>
    (bind(context), sendToAgent({ runs, logs, agent: agentOf(context.paseo), send: sendVia(context.paseo), sendCounts }, params)),
  );
  // An archived chat is done with: its running commands stop and its saved logs go with it (its folder
  // may be a worktree that archiving deletes). Archiving a workspace archives its chats.
  const stopArchive = server.addHook("agent.archive.after", async ({ agent }) => {
    runs.stopAgent(agent.id);
    await logs.forget(agent.id);
  });

  return async () => {
    stopArchive();
    await runs.shutdown();
  };
}
