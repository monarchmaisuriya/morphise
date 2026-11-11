import { ACTIVITY_GROUPS, activityGroup, type Filter, STATUS_TITLES } from "./arrange";
import type { Indicator, Profile } from "./profile";

// The fields of a Paseo chat (agent) snapshot that decide its status.
export interface ChatStatusFields {
  readonly status: "initializing" | "idle" | "running" | "error" | "closed";
  readonly requiresAttention: boolean;
  readonly attentionReason: "finished" | "error" | "permission" | null;
}

// The same five statuses Paseo shows for workspaces, for one chat.
export function chatIndicator(chat: ChatStatusFields): Indicator {
  // A closed agent has no process left to wait on or fail, whatever attention it last carried.
  if (chat.status === "closed") return "done";
  if (chat.attentionReason === "permission") return "needs_input";
  if (chat.attentionReason === "error" || chat.status === "error") return "failed";
  if (chat.status === "running" || chat.status === "initializing") return "running";
  if (chat.requiresAttention && chat.attentionReason === "finished") return "attention";
  return "done";
}

// Open top-level chats, for automation rules and follow-up titles: a chat that closes leaves
// this set instead of looking finished.
export function isListedChat(chat: { readonly status: ChatStatusFields["status"]; readonly parentAgentId: string | null }): boolean {
  return chat.status !== "closed" && chat.parentAgentId === null;
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
