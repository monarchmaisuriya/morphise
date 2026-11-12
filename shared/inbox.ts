import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// The Inbox's rules: what a waiting permission request asks for, which items a filter shows, and
// which finished items the user cleared. Plain values only, so both the screen and tests use them.

export type InboxReason = "permission" | "failed" | "finished";

// One button the provider offers for its request, as Paseo draws it.
export interface PermissionChoice {
  id: string;
  label: string;
  behavior: "allow" | "deny";
  variant: "primary" | "secondary" | "danger";
}

// A pending permission request, cut down to what the Inbox shows.
export interface PermissionSummary {
  id: string;
  kind: string;
  // The tool asking, such as "Bash" or "Edit".
  tool: string;
  title: string;
  description: string;
  // The one thing it acts on: a command, a file, a URL or a search.
  subject: string;
  // Anything longer worth reading before answering: a plan, a diff, the tool's input.
  body: string;
  choices: PermissionChoice[];
  // Questions need an answer typed in the chat; Allow and Deny cannot answer them.
  answerInChat: boolean;
}

const SUBJECT_MAX = 300;
const BODY_MAX = 4000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

const cut = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

function detailOf(detail: Record<string, unknown> | null): { subject: string; body: string } {
  if (!detail) return { subject: "", body: "" };
  switch (detail.type) {
    case "shell":
      return { subject: text(detail.command), body: "" };
    case "read":
      return { subject: text(detail.filePath), body: "" };
    case "edit":
      return { subject: text(detail.filePath), body: text(detail.unifiedDiff) || [text(detail.oldString), text(detail.newString)].filter(Boolean).join("\n---\n") };
    case "write":
      return { subject: text(detail.filePath), body: text(detail.content) };
    case "search":
      return { subject: text(detail.query), body: "" };
    case "fetch":
      return { subject: text(detail.url), body: text(detail.prompt) };
    case "plan":
      return { subject: "", body: text(detail.text) };
    case "plain_text":
      return { subject: text(detail.label), body: text(detail.text) };
    case "sub_agent":
      return { subject: text(detail.subAgentType), body: text(detail.description) };
    default:
      return { subject: "", body: "" };
  }
}

function inputText(input: unknown): string {
  if (input === undefined || input === null) return "";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return "";
  }
}

// Reads one of Paseo's pending permission requests; null when it is not one.
export function summarizePermission(value: unknown): PermissionSummary | null {
  const request = record(value);
  if (!request || typeof request.id !== "string") return null;
  const kind = text(request.kind) || "other";
  const shown = detailOf(record(request.detail));
  const choices: PermissionChoice[] = [];
  for (const raw of Array.isArray(request.actions) ? request.actions : []) {
    const action = record(raw);
    if (!action || typeof action.id !== "string" || (action.behavior !== "allow" && action.behavior !== "deny")) continue;
    const variant = action.variant === "primary" || action.variant === "danger" ? action.variant : "secondary";
    choices.push({ id: action.id, label: text(action.label) || (action.behavior === "allow" ? "Allow" : "Deny"), behavior: action.behavior, variant });
  }
  return {
    id: request.id,
    kind,
    tool: text(request.name),
    title: text(request.title),
    description: text(request.description),
    subject: cut(shown.subject, SUBJECT_MAX),
    body: cut(shown.body || (shown.subject ? "" : inputText(request.input)), BODY_MAX),
    choices,
    answerInChat: kind === "question",
  };
}

// The one line a row shows under its title.
export function previewLine(item: { reason: InboxReason; permission: PermissionSummary | null; error: string }): string {
  if (item.reason === "permission") {
    const request = item.permission;
    if (!request) return "Waiting for your permission";
    if (request.answerInChat) return request.title || request.description || "Asks you a question";
    const what = request.subject || request.title || request.description;
    return what ? `${request.tool || "Tool"}: ${what}` : `Wants to use ${request.tool || "a tool"}`;
  }
  if (item.reason === "failed") return item.error ? item.error.split("\n")[0] : "Stopped with an error";
  return "Finished";
}

