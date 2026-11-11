// The workspaces and agents that header buttons and composer pills attach to, kept from the SDK's
// owned list subscriptions: a snapshot replaces the list, update messages adjust it.

export interface DirectoryAgent {
  id: string;
  workspaceId: string;
}

export interface Directory {
  workspaces: readonly string[];
  agents: readonly DirectoryAgent[];
}

export const EMPTY_DIRECTORY: Directory = { workspaces: [], agents: [] };

interface Message {
  type: string;
  payload?: unknown;
}

type Change<Entry> = { snapshot: readonly Entry[] } | { message: Message };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function idOf(value: unknown): string | null {
  const id = record(value)?.id;
  return typeof id === "string" ? id : null;
}

export function reduceWorkspaces(current: readonly string[], change: Change<{ id: string }>): readonly string[] {
  if ("snapshot" in change) return change.snapshot.map((workspace) => workspace.id);
  if (change.message.type !== "workspace_update") return current;
  const payload = record(change.message.payload);
  if (payload?.kind === "upsert") {
    const id = idOf(payload.workspace);
    return id === null || current.includes(id) ? current : [...current, id];
  }
  if (payload?.kind === "remove" && typeof payload.id === "string") {
    return current.includes(payload.id) ? current.filter((id) => id !== payload.id) : current;
  }
  return current;
}

function agentOf(value: unknown): DirectoryAgent | null {
  const agent = record(value);
  const id = idOf(agent);
  return id !== null && typeof agent?.workspaceId === "string" ? { id, workspaceId: agent.workspaceId } : null;
}

export function reduceAgents(current: readonly DirectoryAgent[], change: Change<{ agent: unknown }>): readonly DirectoryAgent[] {
  if ("snapshot" in change) {
    return change.snapshot.flatMap((entry) => {
      const agent = agentOf(entry.agent);
      return agent ? [agent] : [];
    });
  }
  if (change.message.type !== "agent_update") return current;
  const payload = record(change.message.payload);
  if (payload?.kind === "upsert") {
    const agent = agentOf(payload.agent);
    if (!agent) return current;
    const existing = current.find((item) => item.id === agent.id);
    if (existing?.workspaceId === agent.workspaceId) return current;
    return [...current.filter((item) => item.id !== agent.id), agent];
  }
  if (payload?.kind === "remove" && typeof payload.agentId === "string") {
    return current.some((item) => item.id === payload.agentId) ? current.filter((item) => item.id !== payload.agentId) : current;
  }
  return current;
}
