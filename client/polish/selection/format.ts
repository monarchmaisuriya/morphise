// Ported from Quote (keefeere/paseo-quote, MIT, see NOTICE.md): client/format.ts
// Text shaping shared by the selection bar and the side chat. Pure functions: no DOM, no React
// Native, so both runtimes (and the tests) can import them.

export interface QuoteSource {
  /** Markdown when the host could serialize the selection, rendered text otherwise. */
  text: string;
  /** Set when the whole selection sits inside one code block, code span, or tool output. */
  code: { language: string | null } | null;
}

/**
 * The snippet a quote becomes in the composer.
 *
 * Multi-line code keeps a fence: `>` in front of every line makes code unreadable to the next
 * reader and to the model. A single line of code stays a quote.
 */
export function formatQuote(source: QuoteSource): string {
  const code = source.code;
  // Code keeps its indentation; prose loses the stray spaces a drag picks up.
  const text = code ? normalize(source.text) : normalize(source.text).trim();
  if (code && text.includes("\n")) {
    const fence = text.includes("```") ? "````" : "```";
    return `${fence}${code.language ?? ""}\n${text}\n${fence}`;
  }
  const body = code ? codeSpan(text) : text;
  return body
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

/**
 * One line of code as a Markdown code span. Backslashes don't escape inside a span, so the delimiter is a backtick run longer than
 * any inside; a space pads code that starts or ends with a backtick (Markdown strips one such space from each side).
 */
function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** Quote plus reply, as one paragraph group. */
export function formatReply(source: QuoteSource, reply: string): string {
  const answer = reply.trim();
  const quote = formatQuote(source);
  return answer ? `${quote}\n\n${answer}` : quote;
}

/**
 * Where `snippet` lands after `existing` text: a blank line between paragraphs, or the previous
 * paragraph swallows the quote.
 */
export function joinParagraph(existing: string, snippet: string): string {
  if (!existing.trim()) return snippet;
  if (existing.endsWith("\n\n")) return snippet;
  if (existing.endsWith("\n")) return `\n${snippet}`;
  return `\n\n${snippet}`;
}

function normalize(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

const CONTEXT_TURNS = 8;
const TURN_LIMIT = 6_000;
const CONTEXT_LIMIT = 30_000;

/**
 * Instructions for a side chat. The side agent is a fresh session: the plugin API cannot fork a
 * conversation, so the recent main-chat turns travel here instead.
 */
export function buildSideChatSystemPrompt(turns: readonly ChatTurn[], quote: string): string {
  const source = findSourceTurn(turns, quote);
  const recent = turns.slice(-CONTEXT_TURNS);
  const picked = source !== null && !recent.includes(turns[source]!) ? [turns[source]!, ...recent] : recent;

  let budget = CONTEXT_LIMIT;
  const rendered: string[] = [];
  for (const turn of [...picked].reverse()) {
    const text = clip(turn.text, TURN_LIMIT);
    if (text.length > budget) break;
    budget -= text.length;
    rendered.unshift(`<${turn.role}>\n${text}\n</${turn.role}>`);
  }

  return [
    "You are a side chat branched off a main conversation in the same workspace.",
    "The user highlighted a passage from that conversation and asks about it here, so the main thread stays focused.",
    "Answer the question about the quoted passage. Keep it conversational and concise.",
    "Do not modify files or run commands that change state unless the user explicitly asks in this side chat.",
    "",
    "Recent turns of the main conversation, oldest first:",
    "<main_conversation>",
    rendered.join("\n\n"),
    "</main_conversation>",
  ].join("\n");
}

/** Index of the turn the quote was taken from, matched on letters and digits only. */
function findSourceTurn(turns: readonly ChatTurn[], quote: string): number | null {
  const needle = squash(quote).slice(0, 80);
  if (needle.length < 8) return null;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (squash(turns[index]!.text).includes(needle)) return index;
  }
  return null;
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return `${trimmed.slice(0, head)}\n[…]\n${trimmed.slice(-tail)}`;
}

/** Short, single-line side chat title from the question; `prefix` is the localized "Side chat". */
export function sideChatTitle(question: string, prefix = "Side chat"): string {
  const line = question.trim().split("\n")[0] ?? "";
  const short = line.length > 48 ? `${line.slice(0, 47)}…` : line;
  return `${prefix}: ${short || "quote"}`;
}

// Ported from Quote: client/side-chat-panel.tsx (its Markdown splitter, kept here so it can be tested).
export type Block = { kind: "text" | "quote" | "code"; text: string };

/** Enough Markdown structure to read a reply: fences, quotes, and paragraphs. */
export function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith(fence[1]!)) {
        body.push(lines[index]!);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const kind = /^\s*>/.test(line) ? "quote" : "text";
    const body: string[] = [];
    while (index < lines.length) {
      const current = lines[index]!;
      if (/^\s*(`{3,}|~{3,})/.test(current)) break;
      if ((/^\s*>/.test(current) ? "quote" : "text") !== kind) break;
      body.push(kind === "quote" ? current.replace(/^\s*> ?/, "") : current);
      index += 1;
    }
    const joined = body.join("\n").replace(/^\n+|\n+$/g, "");
    if (joined) blocks.push({ kind, text: joined });
  }
  return blocks;
}

/** Settings → Sending → Default send, from Paseo's saved app settings (JSON text, or null when unset). */
export type SendBehavior = "interrupt" | "steer" | "queue";

export function sendBehaviorOf(raw: string | null): SendBehavior | null {
  if (raw === null) return null;
  try {
    const value = (JSON.parse(raw) as { sendBehavior?: unknown } | null)?.sendBehavior;
    // Paseo's own schema falls back to "steer" for anything it does not know.
    return value === "interrupt" || value === "queue" ? value : "steer";
  } catch {
    return null;
  }
}
