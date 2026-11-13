// How Morphise reshapes chat rows: which rows stay as Paseo draws them, which it hides, and which
// it redraws in Chat Polish's design (tool calls, thoughts, merged steps, plans, todo updates,
// notices). Pure rules, so both the timeline transformers and tests use them. Paseo's own rows are
// the default for everything.

import { readSteps, type Step } from "./steps";
import type { PolishSettings } from "./polish/prefs";

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

export type Reasoning = "show" | "fold" | "expand" | "hide";
export type Strength = "full" | "soft" | "faded" | "dim";
// The last five follow Better Paseo's presets (see NOTICE.md).
export const ACCENTS = { jade: "#3fb68b", violet: "#8b7cf6", amber: "#d9a23b", rose: "#e0607e", zinc: "#808080", midnight: "#4a6ba8", claude: "#d97757", ghostty: "#8caaee", black: "#000000" } as const;
export type FoldKind = ToolKind | "thinking";
export const FOLD_KINDS: readonly FoldKind[] = [...TOOL_KINDS, "thinking"];

// The chat settings as saved (every key optional, so older versions still read the profile).
export interface ChatSettings {
  // Off: Morphise draws no chat rows (hiding rows still applies).
  enabled?: boolean;
  toolCalls?: ToolStyle;
  hideFinished?: ToolKind[];
  reasoning?: Reasoning;
  fold?: FoldRule;
  // The fold rule for one kind of row, over `fold`.
  foldByKind?: Partial<Record<FoldKind, FoldRule>>;
  // Rows whose details are at most this many lines stay open; 0 folds every row by its rule.
  foldMinLines?: number;
  outputLines?: number;
  codeLines?: number;
  wrap?: boolean;
  labels?: "icon" | "label" | "both";
  paths?: "relative" | "absolute";
  commandColors?: boolean;
  strength?: Strength;
  accent?: string;
  textSize?: TextSize;
  codeSize?: TextSize;
  density?: Density;
  timestamps?: boolean;
  notices?: boolean;
  images?: boolean;
  recap?: boolean;
  phones?: "same" | "paseo";
  polish?: PolishSettings;
  web?: ChatWebSettings;
}

// Web and desktop only: styles Paseo's own prompts and replies through its page structure, without
// redrawing them (so Fork and Copy stay). May break when Paseo changes its page.
export interface ChatWebSettings {
  replySize?: number;
  replyLineHeight?: number;
  boldColor?: string;
  linkStyle?: "paseo" | "dashed";
  clampPrompts?: number;
  uiFont?: string;
  codeFont?: string;
}

// How Morphise's own chat rows look and behave; read by the renderers.
export interface ChatLook {
  fold: FoldRule;
  foldByKind: Partial<Record<FoldKind, FoldRule>>;
  foldMinLines: number;
  // Lines of terminal output, and of code and diffs, shown before "Show all"; null shows all.
  outputLines: number | null;
  codeLines: number | null;
  wrap: boolean;
  labels: "icon" | "label" | "both";
  paths: "relative" | "absolute";
  commandColors: boolean;
  strength: Strength;
  // A colour for icons, the running mark and highlights; null follows the theme.
  accent: string | null;
  textSize: TextSize;
  codeSize: TextSize;
  // Exact sizes in px over the steps above; null follows them.
  textPx: number | null;
  codePx: number | null;
  density: Density;
  timestamps: boolean;
  images: boolean;
  reasoning: Reasoning;
}

export const DEFAULT_OUTPUT_LINES = 12;
export const DEFAULT_CODE_LINES = 30;

const lines = (value: number | undefined, fallback: number) => (value === 0 ? null : value ?? fallback);

