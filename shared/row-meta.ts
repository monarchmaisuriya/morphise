import type { Indicator, Profile } from "./profile";

// What a sidebar row shows besides its name: the Display "Show" choices with Paseo's defaults,
// the title source, the muted status line, and which chats a workspace lists.

type View = Profile["sidebar"]["view"];

export interface RowShows {
  branch: boolean;
  project: boolean;
  host: boolean;
  pullRequest: boolean;
  checks: boolean;
  services: boolean;
  labels: boolean;
  diff: boolean;
  lastActivity: boolean;
}

// Paseo's own defaults (0.16.0-beta.1 Display menu): host, pull request, services, labels and last
// activity on; branch, project and diff stats off. Checks ride on the pull request.
export function rowShows(view: View): RowShows {
  const show = view.show ?? {};
  return {
    branch: view.details.branch,
    project: view.details.project,
    diff: view.details.diff,
    host: show.host ?? true,
    pullRequest: show.pullRequest ?? true,
    checks: show.checks ?? true,
    services: show.services ?? true,
    labels: show.labels ?? true,
    lastActivity: show.lastActivity ?? true,
  };
}

export function rowTitle(view: View, workspace: { name: string; title: string | null; branch: string | null }): string {
  if (view.titleSource === "branch" && workspace.branch) return workspace.branch;
  return workspace.title ?? workspace.name;
}

export type LineTone = "warning" | "danger" | "muted";

// The muted second line's lead: what needs the user first, then what is happening, then the
// latest chat's title when it says more than the row's own name.
export function statusLine(indicator: Indicator, latestChat: string | null, rowName: string): { text: string; tone: LineTone } | null {
  if (indicator === "needs_input") return { text: "Waiting for your permission", tone: "warning" };
  if (indicator === "failed") return { text: "Failed", tone: "danger" };
  if (indicator === "running") return { text: latestChat && latestChat !== rowName ? `Working · ${latestChat}` : "Working", tone: "muted" };
  if (latestChat && latestChat !== rowName) return { text: latestChat, tone: "muted" };
  return null;
}

export const DEFAULT_CHAT_ROWS = 5;
export const DEFAULT_REMINDER_ROWS = 5;

// The top-level row that holds the open agent: the open chat itself, or the chat an open sub-agent
// sits under when sub-agents are shown. Null when the open agent is not in this workspace's tree,
// so the workspace row keeps the highlight.
export function owningRowKey(tree: { top: readonly { key: string; id: string }[]; children: ReadonlyMap<string, readonly { key: string }[]> }, openKey: string | null, subAgentsShown: boolean): string | null {
  if (openKey === null) return null;
  if (tree.top.some((row) => row.key === openKey)) return openKey;
  if (!subAgentsShown) return null;
  return tree.top.find((row) => tree.children.get(row.id)?.some((child) => child.key === openKey))?.key ?? null;
}

// The chats a workspace lists, latest first: the first `limit`, or all once expanded. The open
// chat always stays listed, so the highlight never points at a hidden row.
export function visibleChats<Ref extends { key: string }>(latestFirst: readonly Ref[], limit: number, expanded: boolean, openKey: string | null): { rows: Ref[]; hidden: number } {
  if (expanded || latestFirst.length <= limit) return { rows: [...latestFirst], hidden: 0 };
  const rows = latestFirst.slice(0, limit);
  const open = openKey === null ? undefined : latestFirst.slice(limit).find((ref) => ref.key === openKey);
  if (open) rows.push(open);
  return { rows, hidden: latestFirst.length - rows.length };
}

// How a workspace lists its chats and their sub-agents: one rule for the rows drawn and for which
// row shows a chat's running work.
export interface ChatListing {
  limit: number;
  subLimit: number;
  // Every sub-agent (up to subLimit), only the open one, or none.
  subAgents: boolean | "open";
  // "hide": a chat with only one sub-agent lists none, even while it is open (its chat row then
  // holds the highlight, see owningRowKey).
  singleSubAgent?: "show" | "hide";
  isExpanded(key: string): boolean;
  // The open chat or sub-agent.
  openKey: string | null;
}

// `openChatKey` is the listed chat holding the open agent (see owningRowKey), kept listed past the limit.
export function listedTopChats<Ref extends { key: string }>(workspaceKey: string, chats: readonly Ref[], listing: ChatListing, openChatKey: string | null) {
  return visibleChats(chats, listing.limit, listing.isExpanded(`chats:${workspaceKey}`), openChatKey);
}

