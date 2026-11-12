import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { type AgentActionResult, agentActionsAvailable, checkAgentId, checkAgentTitle, renameAgent, stopAgent } from "../shared/agent-actions";

// The daemon side of the Agents view's Stop and Rename: Paseo's public CLI, given its arguments as
// a list (never through a shell), with each id and title checked first.

// Under the 30 s every plugin RPC gets, so a slow CLI reports its own error instead of a timeout.
const TIMEOUT_MS = 12_000;

export type CliRunner = (cli: string, args: readonly string[], timeoutMs: number) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>;

// The CLI Paseo hands plugin processes (PASEO_CLI), else the first `paseo` on PATH; null when neither exists.
export function findCli(env: Record<string, string | undefined>, isExecutable: (path: string) => boolean): string | null {
  if (env.PASEO_CLI && isExecutable(env.PASEO_CLI)) return env.PASEO_CLI;
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const path = join(directory, "paseo");
    if (isExecutable(path)) return path;
  }
  return null;
}

// The CLI talks to ~/.paseo unless told otherwise; a daemon run with its own home names it here.
const withHome = (args: string[], home: string | undefined) => (home ? [...args, "--home", home] : args);

function validId(agentId: string) {
  const problem = checkAgentId(agentId);
  if (problem) throw new Error(problem);
  return agentId;
}

export const stopArgs = (agentId: string, home: string | undefined) => withHome(["agent", "stop", validId(agentId)], home);

export function renameArgs(agentId: string, title: string, home: string | undefined) {
  const problem = checkAgentTitle(title);
  if (problem) throw new Error(problem);
  return withHome(["agent", "update", validId(agentId), "--name", title.trim()], home);
}

export function createAgentActions({ run, cli, home }: { run: CliRunner; cli: () => string | null; home: string | undefined }) {
  async function runCli(build: () => string[]): Promise<AgentActionResult> {
    let args: string[];
    try {
      args = build();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const path = cli();
    if (!path) return { ok: false, error: "The paseo command was not found on the daemon's machine" };
    const command = `paseo ${args[0]} ${args[1]}`;
    try {
      const outcome = await run(path, args, TIMEOUT_MS);
      if (outcome.timedOut) return { ok: false, error: `${command} took longer than ${TIMEOUT_MS / 1000} s` };
      if (outcome.code === 0) return { ok: true };
      return { ok: false, error: outcome.stderr.trim() || outcome.stdout.trim() || `${command} exited with code ${outcome.code}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return {
    available: () => ({ available: cli() !== null }),
    stop: ({ agentId }: { agentId: string }) => runCli(() => stopArgs(agentId, home)),
    rename: ({ agentId, title }: { agentId: string; title: string }) => runCli(() => renameArgs(agentId, title, home)),
  };
}

const spawnCli: CliRunner = (cli, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(cli, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Returns the actions, so other daemon features (titles) rename through the same checks.
export function registerAgentActions(server: PluginServerContext) {
  const actions = createAgentActions({ run: spawnCli, cli: () => findCli(process.env, isExecutable), home: process.env.PASEO_HOME || undefined });
  server.handle(agentActionsAvailable, () => actions.available());
  server.handle(stopAgent, (input) => actions.stop(input));
  server.handle(renameAgent, (input) => actions.rename(input));
  return actions;
}
