import { MARK_KEY, readMark, type WorkspaceMark } from "../shared/row-meta";

// Workspace names and projects for surfaces Paseo draws outside the plugin host, such as modals and
// popovers, where Paseo's workspace hooks cannot run. Kept from the same owned workspace list
// subscription as the directory.

export interface PullRequestInfo {
  number: number | null;
  url: string;
  title: string;
  // "draft" and "merged" fold Paseo's flags into one state.
  state: "open" | "draft" | "merged" | "closed";
  checks: "success" | "pending" | "failure" | "none";
  review: "pending" | "approved" | "changes_requested" | null;
}

export interface ServiceInfo {
  name: string;
  port: number | null;
  running: boolean;
  healthy: boolean | null;
  url: string | null;
}

export interface WorkspaceInfo {
  id: string;
  // The workspace's title when set, else its name.
  name: string;
  project: string;
  // The project's id, folder and kind, for starting new workspaces in it.
  projectId: string | null;
  projectRootPath: string | null;
  projectKind: string | null;
  // Not archived and not a background workspace.
  open: boolean;
  background: boolean;
  pinned: boolean;
  // Paseo's raw status and when it began, which a Morphise mark is made against.
  status: string | null;
  statusEnteredAt: string | null;
  lastUsed: string | null;
  // The newest of the last prompt and the last agent activity.
  lastActive: string | null;
  directory: string | null;
  // Git and GitHub state, as Paseo's own sidebar rows and hover card show them.
  branch: string | null;
  // Null when Paseo has not loaded the git state yet: unknown is never read as clean.
  dirty: boolean | null;
  // Commits not pushed to, and not pulled from, the branch's upstream; null without one or unknown.
  ahead: number | null;
  behind: number | null;
  // Whether archiving removes the folder: Paseo deletes the worktrees it created.
  paseoWorktree: boolean | null;
  diff: { additions: number; deletions: number } | null;
  labels: readonly string[];
  pullRequest: PullRequestInfo | null;
  // Long-running services only (scripts of type "service").
  services: readonly ServiceInfo[];
  // Morphise's own Done or Unread mark, kept on the workspace's metadata.
  mark: WorkspaceMark | null;
}

export type WorkspaceList = ReadonlyMap<string, WorkspaceInfo>;

type Change = { snapshot: readonly unknown[] } | { message: { type: string; payload?: unknown } };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

const newest = (left: string | null, right: string | null) => (left === null ? right : right === null ? left : Date.parse(left) >= Date.parse(right) ? left : right);

const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function readPullRequest(value: unknown): PullRequestInfo | null {
  const pr = record(value);
  const url = text(pr?.url);
  if (!pr || !url) return null;
  const raw = String(pr.state ?? "").toLowerCase();
  const state = pr.isMerged === true ? "merged" : pr.isDraft === true ? "draft" : raw === "closed" ? "closed" : "open";
  const checks = ["success", "pending", "failure"].includes(String(pr.checksStatus)) ? (pr.checksStatus as PullRequestInfo["checks"]) : "none";
  const review = ["pending", "approved", "changes_requested"].includes(String(pr.reviewDecision)) ? (pr.reviewDecision as PullRequestInfo["review"]) : null;
  return { number: typeof pr.number === "number" ? pr.number : null, url, title: text(pr.title) ?? "", state, checks, review };
}

function readServices(value: unknown): ServiceInfo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const script = record(item);
    if (!script || script.type !== "service") return [];
    return [{
      name: text(script.scriptName) ?? "service",
      port: typeof script.port === "number" ? script.port : null,
      running: script.lifecycle === "running",
      healthy: script.health === "healthy" ? true : script.health === "unhealthy" ? false : null,
      url: text(script.proxyUrl) ?? text(script.localProxyUrl),
    }];
  });
}

function readWorkspace(value: unknown): WorkspaceInfo | null {
  const workspace = record(value);
  const id = text(workspace?.id);
  if (!workspace || !id) return null;
  const git = record(workspace.gitRuntime);
  const diff = record(workspace.diffStat);
  return {
    id,
    name: text(workspace.title) ?? text(workspace.name) ?? id,
    project: text(workspace.projectDisplayName) ?? "",
    projectId: text(workspace.projectId),
    projectRootPath: text(workspace.projectRootPath),
    projectKind: text(workspace.projectKind),
    open: !workspace.archivingAt && workspace.background !== true && workspace.internal !== true,
    background: workspace.background === true,
    pinned: !!text(workspace.pinnedAt),
    status: text(workspace.status),
    statusEnteredAt: text(workspace.statusEnteredAt),
    lastUsed: text(workspace.lastUserMessageAt) ?? text(workspace.activityAt),
    lastActive: newest(text(workspace.lastUserMessageAt), text(workspace.activityAt)),
    directory: text(workspace.workspaceDirectory),
    branch: text(git?.currentBranch),
    dirty: typeof git?.isDirty === "boolean" ? git.isDirty : null,
    ahead: whole(git?.aheadOfOrigin),
    behind: whole(git?.behindOfOrigin),
    paseoWorktree: typeof git?.isPaseoOwnedWorktree === "boolean" ? git.isPaseoOwnedWorktree : null,
    diff: diff ? { additions: count(diff.additions), deletions: count(diff.deletions) } : null,
    labels: Array.isArray(workspace.labels) ? workspace.labels.filter((label): label is string => typeof label === "string") : [],
    pullRequest: readPullRequest(record(workspace.githubRuntime)?.pullRequest),
    services: readServices(workspace.scripts),
    mark: readMark(record(workspace.metadata)?.[MARK_KEY]),
  };
}

// Same content, so an unchanged update keeps the same map and nothing redraws.
const same = (left: WorkspaceInfo | undefined, right: WorkspaceInfo) => left !== undefined && JSON.stringify(left) === JSON.stringify(right);

export function reduceWorkspaceInfo(current: WorkspaceList, change: Change): WorkspaceList {
  if ("snapshot" in change) {
    const list = new Map<string, WorkspaceInfo>();
    for (const entry of change.snapshot) {
      const info = readWorkspace(entry);
      if (info) list.set(info.id, info);
    }
    return list;
  }
  const payload = record(change.message.payload);
  if (change.message.type !== "workspace_update" || !payload) return current;
  if (payload.kind === "remove" && typeof payload.id === "string") {
    if (!current.has(payload.id)) return current;
    const list = new Map(current);
    list.delete(payload.id);
    return list;
  }
  if (payload.kind !== "upsert") return current;
  const info = readWorkspace(payload.workspace);
  if (!info || same(current.get(info.id), info)) return current;
  return new Map(current).set(info.id, info);
}

// Open workspaces whose name or project contains the search, most recently used first.
export function workspaceChoices(list: WorkspaceList, search: string): WorkspaceInfo[] {
  const query = search.trim().toLowerCase();
  return [...list.values()]
    .filter((workspace) => workspace.open && (!query || `${workspace.name} ${workspace.project}`.toLowerCase().includes(query)))
    .sort((left, right) => (right.lastUsed ?? "").localeCompare(left.lastUsed ?? "") || left.name.localeCompare(right.name));
}
