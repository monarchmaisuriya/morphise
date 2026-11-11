import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon, SidebarRow } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatElapsed } from "../shared/time-text";
import type { Bookmark } from "../shared/bookmarks";
import { type AttentionItem, type AttentionList, type AttentionReason, attentionOrder } from "./attention";
import { type ApplyBookmark, type BookmarkStore, bookmarksOf } from "./bookmark-store";
import { type ValueStore, useValue } from "./profile-store";
import { BLUE } from "./ui/hues";
import { IconButton, Segmented, type Tokens, useTokens } from "./ui/kit";
import type { WorkspaceList } from "./workspaces";

// The Inbox: every chat and sub-agent waiting on the user, across workspaces, from Paseo's own
// attention state. Opening one clears it in Paseo, and the Inbox follows.

export const INBOX_SCREEN_ID = "inbox";

export interface InboxDeps {
  attention: ValueStore<AttentionList>;
  workspaces: ValueStore<WorkspaceList>;
  bookmarks: BookmarkStore;
  applyBookmark: ApplyBookmark;
}

type Tab = "waiting" | "bookmarks";

function BookmarkRow({ bookmark, t, workspaces, open, remove }: { bookmark: Bookmark; t: Tokens; workspaces: WorkspaceList; open: ((agentId: string) => void) | null; remove(): void }) {
  const workspace = bookmark.workspaceId ? workspaces.get(bookmark.workspaceId)?.name ?? null : null;
  const meta = [bookmark.chat, workspace, formatElapsed(bookmark.at, new Date())].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${bookmark.chat}`} disabled={!open} onPress={() => open?.(bookmark.agentId)} style={{ flex: 1, minWidth: 0, gap: 4 }}>
        {bookmark.note ? <Text style={{ color: t.c.foreground, fontSize: 13, fontWeight: "600" }}>{bookmark.note}</Text> : null}
        <Text style={{ color: t.c.foreground, fontSize: 13, lineHeight: 18 }} numberOfLines={5}>
          {bookmark.excerpt}
        </Text>
        <Text style={t.text.meta} numberOfLines={1}>
          {meta}
        </Text>
      </Pressable>
      <IconButton t={t} size="sm" icon="Trash2" label={`Remove the bookmark from ${bookmark.chat}`} onPress={remove} />
    </View>
  );
}

const HEADINGS: Record<AttentionReason, string> = { permission: "Waiting for permission", failed: "Failed", finished: "Finished, not seen yet" };

function reasonColor(t: Tokens, reason: AttentionReason): string {
  return reason === "permission" ? t.c.statusWarning : reason === "failed" ? t.c.statusDanger : BLUE;
}

function InboxRow({ item, t, list, workspaces, open }: { item: AttentionItem; t: Tokens; list: AttentionList; workspaces: WorkspaceList; open: ((agentId: string) => void) | null }) {
  const workspace = workspaces.get(item.workspaceId)?.name ?? null;
  const parent = item.parentAgentId ? list.get(item.parentAgentId)?.title ?? "a chat" : null;
  const elapsed = item.at ? formatElapsed(item.at, new Date()) : null;
  const where = [parent ? `sub-agent of ${parent}` : null, workspace].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}, ${HEADINGS[item.reason]}${where ? `, ${where}` : ""}`}
      disabled={!open}
      onPress={() => open?.(item.id)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: pressed ? t.c.surface2 : "transparent" })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: reasonColor(t, item.reason) }} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ color: t.c.foreground, fontSize: 14 }} numberOfLines={1}>
          {item.title}
        </Text>
        {where ? (
          <Text style={t.text.meta} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
      </View>
      {elapsed ? <Text style={t.text.meta}>{elapsed}</Text> : null}
    </Pressable>
  );
}

