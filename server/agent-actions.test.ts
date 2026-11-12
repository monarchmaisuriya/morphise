import { describe, expect, it } from "vitest";
import { checkAgentId, checkAgentTitle } from "../shared/agent-actions";
import { type CliRunner, createAgentActions, findCli, renameArgs, stopArgs } from "./agent-actions";

type Call = { cli: string; args: readonly string[]; timeoutMs: number };

function fakeRunner(result: Awaited<ReturnType<CliRunner>> | Error) {
  const calls: Call[] = [];
  const run: CliRunner = async (cli, args, timeoutMs) => {
    calls.push({ cli, args, timeoutMs });
    if (result instanceof Error) throw result;
    return result;
  };
  return { run, calls };
}

const ok = { code: 0, stdout: "", stderr: "", timedOut: false };

describe("CLI arguments", () => {
  it("stops and renames by id, as separate arguments", () => {
    expect(stopArgs("a1b2", undefined)).toEqual(["agent", "stop", "a1b2"]);
    expect(renameArgs("a1b2", "  Fix the login page ", undefined)).toEqual(["agent", "update", "a1b2", "--name", "Fix the login page"]);
  });

  it("addresses the daemon this plugin runs in when Paseo names its home", () => {
    expect(stopArgs("a1", "/tmp/paseo-test")).toEqual(["agent", "stop", "a1", "--home", "/tmp/paseo-test"]);
    expect(renameArgs("a1", "x", "/tmp/paseo-test")).toEqual(["agent", "update", "a1", "--name", "x", "--home", "/tmp/paseo-test"]);
  });

  it("refuses ids the CLI could read as an option or that are not one word", () => {
    for (const id of ["", "-rf", "--all", "a b", "a;rm -rf /", "a\nb", "x".repeat(129)]) expect(checkAgentId(id)).not.toBeNull();
    for (const id of ["3f2a9c1e-77aa-4c1e-9b0b-2a1f0c9d8e7f", "a1", "agent_1.2"]) expect(checkAgentId(id)).toBeNull();
    expect(() => stopArgs("-rf", undefined)).toThrow();
  });

  it("refuses empty, over-long or multi-line titles", () => {
    expect(checkAgentTitle("   ")).not.toBeNull();
    expect(checkAgentTitle("x".repeat(201))).not.toBeNull();
    expect(checkAgentTitle("two\nlines")).not.toBeNull();
    expect(checkAgentTitle("x".repeat(200))).toBeNull();
    expect(checkAgentTitle("--name looks like an option")).toBeNull();
  });
});

describe("findCli", () => {
  it("uses the CLI Paseo hands the plugin, else the first paseo on PATH", () => {
    const executables = new Set(["/app/bin/paseo", "/usr/local/bin/paseo"]);
    const isExecutable = (path: string) => executables.has(path);
    expect(findCli({ PASEO_CLI: "/app/bin/paseo", PATH: "/usr/local/bin" }, isExecutable)).toBe("/app/bin/paseo");
    expect(findCli({ PASEO_CLI: "/missing/paseo", PATH: "/opt/bin:/usr/local/bin" }, isExecutable)).toBe("/usr/local/bin/paseo");
    expect(findCli({ PATH: "/opt/bin" }, isExecutable)).toBeNull();
    expect(findCli({}, isExecutable)).toBeNull();
  });
});

describe("agent actions", () => {
  it("runs the CLI with the argument list and a 12 s limit", async () => {
    const runner = fakeRunner(ok);
    const actions = createAgentActions({ run: runner.run, cli: () => "/bin/paseo", home: undefined });
    expect(await actions.stop({ agentId: "a1" })).toEqual({ ok: true });
    expect(await actions.rename({ agentId: "a1", title: "New" })).toEqual({ ok: true });
    expect(runner.calls).toEqual([
      { cli: "/bin/paseo", args: ["agent", "stop", "a1"], timeoutMs: 12_000 },
      { cli: "/bin/paseo", args: ["agent", "update", "a1", "--name", "New"], timeoutMs: 12_000 },
    ]);
  });

  it("returns the CLI's own error text", async () => {
    const failing = createAgentActions({ run: fakeRunner({ code: 1, stdout: "", stderr: "  Agent not found: a1\n", timedOut: false }).run, cli: () => "/bin/paseo", home: undefined });
    expect(await failing.stop({ agentId: "a1" })).toEqual({ ok: false, error: "Agent not found: a1" });
    const quiet = createAgentActions({ run: fakeRunner({ code: 2, stdout: "", stderr: "", timedOut: false }).run, cli: () => "/bin/paseo", home: undefined });
    expect(await quiet.stop({ agentId: "a1" })).toEqual({ ok: false, error: "paseo agent stop exited with code 2" });
    const slow = createAgentActions({ run: fakeRunner({ code: null, stdout: "", stderr: "", timedOut: true }).run, cli: () => "/bin/paseo", home: undefined });
    expect(await slow.rename({ agentId: "a1", title: "x" })).toEqual({ ok: false, error: "paseo agent update took longer than 12 s" });
    const broken = createAgentActions({ run: fakeRunner(new Error("spawn EACCES")).run, cli: () => "/bin/paseo", home: undefined });
    expect(await broken.stop({ agentId: "a1" })).toEqual({ ok: false, error: "spawn EACCES" });
  });

  it("never runs the CLI for a bad id or title, or when there is no CLI", async () => {
    const runner = fakeRunner(ok);
    const actions = createAgentActions({ run: runner.run, cli: () => "/bin/paseo", home: undefined });
    expect((await actions.stop({ agentId: "--all" })).ok).toBe(false);
    expect((await actions.rename({ agentId: "a1", title: "" })).ok).toBe(false);
    const missing = createAgentActions({ run: runner.run, cli: () => null, home: undefined });
    expect(missing.available()).toEqual({ available: false });
    expect(await missing.stop({ agentId: "a1" })).toEqual({ ok: false, error: "The paseo command was not found on the daemon's machine" });
    expect(runner.calls).toEqual([]);
    expect(actions.available()).toEqual({ available: true });
  });
});
