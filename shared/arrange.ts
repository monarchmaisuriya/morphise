import type { Indicator, Profile } from "./profile";

// How Morphise's sidebar view orders, filters, groups and shortens the workspace list. Paseo's
// `useWorkspaces` hook takes the snapshot-level rules below as its callbacks and returns refs;
// the ref-level rules then order the groups and apply the row limit.

type View = Profile["sidebar"]["view"];

// The snapshot fields these rules read; Paseo's PluginWorkspaceSnapshot satisfies it.
export interface ArrangeWorkspace {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly indicator: Indicator;
  readonly pinnedAt: string | null;
  readonly lastPromptAt: string | null;
  readonly branch: string | null;
  readonly labels: readonly string[];
  readonly projectDisplayName: string;
  readonly project: { readonly key: string };
  readonly archivingAt: string | null;
  readonly background: boolean;
  readonly createdAt: string | null;
  readonly statusEnteredAt: string | null;
  readonly diffStat: { readonly additions: number; readonly deletions: number } | null;
}

export interface Filter {
  // No status chosen means every status.
  statuses: readonly Indicator[];
  search: string;
  // Project keys; none chosen means every project.
  projects?: readonly string[];
  hideDone?: boolean;
  // Only workspaces with uncommitted changed lines.
  changedOnly?: boolean;
  pinnedOnly?: boolean;
}

const changedLines = (workspace: Pick<ArrangeWorkspace, "diffStat">) => (workspace.diffStat ? workspace.diffStat.additions + workspace.diffStat.deletions : 0);

export const STATUS_TITLES: Record<Indicator, string> = {
  needs_input: "Needs permission",
  failed: "Failed",
  running: "Running",
  attention: "Finished, unread",
  done: "Done",
};

export function workspaceName(workspace: Pick<ArrangeWorkspace, "name" | "title">): string {
  return workspace.title ?? workspace.name;
}

export function isVisible(workspace: ArrangeWorkspace): boolean {
  return workspace.archivingAt === null && !workspace.background;
}

// Rows that the row limit never hides: the workspace is waiting on the user or broke.
export function isProtected(workspace: Pick<ArrangeWorkspace, "indicator">): boolean {
  return workspace.indicator === "needs_input" || workspace.indicator === "failed";
}

export function matchesFilter(workspace: ArrangeWorkspace, filter: Filter): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(workspace.indicator)) return false;
  if (filter.projects?.length && !filter.projects.includes(workspace.project.key)) return false;
  if (filter.hideDone && workspace.indicator === "done") return false;
  if (filter.changedOnly && changedLines(workspace) === 0) return false;
  if (filter.pinnedOnly && workspace.pinnedAt === null) return false;
  const query = filter.search.trim().toLowerCase();
  if (query === "") return true;
  return [workspaceName(workspace), workspace.branch ?? "", workspace.projectDisplayName].some((text) => text.toLowerCase().includes(query));
}

type Compare = (left: ArrangeWorkspace, right: ArrangeWorkspace) => number;

// Newest prompt first; never-prompted workspaces last.
const byActivity: Compare = (left, right) => (right.lastPromptAt ?? "").localeCompare(left.lastPromptAt ?? "");
const byName: Compare = (left, right) => workspaceName(left).localeCompare(workspaceName(right));
const byId: Compare = (left, right) => left.id.localeCompare(right.id);
// Newest first; missing times last.
const newest = (pick: (workspace: ArrangeWorkspace) => string | null): Compare => (left, right) => (pick(right) ?? "").localeCompare(pick(left) ?? "");

