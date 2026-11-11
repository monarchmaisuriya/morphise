// How Morphise reshapes chat rows: which rows stay as Paseo draws them, which it hides, and which
// it redraws (compact tool calls, folded thinking, the plan card). Pure rules, so both the timeline
// transformers and tests use them. Paseo's own rows are the default for everything.

import { readSteps, type Step } from "./steps";

export const TOOL_KINDS = ["shell", "read", "edit", "search", "fetch", "sub_agent", "other"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_KIND_TITLES: Record<ToolKind, string> = {
  shell: "Commands",
  read: "File reads",
  edit: "Edits and new files",
  search: "Searches",
  fetch: "Web fetches",
  sub_agent: "Sub-agent tasks",
  other: "Other tools",
};

// The chat settings as saved (every key optional, so older versions still read the profile).
export interface ChatSettings {
  toolCalls?: "paseo" | "compact";
  hideFinished?: ToolKind[];
  reasoning?: "show" | "fold" | "hide";
}

export interface ChatView {
  toolCalls: "paseo" | "compact";
  hideFinished: ReadonlySet<ToolKind>;
  reasoning: "show" | "fold" | "hide";
  // Whole row types hidden in every chat.
  hidden: ReadonlySet<string>;
  // The plan card drawn in the chat (the steps card's "In the chat").
  stepsInChat: boolean;
}

export function chatView(saved: ChatSettings | undefined, hidden: readonly string[], stepsInChat: boolean): ChatView {
  return {
    toolCalls: saved?.toolCalls ?? "paseo",
    hideFinished: new Set(saved?.hideFinished ?? []),
    reasoning: saved?.reasoning ?? "show",
    hidden: new Set(hidden),
    stepsInChat,
  };
}

// The row types that need a transformer for this view; the rest stay untouched by Morphise.
export function transformedTypes(view: ChatView): string[] {
  const types = new Set(view.hidden);
  if (view.toolCalls === "compact" || view.hideFinished.size) types.add("tool_call");
  if (view.reasoning !== "show") types.add("reasoning");
  if (view.stepsInChat) types.add("todo");
  return [...types];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const cut = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

export function toolKind(detailType: string): ToolKind {
  if (detailType === "shell") return "shell";
  if (detailType === "read") return "read";
  if (detailType === "edit" || detailType === "write") return "edit";
  if (detailType === "search") return "search";
  if (detailType === "fetch") return "fetch";
  if (detailType === "sub_agent") return "sub_agent";
  return "other";
}

// Tool calls whose content a compact row shows in full (subject, plus output, diff or text when
// opened). Plans, sub-agent tasks (Paseo links them to their chat), worktree setup and unknown
// tools keep Paseo's own rows, which show what a compact row would lose.
const COMPACT_DETAILS = new Set(["shell", "read", "edit", "write", "search", "fetch", "plain_text"]);

export type ToolStatus = "running" | "completed" | "failed" | "canceled";

// One tool call, cut down to what a compact row shows and what it reveals when opened.
export interface ToolSummary {
  kind: ToolKind;
  detail: string;
  name: string;
  subject: string;
  status: ToolStatus;
  error: string;
  body: string;
}

const BODY_MAX = 6000;

export function summarizeToolCall(item: unknown): ToolSummary | null {
  const call = record(item);
  if (call?.type !== "tool_call") return null;
  const detail = record(call.detail);
  const detailType = text(detail?.type) || "unknown";
  const status: ToolStatus = call.status === "completed" || call.status === "failed" || call.status === "canceled" ? call.status : "running";
  let subject = "";
  let body = "";
  switch (detailType) {
    case "shell":
      subject = text(detail?.command);
      body = text(detail?.output);
      break;
    case "read":
      subject = text(detail?.filePath);
      break;
    case "edit":
      subject = text(detail?.filePath);
      body = text(detail?.unifiedDiff);
      break;
    case "write":
      subject = text(detail?.filePath);
      body = text(detail?.content);
      break;
    case "search":
      subject = text(detail?.query);
      body = Array.isArray(detail?.filePaths) ? (detail.filePaths as unknown[]).filter((path) => typeof path === "string").join("\n") : text(detail?.content);
      break;
    case "fetch":
      subject = text(detail?.url);
      body = text(detail?.result);
      break;
    case "sub_agent":
      subject = text(detail?.description) || text(detail?.subAgentType);
      body = text(detail?.log);
      break;
    case "plain_text":
      subject = text(detail?.label);
      body = text(detail?.text);
      break;
    default:
      break;
  }
  const error = status === "failed" ? (typeof call.error === "string" ? call.error : record(call.error) ? text(record(call.error)?.message) || "Failed" : "Failed") : "";
  return { kind: toolKind(detailType), detail: detailType, name: text(call.name) || "Tool", subject: cut(subject.split("\n")[0] ?? "", 300), status, error: cut(error, 1000), body: cut(body, BODY_MAX) };
}

// What becomes of one row: kept as Paseo draws it, hidden, or redrawn as one of Morphise's rows.
export type RowFate = { kind: "keep" } | { kind: "hide" } | { kind: "tool"; data: ToolSummary } | { kind: "thinking"; data: { text: string } } | { kind: "steps"; data: { steps: Step[] } };

export function rowFate(itemType: string, item: unknown, view: ChatView): RowFate {
  if (view.hidden.has(itemType)) return { kind: "hide" };
  if (itemType === "tool_call") {
    const summary = summarizeToolCall(item);
    // A plan written as a tool call is the agent asking to start on it: always Paseo's own row.
    if (!summary || summary.detail === "plan") return { kind: "keep" };
    // Only finished calls hide: running ones show progress, failed ones need the user to see them.
    if (summary.status === "completed" && view.hideFinished.has(summary.kind)) return { kind: "hide" };
    return view.toolCalls === "compact" && COMPACT_DETAILS.has(summary.detail) ? { kind: "tool", data: summary } : { kind: "keep" };
  }
  if (itemType === "reasoning") {
    if (view.reasoning === "hide") return { kind: "hide" };
    if (view.reasoning === "fold") return { kind: "thinking", data: { text: cut(text(record(item)?.text), 20000) } };
    return { kind: "keep" };
  }
  if (itemType === "todo" && view.stepsInChat) {
    const steps = readSteps(item);
    // An empty plan (the agent cleared it) keeps Paseo's own row.
    return steps && steps.length ? { kind: "steps", data: { steps } } : { kind: "keep" };
  }
  return { kind: "keep" };
}
