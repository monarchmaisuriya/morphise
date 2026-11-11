// Workspace names and projects for surfaces Paseo draws outside the plugin host, such as modals and
// popovers, where Paseo's workspace hooks cannot run. Kept from the same owned workspace list
// subscription as the directory.

export interface WorkspaceInfo {
  id: string;
  // The workspace's title when set, else its name.
  name: string;
  project: string;
  // Not archived and not a background workspace.
  open: boolean;
  lastUsed: string | null;
}

export type WorkspaceList = ReadonlyMap<string, WorkspaceInfo>;

type Change = { snapshot: readonly unknown[] } | { message: { type: string; payload?: unknown } };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

function readWorkspace(value: unknown): WorkspaceInfo | null {
  const workspace = record(value);
  const id = text(workspace?.id);
  if (!workspace || !id) return null;
  return {
    id,
    name: text(workspace.title) ?? text(workspace.name) ?? id,
    project: text(workspace.projectDisplayName) ?? "",
    open: !workspace.archivingAt && workspace.background !== true && workspace.internal !== true,
    lastUsed: text(workspace.lastUserMessageAt) ?? text(workspace.activityAt),
  };
}

const same = (left: WorkspaceInfo | undefined, right: WorkspaceInfo) =>
  left !== undefined && left.name === right.name && left.project === right.project && left.open === right.open && left.lastUsed === right.lastUsed;

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
