import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerWork } from "./work.register";

it("attaches checkpoint tools only to interactive top-level sessions and rejects spoofed membership", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-tools-"));
  const home = process.env.PASEO_HOME;
  process.env.PASEO_HOME = root;
  try {
    const hooks = new Map<string, (input: any, context?: any) => Promise<any>>();
    const handlers = new Map<string, any>();
    const stop = registerWork({ addHook: (name: string, hook: any) => { hooks.set(name, hook); return () => {}; }, handle: (contract: { name: string }, handler: any) => handlers.set(contract.name, handler) } as unknown as PluginServerContext);
    const attach = hooks.get("agent.open.before")!;
    expect(await attach({ request: { purpose: "history", tools: [] } })).toBeUndefined();
    expect(await attach({ request: { purpose: "interactive", labels: { "paseo.parent-agent-id": "parent" }, tools: [] } })).toBeUndefined();
    const { tools } = await attach({ request: { purpose: "interactive", tools: [] } });
    const tool = tools[0];
    const caller = { id: "owner", workspaceId: "own", parentAgentId: null, metadata: {} };
    const paseo = { agents: { ref: () => ({ refresh: async () => ({ agent: { workspaceId: "other", labels: {} } }) }) } };
    expect(await tool.execute({ action: "update", revision: 0, fields: { goal: "wrong", verified: "", blocked: "", next: "" } }, { agent: caller, paseo })).toMatchObject({ isError: true });
    expect(await tool.execute({ action: "read" }, { agent: { ...caller, parentAgentId: "parent" }, paseo })).toMatchObject({ isError: true });
    const ownPaseo = { agents: { ref: () => ({ refresh: async () => ({ agent: { workspaceId: "own", labels: {} } }) }) } };
    const read = await tool.execute({ action: "read" }, { agent: caller, paseo: ownPaseo });
    expect(JSON.parse(read.text)).toMatchObject({ workspaceId: "own", revision: 0 });
    const saved = await tool.execute({ action: "update", revision: 0, fields: { goal: "own goal", verified: "", blocked: "", next: "" } }, { agent: caller, paseo: ownPaseo });
    expect(JSON.parse(saved.text)).toMatchObject({ workspaceId: "own", author: "agent:owner", revision: 1 });
    expect(handlers.has("work.calendar.read")).toBe(true);
    stop();
  } finally { if (home === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = home; await rm(root, { recursive: true, force: true }); }
});