export function accentColor(value: string | undefined): string | null {
  if (!value || value === "theme") return null;
  if (value in ACCENTS) return ACCENTS[value as keyof typeof ACCENTS];
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

export function chatLook(saved: ChatSettings | undefined): ChatLook {
  return {
    fold: saved?.fold ?? "finished",
    foldByKind: saved?.foldByKind ?? {},
    foldMinLines: saved?.foldMinLines ?? 0,
    outputLines: lines(saved?.outputLines, DEFAULT_OUTPUT_LINES),
    // 0.14 had one limit for all output; its "show all" (0) still applies to code until code gets its own.
    codeLines: lines(saved?.codeLines ?? (saved?.outputLines === 0 ? 0 : undefined), DEFAULT_CODE_LINES),
    wrap: saved?.wrap ?? true,
    labels: saved?.labels ?? "both",
    paths: saved?.paths ?? "relative",
    commandColors: saved?.commandColors ?? true,
    strength: saved?.strength ?? "full",
    accent: accentColor(saved?.accent),
    textSize: saved?.textSize ?? "medium",
    codeSize: saved?.codeSize ?? saved?.textSize ?? "medium",
    textPx: saved?.polish?.textPx ?? null,
    codePx: saved?.polish?.codePx ?? null,
    density: saved?.density ?? "normal",
    timestamps: saved?.timestamps ?? false,
    images: saved?.images ?? true,
    reasoning: saved?.reasoning ?? "show",
  };
}

// The settings after picking a line limit (0 shows all). A limit is stored only when it differs from what the setting falls back to
// unset, so a code limit picked while output shows all is stored even at 30. Unset code lines fall back on the output limit, so a change
// to that pins the code limit where it shows.
export function withLineLimit(saved: ChatSettings | undefined, key: "outputLines" | "codeLines", value: number): ChatSettings {
  const before = chatLook(saved);
  const next: ChatSettings = { ...saved };
  const fallback = chatLook({ ...saved, [key]: undefined })[key] ?? 0;
  if (value === fallback) delete next[key];
  else next[key] = value;
  const other = key === "outputLines" ? "codeLines" : "outputLines";
  if ((chatLook(next)[other] ?? 0) !== (before[other] ?? 0)) next[other] = before[other] ?? 0;
  return next;
}

export interface ChatView {
  // Morphise draws rows here: on, and not a phone set to Paseo's rows. Hiding applies either way.
  draw: boolean;
  toolCalls: ToolStyle;
  // Thoughts and tool calls between two replies folded into one row (only with Morphise's tool rows).
  merge: boolean;
  hideFinished: ReadonlySet<ToolKind>;
  reasoning: Reasoning;
  // Errors, notices and compaction drawn as Morphise rows.
  notices: boolean;
  // Image-only replies as thumbnails, and pages agents draw (the media and page parts' rows).
  images: boolean;
  pages: boolean;
  // Whole row types hidden in every chat.
  hidden: ReadonlySet<string>;
  // The plan card drawn in the chat (the steps card's "In the chat").
  stepsInChat: boolean;
}

// `onPhone`: this app runs on iOS or Android, where "phones: paseo" leaves the chat to Paseo
// (hidden row types and the plan card still apply, as they are not about looks).
export function chatView(saved: ChatSettings | undefined, hidden: readonly string[], stepsInChat: boolean, onPhone = false): ChatView {
  // Off, or on a phone set to Paseo's rows: Morphise draws nothing, though hiding still applies.
  const draw = !(saved?.enabled === false || (onPhone && saved?.phones === "paseo"));
  const reasoning = saved?.reasoning ?? "show";
  const toolCalls = draw ? saved?.toolCalls ?? "paseo" : "paseo";
  return {
    draw,
    toolCalls,
    merge: toolCalls !== "paseo" && saved?.polish?.merge !== false,
    hideFinished: new Set(saved?.hideFinished ?? []),
    reasoning: !draw && (reasoning === "fold" || reasoning === "expand") ? "show" : reasoning,
    notices: draw && saved?.notices === true,
    images: draw && (saved?.polish?.images ?? "native") !== "native",
    // While Morphise draws tool rows, pages already in a chat keep drawing as pages after the option
    // (which only gives new agents the tool) is turned off, instead of as a tool row of raw HTML.
    // With Paseo's own rows and the option off, nothing is transformed.
    pages: draw && (toolCalls !== "paseo" || saved?.polish?.html === true),
    hidden: new Set(hidden),
    stepsInChat,
  };
}

// The row types that need a transformer for this view; the rest stay untouched by Morphise.
export function transformedTypes(view: ChatView): string[] {
  const types = new Set(view.hidden);
  if (view.toolCalls !== "paseo" || view.hideFinished.size || view.pages) types.add("tool_call");
  if (view.reasoning !== "show" || view.merge) types.add("reasoning");
  // Replies fold into merged steps under Paseo's Collapse turns.
  if (view.images || view.merge) types.add("assistant_message");
  if (view.notices) for (const type of NOTICE_TYPES) types.add(type);
  if (view.stepsInChat || view.toolCalls !== "paseo") types.add("todo");
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

// An MCP tool's name ("mcp__acme-codebase__search_code") as its service and a readable action
// ("acme-codebase", "Search code"); null for other tool names.
export function mcpName(name: string): { service: string; action: string } | null {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!match) return null;
  const words = match[2].replace(/[_-]+/g, " ").trim();
  return { service: match[1], action: words.charAt(0).toUpperCase() + words.slice(1) };
}

function json(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export type ToolStatus = "running" | "completed" | "failed" | "canceled";

// How the body reads: plain output, a unified diff, or file content.
export type BodyKind = "output" | "diff" | "content";

// One tool call, cut down to what Morphise's rows show.
export interface ToolSummary {
  kind: ToolKind;
  detail: string;
  name: string;
  // What it ran or acted on: a command, a path, a query, a URL (first line, cut to 300 characters).
  subject: string;
  // For file tools, the whole path, so file actions never act on a cut one.
  path?: string;
  // For edits and writes, lines added and removed, counted before the body is cut.
  lines?: { added: number; removed: number };
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
  let lines: ToolSummary["lines"];
  const facts: string[] = [];
  switch (detailType) {
    case "shell": {
      subject = text(detail?.command);
      body = text(detail?.output);
      const exit = num(detail?.exitCode);
      if (exit !== null && exit !== 0) facts.push(`exit ${exit}`);
      else if (status === "completed") facts.push(body.trim() ? plural(lineCount(body), "line", "lines") : "no output");
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
        lines = diffCounts(diff);
        facts.push(`+${lines.added} −${lines.removed}`);
      } else {
        // No diff from the provider: old and new text as a diff of whole lines.
        const before = text(detail?.oldString);
        const after = text(detail?.newString);
        if (before || after) {
          body = [...(before ? before.split("\n").map((line) => `-${line}`) : []), ...(after ? after.split("\n").map((line) => `+${line}`) : [])].join("\n");
          bodyKind = "diff";
          lines = diffCounts(body);
          facts.push(`+${lines.added} −${lines.removed}`);
        }
      }
      break;
    }
    case "write": {
      subject = text(detail?.filePath);
      body = text(detail?.content);
      bodyKind = "content";
      lines = { added: body ? lineCount(body) : 0, removed: 0 };
      if (body) facts.push(`+${lines.added}`);
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
    case "unknown": {
      // MCP and other tools Paseo knows nothing about: the input, then the result, as JSON.
      const mcp = mcpName(text(call.name));
      subject = mcp ? mcp.service : "";
      const input = json(detail?.input);
      const output = json(detail?.output);
      body = [input && `Input\n${input}`, output && `Result\n${output}`].filter(Boolean).join("\n\n");
      break;
    }
    default:
      break;
  }
  const error = status === "failed" ? (typeof call.error === "string" ? call.error : record(call.error) ? text(record(call.error)?.message) || "Failed" : "Failed") : "";
  // An edit that failed changed nothing.
  if (status === "failed" && (detailType === "edit" || detailType === "write")) facts.unshift("Not applied");
  const firstLine = subject.split("\n")[0] ?? "";
  const file = detailType === "read" || detailType === "edit" || detailType === "write";
  return { kind: toolKind(detailType), detail: detailType, name: text(call.name) || "Tool", subject: cut(firstLine, 300), ...(file ? { path: firstLine } : {}), ...(lines ? { lines } : {}), status, error: cut(error, 2000), body: cut(body, BODY_MAX), bodyKind, facts };
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

export const NOTICE_TYPES = ["error", "notification", "compaction"] as const;

const normalName = (name: unknown) => text(name).trim().replace(/[.\s-]+/g, "_").toLowerCase();

// A message from another agent or a scheduled heartbeat, sent as a tool call. Paseo starts a turn
// at it (from 0.14 it shows an agent's message as a prompt), so it is never a step.
export function isTurnTrigger(item: unknown): boolean {
  const call = record(item);
  return call?.type === "tool_call" && (call.agentMessage !== undefined || normalName(call.name) === "agent_message" || normalName(call.name) === "heartbeat");
}

// What becomes of one row: kept as Paseo draws it, hidden, or redrawn as one of Morphise's rows.
// A step (thought, tool call, reply) may fold into a merged row; on its own it is drawn as `alone`.
export type RowFate =
  | { kind: "keep" }
  | { kind: "hide" }
  | { kind: "step"; alone: "tool" | "thought" | "keep" }
  | { kind: "plan" }
  | { kind: "agent-event" }
  | { kind: "todo" }
  | { kind: "notice" }
  | { kind: "steps"; data: { steps: Step[] } };

export function rowFate(itemType: string, item: unknown, view: ChatView): RowFate {
  if (view.hidden.has(itemType)) return { kind: "hide" };
  const tools = view.toolCalls !== "paseo";
  if (itemType === "tool_call") {
    const call = record(item);
    const detail = text(record(call?.detail)?.type);
    // Another agent's notice (finished, errored...) reads as a row; its message stays Paseo's prompt.
    if (isTurnTrigger(item)) return tools ? { kind: "agent-event" } : { kind: "keep" };
    // Like Paseo: the approval card shows a pending plan, so the call stays out until it is resolved
    // (Paseo then renames it plan_approval). A plan is never hidden as a finished call.
    if (tools && (call?.name === "ExitPlanMode" || (call?.name === "plan_approval" && call.status === "running"))) return { kind: "hide" };
    if (detail === "plan") return tools ? { kind: "plan" } : { kind: "keep" };
    // Only finished calls hide: running ones show progress, failed ones need the user to see them.
    if (call?.status === "completed" && view.hideFinished.has(toolKind(detail))) return { kind: "hide" };
    if (!tools) return { kind: "keep" };
    // Paseo's sub-agent row links to the sub-agent's chat.
    if (detail === "sub_agent") return { kind: "keep" };
    return { kind: "step", alone: "tool" };
  }
  if (itemType === "reasoning") {
    if (view.reasoning === "hide") return { kind: "hide" };
    const alone = view.reasoning === "fold" || view.reasoning === "expand" ? "thought" : "keep";
    return view.merge || alone === "thought" ? { kind: "step", alone } : { kind: "keep" };
  }
  if (itemType === "assistant_message") return view.draw ? { kind: "step", alone: "keep" } : { kind: "keep" };
  if (view.notices && (NOTICE_TYPES as readonly string[]).includes(itemType)) return { kind: "notice" };
  if (itemType === "todo") {
    if (view.stepsInChat) {
      const steps = readSteps(item);
      // An empty plan (the agent cleared it) keeps Paseo's own row.
      return steps && steps.length ? { kind: "steps", data: { steps } } : { kind: "keep" };
    }
    return tools ? { kind: "todo" } : { kind: "keep" };
  }
  return { kind: "keep" };
}

// Whether a step leaves merged runs: hidden by the settings, or (todo updates) drawn as the steps
// card instead.
export function skippedStep(item: unknown, view: ChatView): boolean {
  const type = text(record(item)?.type);
  if (type === "todo" && view.stepsInChat) return false;
  return rowFate(type, item, view).kind === "hide";
}

/** Whether an item is drawn as a row of its own between merged steps: a plan update, while the steps card shows in the chat. */
export function breaksSteps(item: unknown, view: ChatView): boolean {
  return view.stepsInChat && text(record(item)?.type) === "todo";
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

// ---------- Helpers for drawing rows ----------

// Whether a row starts open: failed calls do (unless `failedOpen` is off); rows whose details are
// short (at most `foldMinLines`) too; otherwise the rule for its kind, else the general rule.
export function rowStartsOpen(look: Pick<ChatLook, "fold" | "foldByKind" | "foldMinLines">, kind: FoldKind, status: ToolStatus, detailLines: number, failedOpen = true): boolean {
  if (status === "failed") {
    if (failedOpen) return true;
    status = "completed";
  }
  if (look.foldMinLines > 0 && detailLines > 0 && detailLines <= look.foldMinLines) return true;
  return startsOpen(look.foldByKind[kind] ?? look.fold, status);
}

// Whether a thought starts open: "expand" always, "fold" while it streams (or by the thinking fold
// rule), and "show" (a thought inside merged steps) as Paseo's Always expand reasoning.
export function thinkingStartsOpen(look: Pick<ChatLook, "fold" | "foldByKind" | "foldMinLines" | "reasoning">, streaming: boolean, paseoExpands: boolean): boolean {
  if (look.reasoning === "expand") return true;
  if (look.reasoning === "fold") return rowStartsOpen(look, "thinking", streaming ? "running" : "completed", 0);
  return paseoExpands;
}

// A thought's first line of words as plain text, for its folded row: code fences and empty lines
// passed over, Markdown marks (headings, quotes, list bullets, emphasis, code, links) dropped.
export function thoughtFirstLine(text: string): string {
  for (const raw of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) continue;
    const line = raw
      .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)+/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(?<![\w*~`])(\*\*|__|\*|_|~~|`)(?=\S)(.+?)(?<=\S)\1(?![\w*~`])/g, "$2")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line) return line;
  }
  return "";
}

// The program a shell command runs: its first word after variable assignments, `sudo`, `env`,
// `time` and `cd x &&`.
export function shellProgram(command: string): string {
  const words = command.trim().split(/\s+/);
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || word === "sudo" || word === "env" || word === "time" || word === "command" || word === "exec") index++;
    else if (word === "cd" && words[index + 2] === "&&") index += 3;
    else break;
  }
  return (words[index] ?? "").replace(/^.*\//, "");
}

// A path shown relative to the workspace folder when it is inside it.
export function relativePath(path: string, root: string | null): string {
  if (!root || !path.startsWith("/")) return path;
  const base = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(base) ? path.slice(base.length) || "." : path === root ? "." : path;
}

// Word-level changes between a removed and an added line: each side split into parts that are
// the same in both, or changed.
export function wordDiff(before: string, after: string): { before: { text: string; changed: boolean }[]; after: { text: string; changed: boolean }[] } {
  const split = (line: string) => line.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
  const a = split(before);
  const b = split(after);
  // Longest common subsequence of words; lines are short, so the table stays small.
  if (a.length * b.length > 40000) return { before: [{ text: before, changed: true }], after: [{ text: after, changed: true }] };
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const left: { text: string; changed: boolean }[] = [];
  const right: { text: string; changed: boolean }[] = [];
  const push = (side: typeof left, text: string, changed: boolean) => {
    const last = side[side.length - 1];
    if (last && last.changed === changed) last.text += text;
    else side.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(left, a[i++], false);
      push(right, b[j++], false);
    } else if (j < b.length && (i >= a.length || table[i][j + 1] >= table[i + 1][j])) push(right, b[j++], true);
    else push(left, a[i++], true);
  }
  return { before: left, after: right };
}

// ---------- Turn recap ----------

// The plugin row kind the daemon appends after a turn, and its renderer draws.
export const TURN_RECAP_KIND = "turn-recap";

export interface TurnRecap {
  // Names the turn's prompt (its place and time in the chat), so each turn's recap row has its own
  // id: a row id used again would replace an earlier row and stretch it over later replies.
  prompt: string;
  // From the turn's prompt to its end, in seconds; null when the prompt's time is unknown.
  seconds: number | null;
  files: { path: string; added: number; removed: number }[];
  failed: { command: string; exitCode: number | null }[];
  calls: number;
  outcome: "completed" | "failed" | "canceled";
  error: string;
}

// A turn summed up from its chat's history (its last prompt on): how long, which files changed by
// how much, which commands failed, and how many tool calls ran. Each call counts once, in its
// latest state. Null when there is no prompt in the page.
// Entries after `endedAt` belong to a later turn (a queued prompt can start before the recap is
// built) and are left out.
export function turnRecap(allEntries: readonly unknown[], endedAt: number, outcome: TurnRecap["outcome"], error = ""): TurnRecap | null {
  const entries = allEntries.filter((entry) => {
    const at = Date.parse(text(record(entry)?.timestamp));
    return Number.isNaN(at) || at <= endedAt;
  });
  let start = -1;
  for (let index = entries.length - 1; index >= 0; index--) {
    if (record(record(entries[index])?.item)?.type === "user_message") {
      start = index;
      break;
    }
  }
  if (start < 0) return null;
  const startedAt = Date.parse(text(record(entries[start])?.timestamp));
  const calls = new Map<string, unknown>();
  for (const entry of entries.slice(start)) {
    const item = record(record(entry)?.item);
    if (item?.type === "tool_call") calls.set(text(item.callId) || `#${calls.size}`, item);
  }
  const files = new Map<string, { path: string; added: number; removed: number }>();
  const failed: TurnRecap["failed"] = [];
  for (const call of calls.values()) {
    const summary = summarizeToolCall(call);
    if (!summary) continue;
    if ((summary.detail === "edit" || summary.detail === "write") && summary.status === "completed" && summary.path) {
      const counts = summary.lines ?? { added: 0, removed: 0 };
      const file = files.get(summary.path) ?? { path: summary.path, added: 0, removed: 0 };
      files.set(summary.path, { path: file.path, added: file.added + counts.added, removed: file.removed + counts.removed });
    }
    if (summary.detail === "shell" && summary.status === "failed") {
      const exit = /^exit (\d+)$/.exec(summary.facts.find((fact) => fact.startsWith("exit ")) ?? "");
      failed.push({ command: summary.subject, exitCode: exit ? Number(exit[1]) : null });
    }
  }
  const promptEntry = record(entries[start]);
  return {
    prompt: `${num(promptEntry?.seqStart) ?? ""}@${text(promptEntry?.timestamp)}`,
    seconds: Number.isNaN(startedAt) ? null : Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    files: [...files.values()].slice(0, 30),
    failed: failed.slice(0, 10),
    calls: calls.size,
    outcome,
    error: cut(error, 500),
  };
}
