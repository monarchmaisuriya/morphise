import { homedir } from "node:os";
import { join } from "node:path";
import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { checkpointFields, checkpointRead, checkpointSave, workId } from "../shared/work-checkpoints";
import { calendarRead } from "../shared/work-calendar";
import { WorkStore } from "./work-store";

export function registerWork(server: PluginServerContext) {
  const store = new WorkStore(join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-data", "morphise", "work", "records.json"));
  const tool = defineAgentTool({
    name: "workspace_checkpoint", title: "Workspace checkpoint", description: "Read or update your own workspace's explicit checkpoint: goal, last verified result, blocker and next step. Read first; update requires the revision you read. Record only verified results, not claimed completion without evidence.",
    input: z.discriminatedUnion("action", [z.object({ action: z.literal("read") }), z.object({ action: z.literal("update"), revision: z.number().int().nonnegative(), fields: checkpointFields })]),
    async execute(input, { agent, paseo }) {
      if (!agent.workspaceId || agent.parentAgentId || (agent as unknown as { background?: boolean }).background || agent.metadata?.["morphise.titleHelper"] === true) return { text: "Only a user-owned top-level agent with a workspace can manage its checkpoint.", isError: true };
      const current = (await paseo.agents.ref(agent.id).refresh())?.agent;
      if (!current || current.workspaceId !== agent.workspaceId || current.labels?.["paseo.parent-agent-id"] || current.background || current.metadata?.["morphise.titleHelper"]) return { text: "Your workspace membership could not be verified.", isError: true };
      const value = input.action === "read" ? await store.readCheckpoint(agent.workspaceId) : await store.saveCheckpoint(agent.workspaceId, input.revision, input.fields, `agent:${agent.id}`);
      return { text: JSON.stringify(value) };
    },
  });
  server.handle(checkpointRead, async ({ workspaceId }, { paseo }) => {
    if (!(await paseo.workspaces.ref(workspaceId).refresh())) throw new Error("Workspace no longer exists on this host.");
    return store.readCheckpoint(workspaceId);
  });
  server.handle(checkpointSave, async ({ workspaceId, revision, fields }, { paseo }) => {
    workId.parse(workspaceId);
    if (!(await paseo.workspaces.ref(workspaceId).refresh())) throw new Error("Workspace no longer exists on this host.");
    return store.saveCheckpoint(workspaceId, revision, fields, "user");
  });
  server.handle(calendarRead, ({ from, to }) => store.calendar(from, to));
  const visible = (agent: { metadata: Record<string, unknown>; background?: boolean }) => !agent.background && !agent.metadata["morphise.titleHelper"];
  const stops = [
    server.addHook("agent.open.before", async ({ request }) => request.purpose !== "history" && !request.labels?.["paseo.parent-agent-id"] && !(request as unknown as { background?: boolean }).background && !request.metadata?.["morphise.titleHelper"] ? { ...request, tools: [...request.tools, tool] } : undefined),
    server.addHook("agent.turn.before", async ({ agent, turnId }) => { if (visible(agent)) await store.start(agent, turnId); }),
    server.addHook("agent.turn.after", async ({ agent, turnId, outcome }) => { if (visible(agent)) await store.end(agent.id, turnId, outcome.kind, agent.title); }),
    server.addHook("agent.close.after", async ({ agent }) => { await store.close(agent.id); }),
    server.addHook("agent.archive.after", async ({ agent }) => { await store.close(agent.id); }),
  ];
  return () => stops.forEach((stop) => stop());
}
