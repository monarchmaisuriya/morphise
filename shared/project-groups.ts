// "Your groups" in the sidebar view: named groups of projects, their order, and the colours and icons of groups,
// projects and workspaces. Ported from Project Groups by topar12 (MIT, see NOTICE.md), shared/settings.ts and
// client/model.ts at 8515d90. On the daemon, so every app connected to it sees the same groups.
import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const decorationSchema = z.strictObject({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected a colour such as #30A46C").nullable(),
  // A Lucide icon name, or any emoji.
  icon: z.string().regex(/^(lucide:[A-Za-z0-9]{1,40}|emoji:\S.{0,15})$/u, "Expected lucide:<Name> or emoji:<emoji>").nullable(),
});

const groupSchema = z.strictObject({
  id: z.string().regex(/^g[A-Za-z0-9]{1,40}$/),
  name: z.string().trim().min(1, "A group needs a name").max(60),
  // Project keys in their order. Keys of projects not listed right now are kept: the list may still be loading.
  projects: z.array(z.string().min(1).max(300)).max(1000),
});

const decorationMap = z.record(z.string().min(1).max(300), decorationSchema);

export const projectGroupsSchema = z.strictObject({
  groups: z.array(groupSchema).max(100).default([]),
  decorations: z
    .strictObject({ groups: decorationMap.default({}), projects: decorationMap.default({}), workspaces: decorationMap.default({}) })
    .prefault({}),
});

export type ProjectGroups = z.infer<typeof projectGroupsSchema>;
export type Decoration = z.infer<typeof decorationSchema>;
export type DecorationKind = keyof ProjectGroups["decorations"];

export const EMPTY_PROJECT_GROUPS: ProjectGroups = projectGroupsSchema.parse({});

// The choices the colour and icon picker offers (any emoji can be typed as well): mid-tone colours that read as text on
// light and dark sidebars, and Lucide icon names. From Project Groups' client/decor.tsx.
export const DECOR_COLORS = [
  { value: "#E5484D", name: "Red" },
  { value: "#F76B15", name: "Orange" },
  { value: "#D6A100", name: "Yellow" },
  { value: "#30A46C", name: "Green" },
  { value: "#12A594", name: "Teal" },
  { value: "#0090FF", name: "Blue" },
  { value: "#3E63DD", name: "Indigo" },
  { value: "#8E4EC6", name: "Purple" },
  { value: "#D6409F", name: "Pink" },
  { value: "#AD7F58", name: "Brown" },
  { value: "#8B8D98", name: "Gray" },
] as const;

// "#8e4ec6", "8E4EC6" or "#8E4EC6" as the stored form "#8E4EC6"; null when it is not a six-digit hex colour.
export function parseHexColor(text: string): string | null {
  const hex = text.trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : null;
}

export const DECOR_ICONS = [
  "Folder", "FolderGit2", "Code", "Terminal", "Globe", "Server", "Database", "Smartphone", "Monitor", "Package", "Rocket", "FlaskConical",
  "BookOpen", "FileText", "PenTool", "Palette", "Briefcase", "Building2", "House", "Users", "Heart", "Star", "Zap", "Bot",
  "Brain", "GraduationCap", "Shield", "Cloud", "Gamepad2", "Music", "Camera", "Leaf", "Anchor", "Waves", "Flag", "Lightbulb",
] as const;

export const projectGroupsSettings = defineSettings({ id: "project-groups", scope: "host", version: 1, schema: projectGroupsSchema });

// How "Your groups" are ordered (Settings, Sidebar): the group used most recently first (the default), or the order
// the user set by dragging and Move up / Move down. Its own document, so older Morphise versions ignore it.
// `projectsLastUsedFirst`: inside each group, the most recently used project first (off unless asked for). Older
// Morphise versions drop the field when they read the document, so they keep the saved order.
export const groupOrderSettings = defineSettings({ id: "project-group-order", scope: "host", version: 1, schema: z.object({ lastUsedFirst: z.boolean().default(true), projectsLastUsedFirst: z.boolean().default(false) }) });

function indexOfGroup(doc: ProjectGroups, groupId: string): number {
  const index = doc.groups.findIndex((group) => group.id === groupId);
  if (index < 0) throw new Error(`No group has the id "${groupId}"`);
  return index;
}

const clamp = (index: number, length: number) => Math.max(0, Math.min(index, length));

