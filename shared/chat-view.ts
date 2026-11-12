// How Morphise reshapes chat rows: which rows stay as Paseo draws them, which it hides, and which
// it redraws (tool call cards or lines, thinking cards, the plan card). Pure rules, so both the
// timeline transformers and tests use them. Paseo's own rows are the default for everything.

import { readSteps, type Step } from "./steps";

export const TOOL_KINDS = ["shell", "read", "edit", "search", "fetch", "sub_agent", "other"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_KIND_TITLES: Record<ToolKind, string> = {
  shell: "Commands",
  read: "Reads",
  edit: "Edits",
  search: "Searches",
  fetch: "Fetches",
  sub_agent: "Sub-agents",
  other: "Other",
};

export type ToolStyle = "paseo" | "cards" | "compact";
export type FoldRule = "finished" | "always" | "never";
export type TextSize = "small" | "medium" | "large";
export type Density = "compact" | "normal" | "spacious";

// The chat settings as saved (every key optional, so older versions still read the profile).
export interface ChatSettings {
  toolCalls?: ToolStyle;
  hideFinished?: ToolKind[];
  reasoning?: "show" | "fold" | "hide";
  fold?: FoldRule;
  outputLines?: number;
  textSize?: TextSize;
  density?: Density;
  timestamps?: boolean;
  phones?: "same" | "paseo";
}

// How Morphise's own chat rows look and behave; read by the renderers.
export interface ChatLook {
  fold: FoldRule;
  // Lines of output shown before "Show all"; null shows everything.
  outputLines: number | null;
  textSize: TextSize;
  density: Density;
  timestamps: boolean;
}

export const DEFAULT_OUTPUT_LINES = 12;

export function chatLook(saved: ChatSettings | undefined): ChatLook {
  return {
    fold: saved?.fold ?? "finished",
    outputLines: saved?.outputLines === 0 ? null : saved?.outputLines ?? DEFAULT_OUTPUT_LINES,
    textSize: saved?.textSize ?? "medium",
    density: saved?.density ?? "normal",
    timestamps: saved?.timestamps ?? false,
  };
}

export interface ChatView {
  toolCalls: ToolStyle;
  hideFinished: ReadonlySet<ToolKind>;
  reasoning: "show" | "fold" | "hide";
  // Whole row types hidden in every chat.
  hidden: ReadonlySet<string>;
  // The plan card drawn in the chat (the steps card's "In the chat").
  stepsInChat: boolean;
}

// `onPhone`: this app runs on iOS or Android, where "phones: paseo" leaves the chat to Paseo
// (hidden row types and the plan card still apply, as they are not about looks).
export function chatView(saved: ChatSettings | undefined, hidden: readonly string[], stepsInChat: boolean, onPhone = false): ChatView {
  const paseoHere = onPhone && saved?.phones === "paseo";
  return {
    toolCalls: paseoHere ? "paseo" : saved?.toolCalls ?? "paseo",
    hideFinished: new Set(saved?.hideFinished ?? []),
    reasoning: paseoHere && saved?.reasoning === "fold" ? "show" : saved?.reasoning ?? "show",
    hidden: new Set(hidden),
    stepsInChat,
  };
}

// The row types that need a transformer for this view; the rest stay untouched by Morphise.
export function transformedTypes(view: ChatView): string[] {
  const types = new Set(view.hidden);
  if (view.toolCalls !== "paseo" || view.hideFinished.size) types.add("tool_call");
  if (view.reasoning !== "show") types.add("reasoning");
  if (view.stepsInChat) types.add("todo");
  return [...types];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
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

// Tool calls whose content Morphise's rows show in full (subject, plus output, diff or text when
// opened). Plans, sub-agent tasks (Paseo links them to their chat), worktree setup and unknown
// tools keep Paseo's own rows, which show what Morphise's rows would lose.
const DRAWN_DETAILS = new Set(["shell", "read", "edit", "write", "search", "fetch", "plain_text"]);

export type ToolStatus = "running" | "completed" | "failed" | "canceled";

// How the body reads: plain output, a unified diff, or file content.
export type BodyKind = "output" | "diff" | "content";

// One tool call, cut down to what Morphise's rows show.
export interface ToolSummary {
  kind: ToolKind;
  detail: string;
  name: string;
  // What it ran or acted on: a command, a path, a query, a URL.
  subject: string;
  status: ToolStatus;
  error: string;
  body: string;
  bodyKind: BodyKind;
  // Short facts for the header: "+12 −3", "exit 1", "4 files", "200".
  facts: string[];
}

const BODY_MAX = 40000;

// A file header line of a unified diff ("--- a/x", "+++ b/x", "diff ...", "index ..."); only
// before the first hunk, since a removed "-- comment" or added "++x" line starts the same way.
const isHeader = (line: string) => line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ");

// Lines added and removed in a unified diff (headers not counted).
export function diffCounts(diff: string): { added: number; removed: number } {
  return diffLines(diff).reduce((counts, line) => ({ added: counts.added + (line.kind === "add" ? 1 : 0), removed: counts.removed + (line.kind === "remove" ? 1 : 0) }), { added: 0, removed: 0 });
}

// Lines in a text, not counting the empty one after a final newline.
const lineCount = (value: string) => value.replace(/\r?\n$/, "").split("\n").length;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function seconds(ms: number | null): string | null {
  if (ms === null) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export function summarizeToolCall(item: unknown): ToolSummary | null {
  const call = record(item);
  if (call?.type !== "tool_call") return null;
  const detail = record(call.detail);
  const detailType = text(detail?.type) || "unknown";
  const status: ToolStatus = call.status === "completed" || call.status === "failed" || call.status === "canceled" ? call.status : "running";
  let subject = "";
  let body = "";
  let bodyKind: BodyKind = "output";
  const facts: string[] = [];
  switch (detailType) {
    case "shell": {
      subject = text(detail?.command);
      body = text(detail?.output);
      const exit = num(detail?.exitCode);
      if (exit !== null && exit !== 0) facts.push(`exit ${exit}`);
      break;
    }
    case "read": {
      subject = text(detail?.filePath);
      body = text(detail?.content);
      bodyKind = "content";
      if (body) facts.push(plural(lineCount(body), "line", "lines"));
      break;
    }
    case "edit": {
      subject = text(detail?.filePath);
      const diff = text(detail?.unifiedDiff);
      if (diff) {
        body = diff;
        bodyKind = "diff";
        const { added, removed } = diffCounts(diff);
        facts.push(`+${added} −${removed}`);
      } else {
        // No diff from the provider: old and new text as a diff of whole lines.
        const before = text(detail?.oldString);
        const after = text(detail?.newString);
        if (before || after) {
          body = [...(before ? before.split("\n").map((line) => `-${line}`) : []), ...(after ? after.split("\n").map((line) => `+${line}`) : [])].join("\n");
          bodyKind = "diff";
          const { added, removed } = diffCounts(body);
          facts.push(`+${added} −${removed}`);
        }
      }
      break;
    }
    case "write": {
      subject = text(detail?.filePath);
      body = text(detail?.content);
      bodyKind = "content";
      if (body) facts.push(`+${lineCount(body)}`);
      break;
    }
    case "search": {
      subject = text(detail?.query);
      const paths = Array.isArray(detail?.filePaths) ? (detail.filePaths as unknown[]).filter((path): path is string => typeof path === "string") : [];
      body = paths.length ? paths.join("\n") : text(detail?.content);
      const matches = num(detail?.numMatches);
      const files = num(detail?.numFiles) ?? (paths.length || null);
      if (matches !== null) facts.push(plural(matches, "match", "matches"));
      if (files !== null) facts.push(plural(files, "file", "files"));
      const took = seconds(num(detail?.durationMs) ?? (num(detail?.durationSeconds) !== null ? (num(detail?.durationSeconds) ?? 0) * 1000 : null));
      if (took) facts.push(took);
      break;
    }
    case "fetch": {
      subject = text(detail?.url);
      body = text(detail?.result);
      const code = num(detail?.code);
      if (code !== null) facts.push(String(code));
      const took = seconds(num(detail?.durationMs));
      if (took) facts.push(took);
      break;
    }
    case "plain_text":
      subject = text(detail?.label);
      body = text(detail?.text);
      break;
    case "sub_agent":
      subject = text(detail?.description) || text(detail?.subAgentType);
      break;
    default:
      break;
  }
  const error = status === "failed" ? (typeof call.error === "string" ? call.error : record(call.error) ? text(record(call.error)?.message) || "Failed" : "Failed") : "";
  return { kind: toolKind(detailType), detail: detailType, name: text(call.name) || "Tool", subject: cut(subject.split("\n")[0] ?? "", 300), status, error: cut(error, 2000), body: cut(body, BODY_MAX), bodyKind, facts };
}

// The verb a card leads with.
export function toolVerb(summary: Pick<ToolSummary, "detail" | "status">): string {
  const running = summary.status === "running";
  switch (summary.detail) {
    case "shell":
      return running ? "Running" : "Ran";
    case "read":
      return running ? "Reading" : "Read";
    case "edit":
      return running ? "Editing" : "Edited";
    case "write":
      return running ? "Writing" : "Wrote";
    case "search":
      return running ? "Searching" : "Searched";
    case "fetch":
      return running ? "Fetching" : "Fetched";
    default:
      return "";
  }
}

// Whether a card starts open: failed calls always do; otherwise the fold rule decides.
export function startsOpen(rule: FoldRule, status: ToolStatus): boolean {
  if (status === "failed") return true;
  if (rule === "never") return true;
  if (rule === "always") return false;
  return status === "running";
}

// Long text with its first and last lines kept and the middle counted, for "Show all".
export function foldLines(body: string, keep: number | null): { head: string[]; tail: string[]; hidden: number } {
  const lines = body.replace(/\n+$/, "").split("\n");
  if (keep === null || lines.length <= keep + 2) return { head: lines, tail: [], hidden: 0 };
  const headCount = Math.ceil(keep / 2);
  const tailCount = keep - headCount;
  return { head: lines.slice(0, headCount), tail: tailCount ? lines.slice(-tailCount) : [], hidden: lines.length - headCount - tailCount };
}

// A unified diff as display rows with old and new line numbers (from its hunk headers).
export interface DiffLine {
  kind: "hunk" | "add" | "remove" | "same";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export function diffLines(diff: string): DiffLine[] {
  const rows: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const raw of diff.replace(/\n+$/, "").split("\n")) {
    const line = raw.replace(/\r$/, "");
    // "\ No newline at end of file" describes the line above; it is not a line of the file.
    if (line.startsWith("\\")) continue;
    if (!inHunk && isHeader(line)) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) inHunk = true;
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      rows.push({ kind: "hunk", text: line, oldLine: null, newLine: null });
    } else if (line.startsWith("+")) {
      rows.push({ kind: "add", text: line.slice(1), oldLine: null, newLine: newLine ? newLine++ : null });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "remove", text: line.slice(1), oldLine: oldLine ? oldLine++ : null, newLine: null });
    } else {
      rows.push({ kind: "same", text: line.startsWith(" ") ? line.slice(1) : line, oldLine: oldLine ? oldLine++ : null, newLine: newLine ? newLine++ : null });
    }
  }
  return rows;
}

