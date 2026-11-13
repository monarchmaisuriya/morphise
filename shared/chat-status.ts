import { ACTIVITY_GROUPS, activityGroup, type Filter, STATUS_TITLES } from "./arrange";
import type { Indicator, Profile } from "./profile";

// The fields of a Paseo chat (agent) snapshot that decide its status.
export interface ChatStatusFields {
  readonly status: "initializing" | "idle" | "running" | "error" | "closed";
  readonly requiresAttention: boolean;
  readonly attentionReason: "finished" | "error" | "permission" | null;
  // Open permission requests. Daemon agent records carry them; Paseo's plugin snapshots do not, so
  // views reading snapshots take the permission state from the attention store.
  readonly pendingPermissionCount?: number;
}

// The same five statuses Paseo shows for workspaces, for one chat, by Paseo's own rule
// (protocol agent-state-bucket.ts): a pending permission request waits on the user; an error
// counts as failed only until it is seen, like a finished turn.
export function chatIndicator(chat: ChatStatusFields): Indicator {
  if ((chat.pendingPermissionCount ?? 0) > 0 || chat.attentionReason === "permission") return "needs_input";
  if (chat.requiresAttention && chat.attentionReason === "error") return "failed";
  if (chat.status === "running" || chat.status === "initializing") return "running";
  if (chat.requiresAttention) return "attention";
  return "done";
}

// Daemon agent records keep a sub-agent's parent in a label, as Paseo writes it (protocol
// agent-labels.ts); Paseo's plugin snapshots resolve it into `parentAgentId` already.
export const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

export function parentFromLabels(labels: unknown): string | null {
  const value = typeof labels === "object" && labels !== null ? (labels as Record<string, unknown>)[PARENT_AGENT_ID_LABEL] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Chats the sidebar lists: every top-level chat Paseo gives plugins, closed ones too. Paseo leaves
// archived agents out of that list; "closed" only means the agent process stopped, and its tab
// can still be open.
export function isSidebarChat(chat: { readonly parentAgentId: string | null }): boolean {
  return chat.parentAgentId === null;
}

type View = Profile["sidebar"]["view"];

// The chat fields the Chats list uses.
export interface ListedChat extends ChatStatusFields {
  readonly id: string;
  readonly title: string | null;
  readonly provider: string;
  readonly workspaceId: string;
  readonly lastActivityAt: string;
}

export const chatName = (chat: Pick<ListedChat, "title" | "provider">) => chat.title ?? chat.provider;

export function chatMatches(chat: ListedChat, filter: Filter): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(chatIndicator(chat))) return false;
  if (filter.hideDone && chatIndicator(chat) === "done") return false;
  const query = filter.search.trim().toLowerCase();
  return query === "" || chatName(chat).toLowerCase().includes(query);
}

export function compareChats(config: View) {
  const rank = new Map(config.statusOrder.map((indicator, index) => [indicator, index]));
  const byStatus = (left: ListedChat, right: ListedChat) => (rank.get(chatIndicator(left)) ?? 0) - (rank.get(chatIndicator(right)) ?? 0);
  const byActivity = (left: ListedChat, right: ListedChat) => right.lastActivityAt.localeCompare(left.lastActivityAt);
  const byName = (left: ListedChat, right: ListedChat) => chatName(left).localeCompare(chatName(right));
  // Chats carry no creation or diff data here; those orders fall back to recent activity.
  const primary = { status: byStatus, activity: byActivity, name: byName, created: byActivity, statusChanged: byActivity, changes: byActivity }[config.orderBy];
  const rules = [primary, config.thenBy === "name" ? byName : byActivity, (left: ListedChat, right: ListedChat) => left.id.localeCompare(right.id)];
  return (left: ListedChat, right: ListedChat) => {
    for (const rule of rules) {
      const result = rule(left, right);
      if (result !== 0) return result;
    }
    return 0;
  };
}

// Chats have no project or label of their own, so those groupings group by workspace; the
// heading looks up the workspace's name, so the title here is only the workspace id.
export function chatGroupKey(config: View, chat: ListedChat): { key: string; title: string } {
  if (config.groupBy === "status") {
    const indicator: Indicator = chatIndicator(chat);
    return { key: `status:${indicator}`, title: STATUS_TITLES[indicator] };
  }
  if (config.groupBy === "activity") {
    const index = activityGroup(chat.lastActivityAt, new Date());
    return { key: `activity:${index}`, title: ACTIVITY_GROUPS[index] };
  }
  return { key: `workspace:${chat.workspaceId}`, title: chat.workspaceId };
}