// The id comes from the caller, so a save that is retried after a conflict makes the same group.
export function createGroup(doc: ProjectGroups, groupId: string): ProjectGroups {
  if (doc.groups.some((group) => group.id === groupId)) throw new Error(`A group with the id "${groupId}" already exists`);
  const names = new Set(doc.groups.map((group) => group.name));
  let name = "New group";
  for (let count = 2; names.has(name); count++) name = `New group ${count}`;
  return projectGroupsSchema.parse({ ...doc, groups: [{ id: groupId, name, projects: [] }, ...doc.groups] });
}

export function renameGroup(doc: ProjectGroups, groupId: string, name: string): ProjectGroups {
  const index = indexOfGroup(doc, groupId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A group needs a name");
  return projectGroupsSchema.parse({ ...doc, groups: doc.groups.map((group, at) => (at === index ? { ...group, name: trimmed } : group)) });
}

// Its projects are not removed from Paseo; they show under Ungrouped.
export function deleteGroup(doc: ProjectGroups, groupId: string): ProjectGroups {
  const index = indexOfGroup(doc, groupId);
  const { [groupId]: _removed, ...groups } = doc.decorations.groups;
  return { groups: doc.groups.filter((_, at) => at !== index), decorations: { ...doc.decorations, groups } };
}

// Into a group at `index`, or to Ungrouped (`null`). A project is in one group at most, so it leaves any other.
export function moveProject(doc: ProjectGroups, projectKey: string, groupId: string | null, index: number): ProjectGroups {
  if (groupId !== null) indexOfGroup(doc, groupId);
  const groups = doc.groups.map((group) => {
    const projects = group.projects.filter((key) => key !== projectKey);
    if (group.id !== groupId) return { ...group, projects };
    projects.splice(clamp(index, projects.length), 0, projectKey);
    return { ...group, projects };
  });
  return projectGroupsSchema.parse({ ...doc, groups });
}

export function moveGroup(doc: ProjectGroups, groupId: string, index: number): ProjectGroups {
  const from = indexOfGroup(doc, groupId);
  const groups = [...doc.groups];
  const [moved] = groups.splice(from, 1);
  groups.splice(clamp(index, groups.length), 0, moved as ProjectGroups["groups"][number]);
  return { ...doc, groups };
}

// A drag's drop: into a group (`null` for Ungrouped), before a project (`null` for the end). A project the group has
// not saved (one with no workspace yet, say) counts as the end. Places are counted without the dragged project.
export function dropProject(doc: ProjectGroups, projectKey: string, target: { group: string | null; before: string | null }): ProjectGroups {
  const saved = doc.groups.find((group) => group.id === target.group)?.projects.filter((key) => key !== projectKey) ?? [];
  const at = target.before === null ? -1 : saved.indexOf(target.before);
  return moveProject(doc, projectKey, target.group, at < 0 ? saved.length : at);
}

// A project dropped while projects are ordered by last use: a drop in the group it is already in changes nothing (the
// shown position is not its saved one, so saving it would surprise later); a drop in another group moves it to the end.
export function dropProjectWhileAutoOrdered(doc: ProjectGroups, projectKey: string, group: string | null): ProjectGroups {
  const current = doc.groups.find((entry) => entry.projects.includes(projectKey))?.id ?? null;
  return current === group ? doc : moveProject(doc, projectKey, group, Number.MAX_SAFE_INTEGER);
}

// A group dropped before another (`null`, or Ungrouped, for last).
export function dropGroup(doc: ProjectGroups, groupId: string, before: string | null): ProjectGroups {
  const others = doc.groups.filter((group) => group.id !== groupId);
  const at = before === null ? -1 : others.findIndex((group) => group.id === before);
  return moveGroup(doc, groupId, at < 0 ? others.length : at);
}

// Clearing both colour and icon removes the entry.
export function setDecoration(doc: ProjectGroups, kind: DecorationKind, key: string, decoration: Decoration): ProjectGroups {
  const checked = decorationSchema.parse(decoration);
  const { [key]: _old, ...rest } = doc.decorations[kind];
  const entries = checked.color === null && checked.icon === null ? rest : { ...rest, [key]: checked };
  return projectGroupsSchema.parse({ ...doc, decorations: { ...doc.decorations, [kind]: entries } });
}

// A new group's id: "g", then the time and a random part, in base 36.
export function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// An operation as a change to the document as saved on the daemon, which arrives unparsed.
export function onSaved(operation: (doc: ProjectGroups) => ProjectGroups): (values: unknown) => ProjectGroups {
  return (values) => operation(projectGroupsSchema.parse(values));
}

// Each grouped project's group; a project not in the map is under Ungrouped.
export function projectGroupMap(doc: ProjectGroups): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const group of doc.groups) for (const key of group.projects) map.set(key, { id: group.id, name: group.name });
  return map;
}