// ---------- Filtering, grouping and clearing ----------

export type InboxFilter = "all" | InboxReason;

export interface InboxEntry {
  id: string;
  title: string;
  reason: InboxReason;
  at: string;
  attentionAt: string;
  workspace: string;
}

type Clearable = { id: string; reason: InboxReason; attentionAt: string };

// A finished item stays cleared until the chat finishes again: Paseo marks it with a new time then.
// Without Paseo's time there is nothing to tell one finish from the next, so it cannot be cleared.
export const canClear = (entry: Clearable) => entry.reason === "finished" && entry.attentionAt !== "";

export const clearKey = (entry: { id: string; attentionAt: string }) => `${entry.id}@${entry.attentionAt}`;

export function isCleared(entry: Clearable, cleared: ReadonlySet<string>): boolean {
  return canClear(entry) && cleared.has(clearKey(entry));
}

const ORDER: Record<InboxReason, number> = { permission: 0, failed: 1, finished: 2 };

// Newest first within a reason; reasons in order of urgency.
export function compareEntries(left: InboxEntry, right: InboxEntry): number {
  return ORDER[left.reason] - ORDER[right.reason] || right.at.localeCompare(left.at) || left.title.localeCompare(right.title);
}

// What a filter and a search leave, and how many of each reason there are before the reason filter.
export function inboxView<Entry extends InboxEntry>(entries: readonly Entry[], options: { filter: InboxFilter; search: string; cleared: ReadonlySet<string> }) {
  const words = options.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = entries
    .filter((entry) => !isCleared(entry, options.cleared))
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.workspace}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  const counts: Record<InboxFilter, number> = { all: matching.length, permission: 0, failed: 0, finished: 0 };
  for (const entry of matching) counts[entry.reason]++;
  const shown = matching.filter((entry) => options.filter === "all" || entry.reason === options.filter).sort(compareEntries);
  return { shown, counts };
}

// After the selected item leaves the list (answered, sent, cleared), the one now in its place.
export function nextSelection(before: readonly { id: string }[], after: readonly { id: string }[], selected: string | null): string | null {
  if (selected && after.some((entry) => entry.id === selected)) return selected;
  if (!after.length) return null;
  const index = selected ? before.findIndex((entry) => entry.id === selected) : -1;
  if (index < 0) return after[0].id;
  for (let at = index + 1; at < before.length; at++) {
    if (after.some((entry) => entry.id === before[at].id)) return before[at].id;
  }
  for (let at = index - 1; at >= 0; at--) {
    if (after.some((entry) => entry.id === before[at].id)) return before[at].id;
  }
  return after[0].id;
}

const MAX_CLEARED = 300;

// Keeps only keys of items still waiting, so the list cannot grow without end.
export function withCleared(cleared: readonly string[], add: readonly string[], live: ReadonlySet<string>): string[] {
  return [...new Set([...cleared, ...add])].filter((key) => live.has(key)).slice(-MAX_CLEARED);
}

// How the Inbox looks on this device: grouping, the finished items cleared from it, and which lines a
// card shows. Keys added since version 1 default when missing, so older saved settings still read.
export const inboxSettings = defineSettings({
  id: "inbox",
  scope: "device",
  version: 1,
  schema: z.object({
    // No longer read (the list always groups by status); kept so older versions read the settings.
    group: z.enum(["reason", "workspace"]).default("reason"),
    cleared: z.array(z.string().max(400)).max(MAX_CLEARED).default([]),
    // The workspace a card's chat is in.
    cardWorkspace: z.boolean().default(true),
    // What it waits on: the request or the error.
    cardPreview: z.boolean().default(true),
  }),
});

export type InboxSettings = z.infer<typeof inboxSettings.schema>;
