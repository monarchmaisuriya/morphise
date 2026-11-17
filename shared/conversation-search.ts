// Search inside an agent's conversation. Matching rules ported from Better Paseo (RoundRedDot/better-paseo,
// MIT, see NOTICE.md): shared/conversation-search.ts at d4c85cca. The text comes from the provider's
// log file on the daemon (server/stats/messages.ts), never from Paseo's timeline, which resumes agents.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_EXCERPT = 1202;
const BEFORE = 80;
const AFTER = 120;

// A byte offset into the log, and the file's inode, so a cursor from a replaced file is not trusted.
const cursorSchema = z.object({ offset: z.number().int().nonnegative(), inode: z.string().min(1).max(40) });
export type ConversationCursor = z.output<typeof cursorSchema>;

export const conversationSearch = defineRpc({
  name: "morphise.search.conversation",
  input: z.object({ agentId: z.string().min(1).max(200), query: z.string().trim().min(1).max(1000), cursor: cursorSchema.optional() }),
  // `nextCursor`: nothing found yet and more log is left. `unavailable`: why this chat cannot be searched.
  output: z.object({ match: z.string().max(MAX_EXCERPT).nullable(), nextCursor: cursorSchema.nullable(), unavailable: z.string().nullable() }),
});
export type ConversationSearchInput = z.output<typeof conversationSearch.input>;
export type ConversationSearchPage = z.output<typeof conversationSearch.output>;

// Where `needle` (already lower case) first appears in `text`, as [start, end) in `text`. Scans in
// windows rather than lowercasing a whole message; a character whose lower case is longer ("İ")
// shifts positions, so they are mapped back inside the window only.
function findFolded(text: string, needle: string): [number, number] | null {
  for (let offset = 0; offset < text.length; offset += 4096) {
    const chunk = text.slice(offset, offset + 4096 + needle.length);
    const index = chunk.toLowerCase().indexOf(needle);
    if (index < 0) continue;
    let folded = 0;
    let start = 0;
    let end = 0;
    for (const char of chunk) {
      if (folded >= index + needle.length) break;
      if (folded < index) start += char.length;
      end += char.length;
      folded += char.toLowerCase().length;
    }
    return [offset + start, offset + end];
  }
  return null;
}

/** An excerpt around every word of `query` when all of them are in `text` (any order, any case); else null. */
export function messageExcerpt(text: string, query: string): string | null {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const found: [number, number][] = [];
  for (const word of words) {
    const at = findFolded(text, word);
    if (!at) return null;
    found.push(at);
  }
  // One word: 80 characters before, 120 after. Several: the room left by the query, shared evenly
  // and less the two "…" marks, so the whole stays within MAX_EXCERPT.
  const context = Math.max(0, Math.floor((MAX_EXCERPT - query.trim().length) / words.length / 2) - 1);
  const [before, after] = words.length === 1 ? [BEFORE, AFTER] : [context, context];
  const ranges = found.map(([start, end]) => [Math.max(0, start - before), Math.min(text.length, end + after)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged.map(([from, to]) => `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`).join(" ");
}
