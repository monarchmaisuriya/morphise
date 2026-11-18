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

// Archived workspaces never show; background ones only when the view's "Show background" is on.
export function isVisible(workspace: ArrangeWorkspace, showBackground = false): boolean {
  return workspace.archivingAt === null && (showBackground || !workspace.background);
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

// `groups` maps a project key to the user's group for "custom"; before it has loaded, every project is ungrouped.
export const UNGROUPED: GroupDescriptor = { key: "group:", title: "Ungrouped" };

export function groupKeys(config: View, workspace: ArrangeWorkspace, now: Date = new Date(), groups?: ReadonlyMap<string, { id: string; name: string }>): GroupDescriptor | GroupDescriptor[] {
  if (config.groupBy === "custom") {
    const group = groups?.get(workspace.project.key);
    return group ? { key: `group:${group.id}`, title: group.name } : UNGROUPED;
  }
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
// the configured status order, and the user's own groups their saved order (`groupOrder`, group ids), Ungrouped last.
export function orderGroups<Group extends { key: string }>(groups: readonly Group[], config: View, groupOrder: readonly string[] = []): Group[] {
  if (config.groupBy === "activity") return [...groups].sort((left, right) => left.key.localeCompare(right.key));
  if (config.groupBy === "custom") {
    const rank = new Map(groupOrder.map((id, index) => [`group:${id}`, index]));
    const place = (key: string) => rank.get(key) ?? groupOrder.length;
    return [...groups].sort((left, right) => place(left.key) - place(right.key));
  }
  if (config.groupBy !== "status") return [...groups];
  const rank = new Map(config.statusOrder.map((indicator, index) => [`status:${indicator}`, index]));
  return [...groups].sort((left, right) => (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0));
}

// Which heading a group draws, from its key: a chat group from one workspace looks up that workspace's name, a
// project group draws the project's tile, the user's groups their own heading; any other group shows its title.
export type HeadingKind = "workspace" | "project" | "group" | "plain";

export function headingKind(key: string): HeadingKind {
  if (key.startsWith("workspace:")) return "workspace";
  if (key.startsWith("project:")) return "project";
  if (key.startsWith("group:")) return "group";
  return "plain";
}

// A section inside one of the user's groups: one project's workspaces, or one workspace's chats, tagged with its
// "Your groups" lists projects with no workspace to show, so they can be put in a group: every project not `listed`,
// except one with workspaces that are hidden (background ones while "Show background" is off, such as a workers
// project), which stays as hidden as its workspaces.
export function emptyProjectsToList<Project extends { key: string }>(projects: readonly Project[], listed: ReadonlySet<string>, hidden: ReadonlySet<string>): Project[] {
  return projects.filter((project) => !listed.has(project.key) && !hidden.has(project.key));
}

// When a workspace was last used, as the "Last used" grouping reads it: its last prompt, else its creation.
export const lastUsedAt = (workspace: Pick<ArrangeWorkspace, "lastPromptAt" | "createdAt">) => workspace.lastPromptAt ?? workspace.createdAt ?? "";

// Most recently used first.
export const byLastUsed = (left: Pick<ArrangeWorkspace, "lastPromptAt" | "createdAt">, right: Pick<ArrangeWorkspace, "lastPromptAt" | "createdAt">) => lastUsedAt(right).localeCompare(lastUsedAt(left));

// "Your groups" with the most recently used group first: each group ranks by its most recently used project
// (`recentProjects`: project keys, most recent first). Groups with no ranked project keep their saved order after the
// rest, and Ungrouped stays last.
export function orderGroupsByLastUsed<Ref>(nested: readonly NestedGroup<Ref>[], recentProjects: readonly string[]): NestedGroup<Ref>[] {
  const rank = new Map(recentProjects.map((key, index) => [key, index] as const));
  const best = (group: NestedGroup<Ref>) => Math.min(Infinity, ...group.sections.map((section) => rank.get(section.project) ?? Infinity));
  const own = nested.filter((group) => group.groupId !== null);
  const ungrouped = nested.filter((group) => group.groupId === null);
  // Array.prototype.sort is stable, so ties (unranked groups) keep their saved order.
  return [...own.map((group, index) => ({ group, index, best: best(group) })).sort((a, b) => a.best - b.best || a.index - b.index).map((entry) => entry.group), ...ungrouped];
}

// Inside each of the user's groups, the most recently used project first (`recentProjects`: project keys, most recent
// first); projects not ranked keep their saved order after the rest. Ungrouped keeps the view's order. The sort is
// stable, so a project's several sections (one per workspace in the Chats view) stay together and in order.
export function orderProjectsByLastUsed<Ref>(nested: readonly NestedGroup<Ref>[], recentProjects: readonly string[]): NestedGroup<Ref>[] {
  const rank = new Map(recentProjects.map((key, index) => [key, index] as const));
  const of = (section: InnerSection<Ref>) => rank.get(section.project) ?? Infinity;
  return nested.map((group) => (group.groupId === null ? group : { ...group, sections: [...group.sections].sort((left, right) => of(left) - of(right) || 0) }));
}

// project key.
export interface InnerSection<Ref> {
  key: string;
  title: string;
  items: readonly Ref[];
  project: string;
}

export interface NestedGroup<Ref> {
  key: string;
  // Null for Ungrouped.
  groupId: string | null;
  title: string;
  sections: InnerSection<Ref>[];
}

// "Your groups": the view's sections (in its own order) placed under the user's groups, in their saved order, with
// Ungrouped last and left out when empty. Unknown project keys are skipped here and kept in the document.
// `emptyProjects` are projects with no workspace to show; they are listed too (the caller passes none while a filter
// is on), the ungrouped ones after the rest, by name.
export function nestInGroups<Ref>(
  inner: readonly InnerSection<Ref>[],
  groups: readonly { id: string; name: string; projects: readonly string[] }[],
  emptyProjects: readonly { key: string; title: string }[],
): NestedGroup<Ref>[] {
  const empty = emptyProjects.map((project): InnerSection<Ref> => ({ key: `project:${project.key}`, title: project.title, items: [], project: project.key }));
  const grouped = new Set(groups.flatMap((group) => group.projects));
  const nested: NestedGroup<Ref>[] = groups.map((group) => ({
    key: `group:${group.id}`,
    groupId: group.id,
    title: group.name,
    sections: group.projects.flatMap((project) => [...inner, ...empty].filter((section) => section.project === project)),
  }));
  const ungrouped = [
    ...inner.filter((section) => !grouped.has(section.project)),
    ...empty.filter((section) => !grouped.has(section.project)).sort((left, right) => left.title.localeCompare(right.title)),
  ];
  if (ungrouped.length) nested.push({ key: UNGROUPED.key, groupId: null, title: UNGROUPED.title, sections: ungrouped });
  return nested;
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
