import { existsSync, mkdtempSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lineText, type RunRow } from "../../shared/run/row";
import { start } from "../../shared/run/rpc";
import { createLogStore, defaultLogRoot } from "./logs";
import { agentFolder, registerRun } from "./register";

const posix = process.platform === "win32" ? it.skip : it;
const home = process.env.HOME;
// The runner saves logs under the home folder; keep them out of the real one.
beforeAll(() => {
  process.env.HOME = mkdtempSync(join(tmpdir(), "morphise-run-home-"));
});
afterAll(() => {
  process.env.HOME = home;
});

type Handler = (input: unknown, context: unknown) => unknown;

// A daemon that knows the agents in `folders` (id -> cwd); any other id is unknown to it.
function fakePaseo(folders: Record<string, string | null>) {
  const appended: RunRow[] = [];
  const paseo = {
    agents: {
      ref: (id: string) => ({
        refresh: async () => {
          if (!(id in folders)) throw new Error(`Agent ${id} not found`);
          return { agent: { id, cwd: folders[id] } };
        },
        timeline: {
          append: async (item: { data: RunRow }) => {
            if (!(id in folders)) throw new Error("Unknown agent");
            appended.push(item.data);
            return { seq: appended.length, epoch: "e" };
          },
        },
      }),
    },
  };
  return { paseo, appended };
}

function fakeServer() {
  const handlers = new Map<string, Handler>();
  const hooks = new Map<string, Handler>();
  const server = {
    handle: (contract: { name: string }, handler: Handler) => handlers.set(contract.name, handler),
    addHook: (name: string, handler: Handler) => (hooks.set(name, handler), () => hooks.delete(name)),
  } as unknown as PluginServerContext;
  return { server, handlers, hooks };
}

describe("the folder a run starts in", () => {
  it("is the agent's own folder, read from the daemon", async () => {
    const { paseo } = fakePaseo({ "agent-1": "/repos/app" });
    await expect(agentFolder(paseo, "agent-1")).resolves.toBe("/repos/app");
  });

  it("is refused when the daemon does not know the agent, or the agent has no folder", async () => {
    const { paseo } = fakePaseo({ "agent-1": null, "agent-2": "" });
    await expect(agentFolder(paseo, "nobody")).rejects.toThrow(/doesn't know this chat/);
    await expect(agentFolder(paseo, "agent-1")).rejects.toThrow(/has no folder/);
    await expect(agentFolder(paseo, "agent-2")).rejects.toThrow(/has no folder/);
  });

  it("can't be chosen by the caller: the start contract has no folder field", () => {
    const parsed = start.input.parse({ agentId: "agent-1", command: "pwd", cwd: "/etc" }) as Record<string, unknown>;
    expect(parsed).toEqual({ agentId: "agent-1", command: "pwd" });
  });

  posix("start runs the command in the agent's folder and shows that folder on the card", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "morphise-run-agent-"));
    const { paseo, appended } = fakePaseo({ "agent-1": cwd });
    const { server, handlers } = fakeServer();
    const stop = registerRun(server);
    try {
      const { runId } = (await handlers.get(start.name)!(start.input.parse({ agentId: "agent-1", command: "pwd -P", cwd: "/" }), { paseo })) as { runId: string };
      const deadline = Date.now() + 10_000;
      while (!appended.some((row) => row.runId === runId && row.phase.kind !== "running")) {
        if (Date.now() > deadline) throw new Error("timed out waiting for the run to end");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const ended = appended.filter((row) => row.runId === runId).at(-1)!;
      expect(ended.cwd).toBe(cwd);
      expect(ended.phase.kind).toBe("ok");
      expect(ended.output.lines.map(lineText)).toEqual([realpathSync(cwd)]);
    } finally {
      await stop();
    }
  });

  it("start refuses an unknown agent and runs nothing", async () => {
    const { paseo, appended } = fakePaseo({});
    const { server, handlers } = fakeServer();
    const stop = registerRun(server);
    try {
      await expect(handlers.get(start.name)!(start.input.parse({ agentId: "ghost", command: "touch ran.marker" }), { paseo })).rejects.toThrow(/doesn't know this chat/);
      expect(appended).toEqual([]);
    } finally {
      await stop();
    }
  });
});

describe("saved logs", () => {
  it("go with their chat when it is archived", async () => {
    const { server, hooks } = fakeServer();
    const stop = registerRun(server);
    try {
      const store = createLogStore({ root: defaultLogRoot() });
      const kept = await store.save({ agentId: "agent-2", runId: "r2", command: "ls", text: "x\n" });
      const gone = await store.save({ agentId: "agent-1", runId: "r1", command: "ls", text: "x\n" });
      await hooks.get("agent.archive.after")!({ agent: { id: "agent-1" }, archivedAt: new Date().toISOString() }, {});
      expect(existsSync(gone)).toBe(false);
      expect(existsSync(kept)).toBe(true);
      expect(readdirSync(defaultLogRoot())).toEqual(["agent-2"]);
    } finally {
      await stop();
    }
    expect(hooks.size).toBe(0);
  });
});
