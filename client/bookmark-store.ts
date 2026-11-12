import { applyBookmark, type BookmarkDocument, bookmarkDocumentSchema, type BookmarkOperation, EMPTY_BOOKMARKS, excerptOf, lastAnswer } from "../shared/bookmarks";
import type { BookmarksEvent } from "../shared/watch";
import type { StreamStore } from "./profile-connection";
import { createValueStore } from "./profile-store";

// The bookmark document as this app last received it, and the one way apps change it.
export type BookmarkStore = StreamStore<BookmarksEvent>;

export function createBookmarkStore(): BookmarkStore {
  return createValueStore<{ event: BookmarksEvent | null; connectionError: string | null }>({ event: null, connectionError: null });
}

export function bookmarksOf(state: ReturnType<BookmarkStore["get"]>): BookmarkDocument {
  return state.event?.status === "ready" ? state.event.document : EMPTY_BOOKMARKS;
}

type ReadResult = { status: "ready"; revision: string; values: unknown } | { status: "invalid"; revision: string; error: string };
type WriteResult = { status: "saved"; revision: string; values: unknown } | { status: "conflict"; error: string } | { status: "invalid"; error: string };

export interface BookmarkCalls {
  read(): Promise<ReadResult>;
  write(input: { revision: string; values: BookmarkDocument }): Promise<WriteResult>;
}

export type ApplyBookmark = (operation: BookmarkOperation) => Promise<void>;

const ATTEMPTS = 3;

// Applies one change to the newest stored document; when another app saved first, again to theirs.
export function createBookmarkWriter(calls: BookmarkCalls): ApplyBookmark {
  return async (operation) => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const state = await calls.read();
      if (state.status !== "ready") throw new Error(`The stored bookmarks are invalid: ${state.error}`);
      const base = bookmarkDocumentSchema.parse(state.values);
      const next = applyBookmark(base, operation);
      if (next === base) return;
      const result = await calls.write({ revision: state.revision, values: next });
      if (result.status === "saved") return;
      if (result.status === "invalid") throw new Error(result.error);
    }
    throw new Error("Other apps kept changing the bookmarks at the same moment; try again");
  };
}

// How far back a chat's history is searched for its newest answer.
export const ANSWER_TAIL = 100;

export interface BookmarkCapture {
  // Whether the chat is answering right now: its newest answer is still being written.
  isRunning(agentId: string): boolean;
  readTail(agentId: string): Promise<{ entries: readonly unknown[] }>;
  chatTitle(agentId: string): string;
  apply: ApplyBookmark;
}

// Bookmarks a chat's newest answer, with an optional note.
// Bookmarks a passage chosen in a chat (the selection bar's Bookmark).
export async function bookmarkPassage(capture: BookmarkCapture, input: { agentId: string; workspaceId: string | null; excerpt: string }, now = new Date()): Promise<void> {
  const excerpt = excerptOf(input.excerpt);
  if (!excerpt.trim()) throw new Error("Select some text to bookmark");
  await capture.apply({
    kind: "add",
    bookmark: {
      id: `b-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      chat: capture.chatTitle(input.agentId).slice(0, 200),
      excerpt,
      note: "",
      at: now.toISOString(),
    },
  });
}

export async function bookmarkLastAnswer(capture: BookmarkCapture, agentId: string, workspaceId: string | null, note: string, now = new Date()): Promise<void> {
  if (capture.isRunning(agentId)) throw new Error("This chat is still answering; bookmark it once the answer is finished");
  const page = await capture.readTail(agentId);
  const answer = lastAnswer(page.entries);
  if (!answer) throw new Error("This chat has no answer to bookmark yet");
  await capture.apply({
    kind: "add",
    bookmark: {
      id: `b-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      workspaceId,
      chat: capture.chatTitle(agentId).slice(0, 200),
      excerpt: excerptOf(answer),
      note: note.trim().slice(0, 300),
      at: now.toISOString(),
    },
  });
}
