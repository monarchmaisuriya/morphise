import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { RowActions } from "../chat-rows";

// What the ported Chat Polish and Quote parts get from Morphise. Each part's `register` takes it
// once at startup and follows preference changes through `subscribePrefs` (client/polish/prefs.ts).
export interface PolishContext {
  client: PluginClientContext;
  // Changes the active layout's `profile.chat` (on the newest saved profile); a key set to
  // undefined is removed, so defaults are never written.
  updateChat(change: (chat: Record<string, unknown>) => void): Promise<void>;
  // Adds a Workbench bookmark of a passage from a chat.
  bookmarkPassage(input: { agentId: string; workspaceId: string | null; excerpt: string }): Promise<void>;
  // Morphise's file and Details actions for chat rows.
  rowActions: RowActions;
}

export type PolishPart = (context: PolishContext) => () => void;
