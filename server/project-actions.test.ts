import { describe, expect, it } from "vitest";
import type { CliRunner } from "./agent-actions";
import { createProjectActions } from "./project-actions";

type Call = { args: readonly string[]; timeoutMs: number };

function runner(answers: Record<string, { code: number | null; stdout?: string; stderr?: string; timedOut?: boolean }>, calls: Call[]): CliRunner {
  return async (_cli, args, timeoutMs) => {
    calls.push({ args, timeoutMs });
    const answer = answers[`${args[0]} ${args[1]}`] ?? { code: 1, stderr: "unexpected" };
    return { code: answer.code, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "", timedOut: answer.timedOut ?? false };
  };
}

const listed = JSON.stringify([{ projectId: "prj_abc" }, { projectId: "prj_def" }]);

describe("remove project", () => {
  it("checks the daemon owns the project, then deletes it and reports the workspaces that went", async () => {
    const calls: Call[] = [];
    const actions = createProjectActions({ run: runner({ "project ls": { code: 0, stdout: listed }, "project delete": { code: 0, stdout: JSON.stringify({ removedWorkspaceIds: ["w1", "w2"] }) } }, calls), cli: () => "/bin/paseo", home: "/tmp/home" });
    expect(await actions.remove({ projectId: "prj_abc" })).toEqual({ ok: true, removedWorkspaceIds: ["w1", "w2"] });
    expect(calls.map((call) => call.args)).toEqual([
      ["project", "ls", "--json", "--home", "/tmp/home"],
      ["project", "delete", "prj_abc", "--json", "--home", "/tmp/home"],
    ]);
    expect(calls[1]?.timeoutMs).toBe(25_000);
  });

  it("refuses a project this daemon does not list, deleting nothing", async () => {
    const calls: Call[] = [];
    const actions = createProjectActions({ run: runner({ "project ls": { code: 0, stdout: listed } }, calls), cli: () => "/bin/paseo", home: undefined });
    expect(await actions.remove({ projectId: "prj_zzz" })).toEqual({ ok: false, error: "This project is not on the daemon Morphise runs on, so it was not removed" });
    expect(calls).toHaveLength(1);
  });

  it("refuses an id the CLI could read as more than an id, before running anything", async () => {
    const calls: Call[] = [];
    const actions = createProjectActions({ run: runner({}, calls), cli: () => "/bin/paseo", home: undefined });
    expect(await actions.remove({ projectId: "prj_abc; rm -rf /" })).toEqual({ ok: false, error: "Not a project id" });
    expect(calls).toHaveLength(0);
  });

  it("reports a failed listing with the CLI's own words", async () => {
    const actions = createProjectActions({ run: runner({ "project ls": { code: 2, stderr: "daemon not running" } }, []), cli: () => "/bin/paseo", home: undefined });
    expect(await actions.remove({ projectId: "prj_abc" })).toEqual({ ok: false, error: "daemon not running" });
  });

  it("after a slow delete, says whether the project is gone or still being removed", async () => {
    const gone = createProjectActions({ run: runner({ "project ls": { code: 0, stdout: listed }, "project delete": { code: null, timedOut: true } }, []), cli: () => "/bin/paseo", home: undefined });
    let lists = 0;
    const goneRunner: CliRunner = async (_cli, args) => {
      if (args[1] === "ls") return { code: 0, stdout: lists++ === 0 ? listed : JSON.stringify([{ projectId: "prj_def" }]), stderr: "", timedOut: false };
      return { code: null, stdout: "", stderr: "", timedOut: true };
    };
    const later = createProjectActions({ run: goneRunner, cli: () => "/bin/paseo", home: undefined });
    expect(await later.remove({ projectId: "prj_abc" })).toEqual({ ok: true, removedWorkspaceIds: [] });
    expect(await gone.remove({ projectId: "prj_abc" })).toEqual({ ok: false, error: "Paseo is still removing this project; it will leave the sidebar when it is done" });
  });

  it("says so when the CLI is missing", async () => {
    const actions = createProjectActions({ run: runner({}, []), cli: () => null, home: undefined });
    expect(await actions.remove({ projectId: "prj_abc" })).toEqual({ ok: false, error: "The paseo command was not found on the daemon's machine" });
  });
});
