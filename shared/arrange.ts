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
}

export interface Filter {
  // No status chosen means every status.
  statuses: readonly Indicator[];
  search: string;
}

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
  const query = filter.search.trim().toLowerCase();
  if (query === "") return true;
  return [workspaceName(workspace), workspace.branch ?? "", workspace.projectDisplayName].some((text) => text.toLowerCase().includes(query));
}

type Compare = (left: ArrangeWorkspace, right: ArrangeWorkspace) => number;

// Newest prompt first; never-prompted workspaces last.
const byActivity: Compare = (left, right) => (right.lastPromptAt ?? "").localeCompare(left.lastPromptAt ?? "");
const byName: Compare = (left, right) => workspaceName(left).localeCompare(workspaceName(right));
const byId: Compare = (left, right) => left.id.localeCompare(right.id);

export function compareWorkspaces(config: View): Compare {
  const rank = new Map(config.statusOrder.map((indicator, index) => [indicator, index]));
  const byStatus: Compare = (left, right) => (rank.get(left.indicator) ?? 0) - (rank.get(right.indicator) ?? 0);
  const byPin: Compare = (left, right) => Number(right.pinnedAt !== null) - Number(left.pinnedAt !== null);
  const primary = { status: byStatus, activity: byActivity, name: byName }[config.orderBy];
  const secondary = config.thenBy === "name" ? byName : byActivity;
  const rules = [...(config.pinnedFirst ? [byPin] : []), primary, secondary, byName, byId];
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
export function groupKeys(config: View, workspace: ArrangeWorkspace): GroupDescriptor | GroupDescriptor[] {
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
