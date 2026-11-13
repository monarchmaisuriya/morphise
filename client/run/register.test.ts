import type { PluginClientContext } from "@getpaseo/plugin/client";
import { describe, expect, it, vi } from "vitest";
import { RUN_KIND } from "../../shared/run/row";
import { start } from "../../shared/run/rpc";

vi.mock("./run-row", () => ({ RunRowView: () => null }));
const { registerRun } = await import("./register");

type Submit = (context: { args: string; agent: { id: string; cwd: string }; rpc: (contract: unknown, input: unknown) => Promise<unknown> }) => Promise<void>;

function fakeClient() {
  const commands = new Map<string, { context: string; onSubmit: Submit }>();
  const renderers: string[] = [];
  const client = {
    addSlashCommand: (command: { name: string; context: string; onSubmit: Submit }) => (commands.set(command.name, command), () => commands.delete(command.name)),
    addTimelineRenderer: (renderer: { kind: string }) => (renderers.push(renderer.kind), () => renderers.splice(renderers.indexOf(renderer.kind), 1)),
  } as unknown as PluginClientContext;
  return { client, commands, renderers };
}

describe("/run", () => {
  it("starts the typed command in the chat it was typed in, without naming a folder", async () => {
    const { client, commands } = fakeClient();
    registerRun(client);
    const rpc = vi.fn(async () => ({ runId: "abcdef" }));
    await commands.get("run")!.onSubmit({ args: "$ git status", agent: { id: "agent-1", cwd: "/repo" }, rpc });
    expect(rpc).toHaveBeenCalledWith(start, { agentId: "agent-1", command: "git status" });
  });

  it("asks for a command when none was typed, and names the command when starting fails", async () => {
    const { client, commands } = fakeClient();
    registerRun(client);
    const rpc = vi.fn(async () => {
      throw new Error("Paseo doesn't know this chat, so nothing ran.");
    });
    await expect(commands.get("run")!.onSubmit({ args: " ! ", agent: { id: "agent-1", cwd: "/repo" }, rpc })).rejects.toThrow(/Type a command after \/run/);
    expect(rpc).not.toHaveBeenCalled();
    await expect(commands.get("run")!.onSubmit({ args: "npm test", agent: { id: "agent-1", cwd: "/repo" }, rpc })).rejects.toThrow(
      `Couldn't run "npm test": Paseo doesn't know this chat, so nothing ran.`,
    );
  });

  it("is an agent command named run, not sh, and its cleanup removes it and the card renderer", () => {
    const { client, commands, renderers } = fakeClient();
    const stop = registerRun(client);
    expect([...commands.keys()]).toEqual(["run"]);
    expect(commands.get("run")!.context).toBe("agent");
    expect(renderers).toEqual([RUN_KIND]);
    stop();
    expect(commands.size).toBe(0);
    expect(renderers).toEqual([]);
  });
});
