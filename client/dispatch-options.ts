import type { Chats } from "./chats";
import type { WorkspaceList } from "./workspaces";

// What the Dispatcher offers, from Morphise's own stores. No React Native here, so tests load it.

export type ProjectInfo = { id: string; name: string; rootPath: string; kind: string };

// Every project a workspace belongs to, by name.
export function projectsOf(list: WorkspaceList): ProjectInfo[] {
  const projects = new Map<string, ProjectInfo>();
  for (const workspace of list.values()) {
    if (!workspace.projectId || !workspace.projectRootPath || projects.has(workspace.projectId)) continue;
    projects.set(workspace.projectId, { id: workspace.projectId, name: workspace.project || workspace.projectRootPath, rootPath: workspace.projectRootPath, kind: workspace.projectKind ?? "directory" });
  }
  return [...projects.values()].sort((left, right) => left.name.localeCompare(right.name));
}

// The provider and model combinations open chats use, the most used first.
export function modelsOf(chats: Chats): string[] {
  const counts = new Map<string, number>();
  for (const chat of chats.values()) if (chat.model.includes("/")) counts.set(chat.model, (counts.get(chat.model) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([model]) => model);
}

// A workspace title from a prompt: its first line, shortened.
export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split("\n")[0].trim();
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}
