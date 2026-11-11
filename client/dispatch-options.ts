import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
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

// ---------- Models and modes from Paseo's provider list ----------

export type ModelChoice = { value: string; label: string; provider: string };
export type ModeChoice = { id: string; label: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

// Every model a ready, enabled provider offers, as "provider/model". Models the user's chats use
// come first (most used first), then each provider's default, then the rest by name.
export function modelChoices(entries: readonly unknown[], used: readonly string[]): ModelChoice[] {
  const choices: (ModelChoice & { isDefault: boolean })[] = [];
  for (const raw of entries) {
    const entry = record(raw);
    if (!entry || entry.enabled === false || entry.status !== "ready") continue;
    const provider = text(entry.provider);
    const providerLabel = text(entry.label) || provider;
    for (const rawModel of Array.isArray(entry.models) ? entry.models : []) {
      const model = record(rawModel);
      if (!model || model.isSelectable === false || !text(model.id)) continue;
      choices.push({ value: `${provider}/${text(model.id)}`, label: `${providerLabel} · ${text(model.label) || text(model.id)}`, provider, isDefault: model.isDefault === true });
    }
  }
  const rank = (choice: { value: string }) => {
    const at = used.indexOf(choice.value);
    return at < 0 ? used.length : at;
  };
  return choices
    .sort((left, right) => rank(left) - rank(right) || Number(right.isDefault) - Number(left.isDefault) || left.label.localeCompare(right.label))
    .map(({ value, label, provider }) => ({ value, label, provider }));
}

// A provider's status in the list ("ready", "loading", "error", "unavailable"); null when not listed.
export function providerStatus(entries: readonly unknown[], provider: string): string | null {
  const entry = entries.map(record).find((item) => item && text(item.provider) === provider) ?? null;
  return entry ? text(entry.status) || null : null;
}

// The permission modes a provider offers, and the one it starts in.
export function modeChoices(entries: readonly unknown[], provider: string): { modes: ModeChoice[]; defaultId: string | null } {
  const entry = entries.map(record).find((item) => item && text(item.provider) === provider) ?? null;
  const modes = (Array.isArray(entry?.modes) ? entry.modes : []).flatMap((raw) => {
    const mode = record(raw);
    return mode && text(mode.id) ? [{ id: text(mode.id), label: text(mode.label) || text(mode.id) }] : [];
  });
  const defaultId = text(entry?.defaultModeId) || null;
  return { modes, defaultId: modes.some((mode) => mode.id === defaultId) ? defaultId : null };
}

// A pasted list as separate prompts: paragraphs (split by blank lines), or, for a single paragraph,
// its bullet or numbered lines. Null when the text is one prompt.
export function splitPrompts(input: string): string[] | null {
  const paragraphs = input.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean);
  const item = /^(?:[-*•]|\d+[.)])\s+/;
  if (lines.length > 1 && lines.every((line) => item.test(line))) return lines.map((line) => line.replace(item, "").trim()).filter(Boolean);
  return null;
}

// ---------- Remembered choices ----------

// The Dispatcher's last project, model, mode and isolation, on this device.
export const dispatchSettings = defineSettings({
  id: "dispatch",
  scope: "device",
  version: 1,
  schema: z.object({
    project: z.string().max(300).optional(),
    model: z.string().max(300).optional(),
    mode: z.string().max(200).optional(),
    where: z.enum(["worktree", "local"]).default("worktree"),
  }),
});

export type DispatchSettings = z.infer<typeof dispatchSettings.schema>;
