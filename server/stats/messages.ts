// Conversation search over a provider's session log: the text of user messages, replies and
// reasoning, read in byte windows from a cursor. Nothing read is kept after a call.
import { open } from "node:fs/promises";
import { type ConversationCursor, messageExcerpt } from "../../shared/conversation-search";
import type { StatsProvider } from "../../shared/stats";

export interface SearchLimits {
  maxBytes: number;
  maxMs: number;
}
export const DEFAULT_SEARCH_LIMITS: SearchLimits = { maxBytes: 8 * 1024 * 1024, maxMs: 2000 };

type Row = Record<string, unknown>;
const record = (value: unknown): Row => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Row) : {});
const blocks = (value: unknown): Row[] => (Array.isArray(value) ? value.map(record) : []);
const strings = (values: unknown[]): string[] => values.filter((value): value is string => typeof value === "string");

/** The searchable text of one log row: never tool calls, tool results, sub-agent or system-added rows. */
export function messageTexts(provider: StatsProvider, value: unknown): string[] {
  const row = record(value);
  if (provider === "claude") {
    if ((row.type !== "user" && row.type !== "assistant") || row.isSidechain === true || row.isMeta === true) return [];
    const content = record(row.message).content;
    if (typeof content === "string") return [content];
    return strings(blocks(content).map((block) => (block.type === "text" ? block.text : block.type === "thinking" ? block.thinking : undefined)));
  }
  if (row.type !== "response_item") return [];
  const payload = record(row.payload);
  if (payload.type === "message" && (payload.role === "user" || payload.role === "assistant")) return strings(blocks(payload.content).map((block) => block.text));
  if (payload.type === "reasoning") return strings(blocks(payload.summary).map((block) => block.text));
  return [];
}

function lineExcerpt(line: string, provider: StatsProvider, query: string): string | null {
  if (!line.trim()) return null;
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    throw new Error("Session log contains an invalid JSON line");
  }
  for (const text of messageTexts(provider, row)) {
    const match = messageExcerpt(text, query);
    if (match !== null) return match;
  }
  return null;
}

/**
 * Searches whole lines from `cursor` for at most `maxBytes` and `maxMs`. Answers the first match, or
 * a cursor to continue from when the window ended before the file did. A cursor past the end, or
 * from a file with another inode, starts again from 0. A cursor inside a line (a line longer than
 * a window) skips to the next line, so every call makes progress; such a line is not searched.
 */
export async function searchLog(
  path: string,
  provider: StatsProvider,
  query: string,
  cursor: ConversationCursor | undefined,
  limits: SearchLimits = DEFAULT_SEARCH_LIMITS,
): Promise<{ match: string | null; nextCursor: ConversationCursor | null }> {
  const file = await open(path, "r");
  try {
    const info = await file.stat({ bigint: true });
    const inode = String(info.ino);
    const size = Number(info.size);
    const start = cursor && cursor.inode === inode && cursor.offset <= size ? cursor.offset : 0;
    const end = Math.min(size, start + limits.maxBytes);
    const deadline = Date.now() + limits.maxMs;
    let skipping = false;
    if (start > 0) {
      const before = Buffer.alloc(1);
      await file.read(before, 0, 1, start - 1);
      skipping = before[0] !== 0x0a;
    }
    const buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, end - start)));
    let pending: Buffer[] = [];
    let position = start;
    let lineStart = start;
    while (position < end) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, end - position), position);
      if (bytesRead === 0) break;
      const data = buffer.subarray(0, bytesRead);
      let from = 0;
      for (let newline = data.indexOf(0x0a); newline >= 0; newline = data.indexOf(0x0a, from)) {
        if (!skipping) {
          const match = lineExcerpt(Buffer.concat([...pending, data.subarray(from, newline)]).toString("utf8"), provider, query);
          if (match !== null) return { match, nextCursor: null };
        }
        skipping = false;
        pending = [];
        from = newline + 1;
        lineStart = position + from;
      }
      if (!skipping) pending.push(Buffer.from(data.subarray(from)));
      position += bytesRead;
      if (Date.now() > deadline) break;
    }
    // At the end of the file an unfinished last line is still being written; a later search reads it.
    if (position >= size) return { match: null, nextCursor: null };
    return { match: null, nextCursor: { offset: lineStart > start ? lineStart : position, inode } };
  } finally {
    await file.close();
  }
}