// What becomes of one row: kept as Paseo draws it, hidden, or redrawn as one of Morphise's rows.
export type RowFate = { kind: "keep" } | { kind: "hide" } | { kind: "tool"; data: ToolSummary & { style: "cards" | "compact" } } | { kind: "thinking"; data: { text: string } } | { kind: "steps"; data: { steps: Step[] } };

export function rowFate(itemType: string, item: unknown, view: ChatView): RowFate {
  if (view.hidden.has(itemType)) return { kind: "hide" };
  if (itemType === "tool_call") {
    const summary = summarizeToolCall(item);
    // A plan written as a tool call is the agent asking to start on it: always Paseo's own row.
    if (!summary || summary.detail === "plan") return { kind: "keep" };
    // Only finished calls hide: running ones show progress, failed ones need the user to see them.
    if (summary.status === "completed" && view.hideFinished.has(summary.kind)) return { kind: "hide" };
    return view.toolCalls !== "paseo" && DRAWN_DETAILS.has(summary.detail) ? { kind: "tool", data: { ...summary, style: view.toolCalls } } : { kind: "keep" };
  }
  if (itemType === "reasoning") {
    if (view.reasoning === "hide") return { kind: "hide" };
    if (view.reasoning === "fold") return { kind: "thinking", data: { text: cut(text(record(item)?.text), 40000) } };
    return { kind: "keep" };
  }
  if (itemType === "todo" && view.stepsInChat) {
    const steps = readSteps(item);
    // An empty plan (the agent cleared it) keeps Paseo's own row.
    return steps && steps.length ? { kind: "steps", data: { steps } } : { kind: "keep" };
  }
  return { kind: "keep" };
}