export function listedSubAgents<Ref extends { key: string }>(parentKey: string, subs: readonly Ref[], listing: ChatListing): { rows: Ref[]; hidden: number } {
  if (listing.subAgents === false || (listing.singleSubAgent === "hide" && subs.length === 1)) return { rows: [], hidden: 0 };
  if (listing.subAgents === "open") return { rows: subs.filter((agent) => agent.key === listing.openKey), hidden: 0 };
  return visibleChats(subs, listing.subLimit, listing.isExpanded(`subs:${parentKey}`), listing.openKey);
}

// Every chat and sub-agent row a workspace draws under it.
export function listedChatKeys(workspaceKey: string, tree: { top: readonly { key: string; id: string }[]; children: ReadonlyMap<string, readonly { key: string }[]> }, listing: ChatListing): Set<string> {
  const keys = new Set<string>();
  const openChatKey = owningRowKey(tree, listing.openKey, listing.subAgents !== false) ?? listing.openKey;
  for (const chat of listedTopChats(workspaceKey, tree.top, listing, openChatKey).rows) {
    keys.add(chat.key);
    for (const sub of listedSubAgents(chat.key, tree.children.get(chat.id) ?? [], listing).rows) keys.add(sub.key);
  }
  return keys;
}

// Whether a workspace lists its chats under it: not when it has a single chat, none of whose
// sub-agents would be listed, and the view hides lone chats (the workspace row stands for it).
export function listsChats(single: "show" | "hide" | undefined, chats: readonly { key: string; id: string }[], children: ReadonlyMap<string, readonly { key: string }[]>, listing: ChatListing): boolean {
  if (chats.length === 0) return false;
  if (single !== "hide" || chats.length > 1) return true;
  return listedSubAgents(chats[0].key, children.get(chats[0].id) ?? [], listing).rows.length > 0;
}

// A row's running work is shown by the rows under it when every running chat it covers is drawn
// there: then only those rows pulse, not this one.
export function runningShownBelow(running: readonly { key: string }[], listed: ReadonlySet<string>): boolean {
  return running.length > 0 && running.every((agent) => listed.has(agent.key));
}

// A workspace's chats as a tree: each sub-agent sits under its top-level ancestor (deeper
// sub-agents too); a sub-agent whose parent is not listed here (archived, or in another workspace)
// stands at the top level, so no open sub-agent goes missing. Both keep `latestFirst` order.
export function chatTree<Ref extends { key: string; id: string }>(latestFirst: readonly Ref[], parentOf: ReadonlyMap<string, string | null>): { top: Ref[]; children: Map<string, Ref[]> } {
  const ids = new Set(latestFirst.map((ref) => ref.id));
  const rootOf = (id: string): string => {
    let current = id;
    // Bounded, so a parent loop in bad data cannot hang the view.
    for (let step = 0; step < ids.size; step++) {
      const parent = parentOf.get(current) ?? null;
      if (parent === null || !ids.has(parent)) return current;
      current = parent;
    }
    return current;
  };
  const top: Ref[] = [];
  const children = new Map<string, Ref[]>();
  for (const ref of latestFirst) {
    const root = rootOf(ref.id);
    if (root === ref.id) top.push(ref);
    else {
      const list = children.get(root);
      if (list) list.push(ref);
      else children.set(root, [ref]);
    }
  }
  return { top, children };
}

// `since` is the workspace's statusEnteredAt when the mark was made: the mark holds while that has
// not moved, so any status change ends it, and the host's and the app's clocks never meet.
export type WorkspaceMark = { kind: "done" | "unread"; at: string; since: string | null };

// The workspace metadata key Morphise keeps its own Done and Unread marks under.
export const MARK_KEY = "morphise.mark";

export function readMark(value: unknown): WorkspaceMark | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, at, since } = value as Record<string, unknown>;
  if ((kind !== "done" && kind !== "unread") || typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  if (since !== null && typeof since !== "string") return null;
  return { kind, at, since };
}

// Whether a mark is in force: made against the workspace's current status, which is not one that
// needs the user. A permission request or a failure always shows.
export function markApplies(indicator: Indicator | string, statusEnteredAt: string | null, mark: WorkspaceMark | null): mark is WorkspaceMark {
  return mark !== null && indicator !== "needs_input" && indicator !== "failed" && mark.since === statusEnteredAt;
}

// The status Morphise shows: the mark's while it applies, Paseo's otherwise.
export function effectiveIndicator(indicator: Indicator, statusEnteredAt: string | null, mark: WorkspaceMark | null): Indicator {
  if (!markApplies(indicator, statusEnteredAt, mark)) return indicator;
  return mark.kind === "done" ? "done" : "attention";
}
