// Every chat and sub-agent that is waiting on the user, by Paseo's own status rule on each agent:
// a pending permission request, an unseen failure, or a finished turn not yet seen. Answering or
// opening clears it in Paseo, and this list follows. Archived and background agents never appear.

import { chatIndicator, type ChatStatusFields, parentFromLabels } from "../shared/chat-status";
import { type PermissionSummary, summarizePermission } from "../shared/inbox";

export type AttentionReason = "permission" | "failed" | "finished";

export interface AttentionItem {
  id: string;
  title: string;
  workspaceId: string;
  parentAgentId: string | null;
  reason: AttentionReason;
  // When Paseo marked it, else when the chat last changed; empty when Paseo gave neither.
  at: string;
  // When Paseo marked it only; empty when Paseo gave no time. Clearing keys on it.
  attentionAt: string;
  // The newest request still waiting, the one Paseo's own notification names, and how many wait.
  permission: PermissionSummary | null;
  permissionCount: number;
  // Paseo's last error for the chat; empty when it gave none.
  error: string;
}

export type AttentionList = ReadonlyMap<string, AttentionItem>;

type Change = { snapshot: readonly { agent: unknown }[] } | { message: { type: string; payload?: unknown } };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function readAttention(value: unknown): { id: string; item: AttentionItem | null } | null {
  const agent = record(value);
  if (!agent || typeof agent.id !== "string") return null;
  if (agent.archivedAt || agent.background === true) return { id: agent.id, item: null };
  const pending = Array.isArray(agent.pendingPermissions) ? agent.pendingPermissions : [];
  const indicator = chatIndicator({
    status: agent.status as ChatStatusFields["status"],
    requiresAttention: agent.requiresAttention === true,
    attentionReason: (agent.attentionReason ?? null) as ChatStatusFields["attentionReason"],
    pendingPermissionCount: pending.length,
  });
  const reason: AttentionReason | null = indicator === "needs_input" ? "permission" : indicator === "failed" ? "failed" : indicator === "attention" ? "finished" : null;
  if (!reason) return { id: agent.id, item: null };
  return {
    id: agent.id,
    item: {
      id: agent.id,
      title: text(agent.title) || text(agent.provider) || "Chat",
      workspaceId: text(agent.workspaceId),
      parentAgentId: parentFromLabels(agent.labels),
      reason,
      at: text(agent.attentionTimestamp) || text(agent.updatedAt),
      attentionAt: text(agent.attentionTimestamp),
      permission: reason === "permission" ? summarizePermission(pending[pending.length - 1]) : null,
      permissionCount: reason === "permission" ? pending.length : 0,
      error: reason === "failed" ? text(agent.lastError) : "",
    },
  };
}

const same = (left: AttentionItem | undefined, right: AttentionItem) => left !== undefined && JSON.stringify(left) === JSON.stringify(right);

export function reduceAttention(current: AttentionList, change: Change): AttentionList {
  if ("snapshot" in change) {
    const list = new Map<string, AttentionItem>();
    for (const { agent } of change.snapshot) {
      const read = readAttention(agent);
      if (read?.item) list.set(read.id, read.item);
    }
    return list;
  }
  const payload = record(change.message.payload);
  if (change.message.type !== "agent_update" || !payload) return current;
  if (payload.kind === "remove" && typeof payload.agentId === "string") {
    if (!current.has(payload.agentId)) return current;
    const list = new Map(current);
    list.delete(payload.agentId);
    return list;
  }
  if (payload.kind !== "upsert") return current;
  const read = readAttention(payload.agent);
  if (!read) return current;
  if (!read.item) {
    if (!current.has(read.id)) return current;
    const list = new Map(current);
    list.delete(read.id);
    return list;
  }
  if (same(current.get(read.id), read.item)) return current;
  return new Map(current).set(read.id, read.item);
}

// A parent chat's sub-agents that are blocked on the user: waiting for permission or failed.
export function waitingChildren(list: AttentionList, parentAgentId: string): number {
  let count = 0;
  for (const item of list.values()) if (item.parentAgentId === parentAgentId && item.reason !== "finished") count++;
  return count;
}
