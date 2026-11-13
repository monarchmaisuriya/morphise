import { markApplies, type WorkspaceMark } from "./row-meta";

// Which workspaces Morphise archives by itself: those marked done, once the mark is old enough.
// Merged pull requests are Paseo's own setting ("Archive merged PR workspaces"), not repeated here.
// Archiving a Paseo worktree deletes its folder, so the rules follow Paseo's own safe-archive
// checks: git state must be known clean, with nothing unpushed, or the folder must survive.

export interface ArchiveRule {
  // Days since the workspace was marked done.
  days: number;
}

export interface ArchiveCandidate {
  open: boolean;
  pinned: boolean;
  // Paseo's raw status and when it began.
  status: string | null;
  statusEnteredAt: string | null;
  // Null when unknown (git state not loaded yet).
  dirty: boolean | null;
  ahead: number | null;
  paseoWorktree: boolean | null;
  projectKind: string | null;
  mark: WorkspaceMark | null;
}

const DAY = 24 * 60 * 60 * 1000;

// The folder survives archiving (not a Paseo worktree), or it holds no work git could lose.
// An unknown (null) project kind proves nothing, like unknown git state.
function nothingToLose(workspace: ArchiveCandidate): boolean {
  if (workspace.projectKind !== null && workspace.projectKind !== "git" && workspace.paseoWorktree !== true) return true;
  if (workspace.paseoWorktree === false) return true;
  return workspace.dirty === false && workspace.ahead === 0;
}

export function dueForArchive(workspace: ArchiveCandidate, rule: ArchiveRule | null | undefined, now: Date): boolean {
  if (!rule || !workspace.open || workspace.pinned) return false;
  // Only finished work: never running, waiting for permission, or failed.
  if (workspace.status !== "done" && workspace.status !== "attention") return false;
  if (!markApplies(workspace.status, workspace.statusEnteredAt, workspace.mark) || workspace.mark.kind !== "done") return false;
  if (now.getTime() - Date.parse(workspace.mark.at) < rule.days * DAY) return false;
  return nothingToLose(workspace);
}
