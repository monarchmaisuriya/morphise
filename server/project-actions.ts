import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkProjectId, removeProject, type RemoveProjectResult } from "../shared/project-actions";
import { type CliRunner, findCli, isExecutable, spawnCli } from "./agent-actions";

// The daemon side of Remove project: Paseo's CLI, given its arguments as a list (never through a shell). The CLI talks
// to its default daemon, so it first checks that daemon lists the project, so one shown from another host is never
// removed here. Ported from Project Groups by topar12 (MIT, see NOTICE.md), server/remove-project.ts at 8515d90.

// Paseo archives the project's workspaces one after another inside the delete; under the 30 s every plugin RPC gets.
const DELETE_MS = 25_000;
const LIST_MS = 12_000;

const withHome = (args: string[], home: string | undefined) => (home ? [...args, "--home", home] : args);

export function createProjectActions({ run, cli, home }: { run: CliRunner; cli: () => string | null; home: string | undefined }) {
  async function listed(path: string, projectId: string): Promise<boolean | string> {
    const outcome = await run(path, withHome(["project", "ls", "--json"], home), LIST_MS);
    if (outcome.code !== 0) return outcome.stderr.trim() || outcome.stdout.trim() || `paseo project ls exited with code ${outcome.code}`;
    const projects = JSON.parse(outcome.stdout) as unknown;
    return Array.isArray(projects) && projects.some((project) => (project as { projectId?: unknown }).projectId === projectId);
  }

  async function remove({ projectId }: { projectId: string }): Promise<RemoveProjectResult> {
    const problem = checkProjectId(projectId);
    if (problem) return { ok: false, error: problem };
    const path = cli();
    if (!path) return { ok: false, error: "The paseo command was not found on the daemon's machine" };
    try {
      const before = await listed(path, projectId);
      if (typeof before === "string") return { ok: false, error: before };
      if (!before) return { ok: false, error: "This project is not on the daemon Morphise runs on, so it was not removed" };
      console.log(`[morphise] project remove ${projectId}`);
      const outcome = await run(path, withHome(["project", "delete", projectId, "--json"], home), DELETE_MS);
      if (outcome.timedOut) {
        // The delete may still finish on the daemon: report what is true now, not a bare timeout.
        const after = await listed(path, projectId);
        return after === false ? { ok: true, removedWorkspaceIds: [] } : { ok: false, error: "Paseo is still removing this project; it will leave the sidebar when it is done" };
      }
      if (outcome.code !== 0) return { ok: false, error: outcome.stderr.trim() || outcome.stdout.trim() || `paseo project delete exited with code ${outcome.code}` };
      const removed = (JSON.parse(outcome.stdout) as { removedWorkspaceIds?: unknown }).removedWorkspaceIds;
      return { ok: true, removedWorkspaceIds: Array.isArray(removed) ? removed.filter((id): id is string => typeof id === "string") : [] };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { remove };
}

export function registerProjectActions(server: PluginServerContext): void {
  const actions = createProjectActions({ run: spawnCli, cli: () => findCli(process.env, isExecutable), home: process.env.PASEO_HOME || undefined });
  server.handle(removeProject, (input) => actions.remove(input));
}