// ---------- Copy the last turn ----------

// The last turn of a chat (from its last prompt on) as Markdown: the prompt, replies, and one line
// per tool call. Null when the page has no prompt.
export function lastTurnMarkdown(entries: readonly unknown[]): string | null {
  let start = -1;
  for (let index = entries.length - 1; index >= 0; index--) {
    if (record(record(entries[index])?.item)?.type === "user_message") {
      start = index;
      break;
    }
  }
  if (start < 0) return null;
  // As Paseo shows them: a reply streamed in chunks is one reply (chunks joined as they came), and
  // a tool call sent again as it progresses is one call, in its latest state.
  const parts: ({ kind: "prompt" | "reply"; text: string } | { kind: "tool"; callId: string; item: unknown })[] = [];
  for (const entry of entries.slice(start)) {
    const item = record(record(entry)?.item);
    if (!item) continue;
    const last = parts[parts.length - 1];
    if (item.type === "user_message") parts.push({ kind: "prompt", text: text(item.text) });
    else if (item.type === "assistant_message") {
      if (last?.kind === "reply") last.text += text(item.text);
      else parts.push({ kind: "reply", text: text(item.text) });
    } else if (item.type === "tool_call") {
      const callId = text(item.callId);
      const earlier = callId ? parts.find((part) => part.kind === "tool" && part.callId === callId) : undefined;
      if (earlier && earlier.kind === "tool") earlier.item = item;
      else parts.push({ kind: "tool", callId, item });
    }
  }
  return parts
    .map((part) => {
      if (part.kind !== "tool") return part.kind === "prompt" ? `**Prompt**\n\n${part.text.trim()}` : part.text.trim();
      const summary = summarizeToolCall(part.item);
      return summary ? `- ${[toolVerb(summary) || summary.name, summary.subject ? `\`${summary.subject}\`` : "", summary.facts.join(", "), summary.status === "failed" ? "(failed)" : ""].filter(Boolean).join(" ")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
