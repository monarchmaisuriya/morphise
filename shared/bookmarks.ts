import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// Bookmarked answers: one host settings document shared by every app. A bookmark keeps an excerpt
// of the answer, so it still reads when its chat is gone.

export const MAX_BOOKMARKS = 500;
export const MAX_EXCERPT = 800;
export const MAX_NOTE = 300;

export const bookmarkSchema = z.object({
  id: z.string().min(1).max(100),
  agentId: z.string().min(1).max(200),
  workspaceId: z.string().max(200).nullable(),
  chat: z.string().max(200),
  excerpt: z.string().max(MAX_EXCERPT),
  note: z.string().max(MAX_NOTE),
  at: z.string(),
});

export type Bookmark = z.infer<typeof bookmarkSchema>;

export const bookmarkDocumentSchema = z.object({ bookmarks: z.array(bookmarkSchema).max(MAX_BOOKMARKS).default([]) });

export type BookmarkDocument = z.infer<typeof bookmarkDocumentSchema>;

export const EMPTY_BOOKMARKS: BookmarkDocument = { bookmarks: [] };

export const bookmarkSettings = defineSettings({ id: "bookmarks", scope: "host", version: 1, schema: bookmarkDocumentSchema });

export type BookmarkOperation = { kind: "add"; bookmark: Bookmark } | { kind: "remove"; id: string };

// Newest first. Bookmarking the same answer of the same chat again changes nothing; past the limit
// the oldest bookmark goes.
export function applyBookmark(document: BookmarkDocument, operation: BookmarkOperation): BookmarkDocument {
  if (operation.kind === "remove") return { bookmarks: document.bookmarks.filter((bookmark) => bookmark.id !== operation.id) };
  const { bookmark } = operation;
  if (document.bookmarks.some((item) => item.agentId === bookmark.agentId && item.excerpt === bookmark.excerpt)) return document;
  return { bookmarks: [bookmark, ...document.bookmarks].slice(0, MAX_BOOKMARKS) };
}

export function excerptOf(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXCERPT ? `${trimmed.slice(0, MAX_EXCERPT - 3)}...` : trimmed;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// The newest answer in a page of timeline entries, oldest first; null when there is none.
export function lastAnswer(entries: readonly unknown[]): string | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const item = record(record(entries[index])?.item);
    if (item?.type === "assistant_message" && typeof item.text === "string" && item.text.trim()) return item.text;
  }
  return null;
}
