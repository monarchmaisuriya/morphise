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

// The top-level chat row that holds the open agent: the open chat itself, or the parent of an open
// sub-agent when sub-agents are listed. Null when neither is among `chats`, or when the open agent
// is closed (closed agents are never listed), so the workspace row keeps the highlight.
export function owningChatKey(chats: readonly { key: string; id: string }[], open: { key: string; parentId: string | null; closed: boolean } | null, subAgentsShown: boolean): string | null {
  if (!open || open.closed) return null;
  if (open.parentId === null) return chats.some((chat) => chat.key === open.key) ? open.key : null;
  if (!subAgentsShown) return null;
  return chats.find((chat) => chat.id === open.parentId)?.key ?? null;
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
