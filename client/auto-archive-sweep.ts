import { type ArchiveRule, dueForArchive } from "../shared/auto-archive";
import { reduceWorkspaceInfo, type WorkspaceInfo } from "./workspaces";

export interface ArchiveSweepCalls {
  // The workspaces as this app last received them.
  workspaces(): Iterable<WorkspaceInfo>;
  // A fresh read of every workspace record from the host.
  fetchWorkspaces(): Promise<unknown[]>;
  archive(id: string): Promise<{ error: string | null }>;
  log: Pick<Console, "info" | "error">;
}

// Auto-archive: each due workspace is tried once for as long as the sweep lives, and archiving a
// workspace twice is harmless, so several open apps agree. A failed archive is logged, not retried.
// Archiving can delete a worktree folder, so the host's list is read again right before (once per
// sweep, for every due workspace) and a workspace is archived only if it is still due there: the
// list this app holds can lag behind new edits. One that is no longer due is swept again later.
export function createArchiveSweep(calls: ArchiveSweepCalls) {
  const tried = new Set<string>();
  return function sweep(rule: ArchiveRule, now: Date): Promise<void> {
    const due = [...calls.workspaces()].filter((workspace) => !tried.has(workspace.id) && dueForArchive(workspace, rule, now));
    if (due.length === 0) return Promise.resolve();
    for (const workspace of due) tried.add(workspace.id);
    const fresh = calls.fetchWorkspaces().then((records) => reduceWorkspaceInfo(new Map(), { snapshot: records }));
    const runs = due.map((workspace) =>
      fresh
        .then((list) => {
          const current = list.get(workspace.id);
          if (current === undefined || !dueForArchive(current, rule, now)) return void tried.delete(workspace.id);
          return calls.archive(workspace.id).then((result) => {
            if (result.error) calls.log.error(`[morphise] Could not auto-archive ${workspace.name}: ${result.error}`);
            else calls.log.info(`[morphise] Auto-archived ${workspace.name}`);
          });
        })
        .catch((error: unknown) => calls.log.error(`[morphise] Could not auto-archive ${workspace.name}`, error)),
    );
    return Promise.all(runs).then(() => undefined);
  };
}

type WorkspacePage = { entries: unknown[]; pageInfo: { nextCursor: string | null } };

// Every workspace the host lists, page by page: the same list this app subscribes to.
export async function listEveryWorkspace(list: (options: { page: { limit: number; cursor?: string } }) => Promise<WorkspacePage>): Promise<unknown[]> {
  const entries: unknown[] = [];
  let cursor: string | null = null;
  do {
    const page: WorkspacePage = await list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
    entries.push(...page.entries);
    cursor = page.pageInfo.nextCursor;
  } while (cursor);
  return entries;
}
