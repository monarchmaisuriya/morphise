import type { PluginClientContext } from "@getpaseo/plugin/client";
import { copyText, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { Bookmark } from "../shared/bookmarks";
import { waitsOnUser } from "../shared/inbox";
import { formatElapsed } from "../shared/time-text";
import type { AttentionItem, AttentionList } from "./attention";
import { type ApplyBookmark, type BookmarkStore, bookmarksOf } from "./bookmark-store";
import { type ValueStore, useValue } from "./profile-store";
import { Field, Icon, IconButton, type Tokens } from "./ui/kit";
import type { WorkspaceList } from "./workspaces";

// The Workbench's Bookmarks view, and the count of chats waiting on the user (permission, failed, finished and not
// cleared) that the Workbench shows. Before 0.20 this file also drew the Waiting view; the Workbench's Agents view lists
// and answers those agents now.

export interface InboxDeps {
  client: PluginClientContext;
  attention: ValueStore<AttentionList>;
  workspaces: ValueStore<WorkspaceList>;
  bookmarks: BookmarkStore;
  applyBookmark: ApplyBookmark;
  bookmarkLastAnswer(agentId: string, workspaceId: string | null, note: string): Promise<void>;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function EmptyState({ t, icon, title, hint }: { t: Tokens; icon: string; title: string; hint: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6, paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface1 }}>
        <Icon name={icon} size={20} color={t.c.foregroundMuted} />
      </View>
      <Text style={t.text.heading}>{title}</Text>
      <Text style={[t.text.meta, { textAlign: "center" }]}>{hint}</Text>
    </View>
  );
}

// ---------- Bookmarks ----------

function BookmarkCard({ bookmark, t, workspaces, open, remove }: { bookmark: Bookmark; t: Tokens; workspaces: WorkspaceList; open: ((agentId: string) => void) | null; remove(): void }) {
  const toast = useToast();
  const workspace = bookmark.workspaceId ? workspaces.get(bookmark.workspaceId)?.name ?? null : null;
  const meta = [bookmark.chat, workspace, formatElapsed(bookmark.at, new Date())].filter(Boolean).join(" · ");
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="Bookmark" size={13} color={t.c.foregroundMuted} />
        <Text style={[t.text.meta, { flex: 1 }]} numberOfLines={1}>
          {meta}
        </Text>
        <IconButton t={t} size="sm" icon="Copy" label={`Copy the bookmark from ${bookmark.chat}`} onPress={() => void copyText(bookmark.excerpt).then(() => toast.show("Copied"), (error: unknown) => toast.error(errorText(error)))} />
        {open ? <IconButton t={t} size="sm" icon="MessageSquare" label={`Open ${bookmark.chat}`} onPress={() => open(bookmark.agentId)} /> : null}
        <IconButton t={t} size="sm" icon="Trash2" label={`Remove the bookmark from ${bookmark.chat}`} onPress={remove} />
      </View>
      {bookmark.note ? <Text style={t.text.heading}>{bookmark.note}</Text> : null}
      <Markdown>{bookmark.excerpt}</Markdown>
    </View>
  );
}

export function Bookmarks({ t, deps, workspaces, open }: { t: Tokens; deps: InboxDeps; workspaces: WorkspaceList; open: ((agentId: string) => void) | null }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const all = bookmarksOf(useValue(deps.bookmarks)).bookmarks;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((bookmark) => words.every((word) => `${bookmark.note} ${bookmark.chat} ${bookmark.excerpt}`.toLowerCase().includes(word)));
  const remove = (bookmark: Bookmark) =>
    void deps.applyBookmark({ kind: "remove", id: bookmark.id }).then(
      () => toast.show("Bookmark removed"),
      (error: unknown) => toast.error(`Could not remove the bookmark: ${errorText(error)}`),
    );
  if (!all.length) return <EmptyState t={t} icon="Bookmark" title="No bookmarks yet" hint="Type /bookmark in a chat, or use Bookmark answer here, to keep an answer." />;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.compact ? 12 : 20, gap: 10, width: "100%" }}>
      <Field t={t} value={search} onChangeText={setSearch} placeholder="Search bookmarks" icon="Search" plain accessibilityLabel="Search bookmarks" />
      {shown.length ? shown.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} t={t} workspaces={workspaces} open={open} remove={() => remove(bookmark)} />) : <Text style={t.text.meta}>No bookmark matches.</Text>}
    </ScrollView>
  );
}

// Items waiting on the user that the Inbox lists and counts: in open workspaces, not cleared.
export function waitingItems(list: AttentionList, workspaces: WorkspaceList, cleared: ReadonlySet<string>): AttentionItem[] {
  return [...list.values()].filter((item) => waitsOnUser(item, workspaces.get(item.workspaceId)?.open !== false, cleared));
}