export function compareWorkspaces(config: View): Compare {
  const rank = new Map(config.statusOrder.map((indicator, index) => [indicator, index]));
  const byStatus: Compare = (left, right) => (rank.get(left.indicator) ?? 0) - (rank.get(right.indicator) ?? 0);
  const byPin: Compare = (left, right) => Number(right.pinnedAt !== null) - Number(left.pinnedAt !== null);
  const primary = {
    status: byStatus,
    activity: byActivity,
    name: byName,
    created: newest((workspace) => workspace.createdAt),
    statusChanged: newest((workspace) => workspace.statusEnteredAt),
    changes: (left: ArrangeWorkspace, right: ArrangeWorkspace) => changedLines(right) - changedLines(left),
  }[config.orderBy];
  const secondary = config.thenBy === "name" ? byName : byActivity;
  // Ties fall back to the newest workspace, as Paseo's own list orders them, then the name.
  const rules = [...(config.pinnedFirst ? [byPin] : []), primary, secondary, newest((workspace) => workspace.createdAt), byName, byId];
  return (left, right) => {
    for (const rule of rules) {
      const result = rule(left, right);
      if (result !== 0) return result;
    }
    return 0;
  };
}

export interface GroupDescriptor {
  key: string;
  title: string;
}

// `none` is drawn as one untitled list and never asks for group keys.
// When a workspace was last used, in calendar days before today.
export const ACTIVITY_GROUPS = ["Today", "Yesterday", "This week", "This month", "Earlier", "Never used"] as const;

// Calendar days between the two local dates, rounded so 23- and 25-hour days count as one.
function daysBetween(earlier: Date, later: Date): number {
  const start = new Date(earlier);
  start.setHours(0, 0, 0, 0);
  const end = new Date(later);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function activityGroup(lastUsed: string | null, now: Date): number {
  if (!lastUsed) return 5;
  const days = daysBetween(new Date(lastUsed), now);
  return days <= 0 ? 0 : days === 1 ? 1 : days < 7 ? 2 : days < 30 ? 3 : 4;
}

export function groupKeys(config: View, workspace: ArrangeWorkspace, now: Date = new Date()): GroupDescriptor | GroupDescriptor[] {
  if (config.groupBy === "activity") {
    // A workspace never prompted counts from when it was created, as its row time does.
    const index = activityGroup(workspace.lastPromptAt ?? workspace.createdAt, now);
    return { key: `activity:${index}`, title: ACTIVITY_GROUPS[index] };
  }
  if (config.groupBy === "status") return { key: `status:${workspace.indicator}`, title: STATUS_TITLES[workspace.indicator] };
  if (config.groupBy === "label") {
    // A workspace without labels would be in no group, and so hidden; give it one.
    if (workspace.labels.length === 0) return { key: "label:", title: "Unlabelled" };
    return workspace.labels.map((label) => ({ key: `label:${label}`, title: label }));
  }
  return { key: `project:${workspace.project.key}`, title: workspace.projectDisplayName };
}

// Paseo returns groups in the order their first workspace appears; status groups instead follow
// the configured status order.
export function orderGroups<Group extends { key: string }>(groups: readonly Group[], config: View): Group[] {
  if (config.groupBy === "activity") return [...groups].sort((left, right) => left.key.localeCompare(right.key));
  if (config.groupBy !== "status") return [...groups];
  const rank = new Map(config.statusOrder.map((indicator, index) => [`status:${indicator}`, index]));
  return [...groups].sort((left, right) => (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0));
}

export function capRows<Ref extends { key: string }>(
  refs: readonly Ref[],
  protectedKeys: ReadonlySet<string>,
  limit: View["rowLimit"],
  expanded: boolean,
): { rows: Ref[]; hidden: number } {
  if (!limit.enabled || expanded) return { rows: [...refs], hidden: 0 };
  // Protected rows always show and count towards the limit; the rest fill what is left, in order.
  let room = Math.max(0, limit.rows - refs.filter((ref) => protectedKeys.has(ref.key)).length);
  const rows: Ref[] = [];
  for (const ref of refs) {
    if (protectedKeys.has(ref.key)) rows.push(ref);
    else if (room > 0) {
      rows.push(ref);
      room--;
    }
  }
  return { rows, hidden: refs.length - rows.length };
}