export function createInboxScreen(deps: InboxDeps) {
  return function InboxScreen({ theme, layout, navigation, params }: PluginScreenProps) {
    const t = useTokens(theme, layout.compact);
    const [tab, setTab] = useState<Tab>(params.tab === "bookmarks" ? "bookmarks" : "waiting");
    const [problem, setProblem] = useState<string | null>(null);
    const bookmarks = bookmarksOf(useValue(deps.bookmarks)).bookmarks;
    const list = useValue(deps.attention);
    const workspaces = useValue(deps.workspaces);
    // Chats in archived, internal or background workspaces stay out, as their workspaces do.
    const items = attentionOrder(list).filter((item) => workspaces.get(item.workspaceId)?.open !== false);
    const open = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : null;
    const sections: ReactNode[] = [];
    for (const reason of ["permission", "failed", "finished"] as const) {
      const group = items.filter((item) => item.reason === reason);
      if (!group.length) continue;
      sections.push(
        <View key={reason} style={{ gap: 2 }}>
          <Text style={[t.text.label, { paddingHorizontal: 10, paddingTop: 8 }]}>
            {HEADINGS[reason]} · {group.length}
          </Text>
          {group.map((item) => (
            <InboxRow key={item.id} item={item} t={t} list={list} workspaces={workspaces} open={open} />
          ))}
        </View>,
      );
    }
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        <View style={{ gap: 8, paddingHorizontal: 10 }}>
          <Text style={t.text.title}>Inbox</Text>
          <Segmented<Tab>
            t={t}
            label="Inbox list"
            value={tab}
            onChange={setTab}
            options={[
              { value: "waiting", label: `Waiting on you${items.length ? ` · ${items.length}` : ""}`, icon: "Inbox" },
              { value: "bookmarks", label: `Bookmarks${bookmarks.length ? ` · ${bookmarks.length}` : ""}`, icon: "Bookmark" },
            ]}
          />
          <Text style={t.text.small}>{tab === "waiting" ? "Chats and sub-agents waiting on you. Opening one clears it." : "Answers you bookmarked with /bookmark or the Command Center."}</Text>
          {problem ? <Text style={t.text.danger}>{problem}</Text> : null}
        </View>
        {tab === "bookmarks" ? (
          bookmarks.length ? (
            bookmarks.map((bookmark) => (
              <BookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                t={t}
                workspaces={workspaces}
                open={open}
                remove={() =>
                  void deps.applyBookmark({ kind: "remove", id: bookmark.id }).then(
                    () => setProblem(null),
                    (error: unknown) => setProblem(`Could not remove the bookmark: ${error instanceof Error ? error.message : String(error)}`),
                  )
                }
              />
            ))
          ) : (
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 40 }}>
              <Icon name="Bookmark" size={22} color={theme.colors.foregroundMuted} />
              <Text style={t.text.small}>No bookmarks yet. Type /bookmark in a chat to keep its last answer.</Text>
            </View>
          )
        ) : sections.length ? (
          sections
        ) : (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 40 }}>
            <Icon name="Inbox" size={22} color={theme.colors.foregroundMuted} />
            <Text style={t.text.small}>Nothing waiting on you.</Text>
          </View>
        )}
      </ScrollView>
    );
  };
}

// "Inbox" in Paseo's sidebar header, with how many items wait; amber while one needs permission.
export function createInboxSidebarItem(deps: InboxDeps) {
  return function InboxSidebarItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
    const list = useValue(deps.attention);
    const workspaces = useValue(deps.workspaces);
    const shown = [...list.values()].filter((item) => workspaces.get(item.workspaceId)?.open !== false);
    const count = shown.length;
    const permission = shown.some((item) => item.reason === "permission");
    return (
      <SidebarRow
        icon="Inbox"
        active={currentScreen?.screenId === INBOX_SCREEN_ID}
        onPress={() => openScreen({ screenId: INBOX_SCREEN_ID })}
        trailing={count ? <Text style={{ fontSize: 12, color: permission ? theme.colors.statusWarning : theme.colors.foregroundMuted, paddingRight: 8 }}>{count}</Text> : null}
      />
    );
  };
}
