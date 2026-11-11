import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { dueCount, todayGroups } from "../shared/board";
import { inboxSettings } from "../shared/inbox";
import { TasksBoard } from "./board/board";
import { bookmarksOf } from "./bookmark-store";
import { Bookmarks, waitingItems, WaitingView } from "./inbox";
import { useValue } from "./profile-store";
import { useReminderClock } from "./reminder-clock";
import type { SurfaceDeps } from "./task-surfaces";
import { tasksOf } from "./task-store";
import { lendScreenOpener } from "./dispatch";
import { Icon, type Tokens, useTokens } from "./ui/kit";

// Workbench: everything that needs the user, in one place. Chats waiting on them (raised by agents) and
// their own tasks (Today, Board, Archived), plus bookmarked answers. A list of views on the left on
// wide screens, tabs along the top on phones.

export const WORKBENCH_SCREEN_ID = "workbench";
// Earlier versions opened these two; they still open the Workbench, on the view they used to show.
export const LEGACY_SCREENS = { tasks: "board", inbox: "waiting" } as const;

export type WorkbenchView = "waiting" | "today" | "board" | "bookmarks" | "archived";
const VIEWS: readonly WorkbenchView[] = ["waiting", "today", "board", "bookmarks", "archived"];
// Below this width the views sit in a row of tabs instead of a list.
const RAIL_FROM = 720;

function viewParam(params: PluginScreenProps["params"]): WorkbenchView | null {
  const asked = typeof params.view === "string" ? params.view : typeof params.tab === "string" ? params.tab : null;
  return VIEWS.find((view) => view === asked) ?? null;
}

// The counts each view shows, kept current.
function useWorkbenchCounts(deps: SurfaceDeps) {
  const document = tasksOf(useValue(deps.tasks));
  const now = useReminderClock(document.tasks.flatMap((task) => (task.reminder ? [task.reminder] : [])), true);
  const list = useValue(deps.attention);
  const workspaces = useValue(deps.workspaces);
  const settings = useSettings(inboxSettings);
  const waiting = waitingItems(list, workspaces, new Set(settings.status === "ready" ? settings.values.cleared : []));
  return {
    waiting: waiting.length,
    permission: waiting.some((item) => item.reason === "permission"),
    today: todayGroups(document, now).reduce((sum, group) => sum + group.tasks.length, 0),
    due: dueCount(document, now),
    bookmarks: bookmarksOf(useValue(deps.bookmarks)).bookmarks.length,
    archived: document.tasks.filter((task) => task.archivedAt !== null).length,
  };
}

type Counts = ReturnType<typeof useWorkbenchCounts>;

const ENTRIES: readonly { view: WorkbenchView; label: string; icon: string; section: "you" | "tasks" | "saved" }[] = [
  { view: "waiting", label: "Waiting on you", icon: "Inbox", section: "you" },
  { view: "today", label: "Today", icon: "Sun", section: "tasks" },
  { view: "board", label: "Board", icon: "Columns3", section: "tasks" },
  { view: "archived", label: "Archived", icon: "Archive", section: "tasks" },
  { view: "bookmarks", label: "Bookmarks", icon: "Bookmark", section: "saved" },
];
const SECTION_TITLES = { you: "Agents", tasks: "Tasks", saved: "Saved" } as const;

function countOf(view: WorkbenchView, counts: Counts): number {
  return view === "waiting" ? counts.waiting : view === "today" ? counts.today : view === "bookmarks" ? counts.bookmarks : view === "archived" ? counts.archived : 0;
}

// The count's colour: amber while something needs permission or a reminder is due.
function countTone(view: WorkbenchView, counts: Counts, t: Tokens): string {
  if (view === "waiting" && counts.permission) return t.c.statusWarning;
  if (view === "today" && counts.due) return t.c.statusWarning;
  return t.c.foregroundMuted;
}

function RailRow({ t, view, label, icon, count, tone, selected, onPress }: { t: Tokens; view: WorkbenchView; label: string; icon: string; count: number; tone: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        height: t.row,
        paddingHorizontal: 10,
        borderRadius: t.radius.row,
        backgroundColor: selected ? t.c.surface2 : pressed || hovered ? t.c.surface1 : "transparent",
      })}
      testID={`workbench-view-${view}`}
    >
      <Icon name={icon} size={15} color={selected ? t.c.foreground : t.c.foregroundMuted} />
      <Text style={{ flex: 1, fontSize: 14, color: t.c.foreground, fontWeight: selected ? "600" : "400" }} numberOfLines={1}>
        {label}
      </Text>
      {count ? <Text style={{ fontSize: 12, color: tone }}>{count}</Text> : null}
    </Pressable>
  );
}

export function createWorkbenchScreen(deps: SurfaceDeps, fallback: WorkbenchView | null = null) {
  return function WorkbenchScreen({ theme, layout, params, navigation }: PluginScreenProps) {
    const t = useTokens(theme, layout.compact);
    const counts = useWorkbenchCounts(deps);
    // The view picked here or asked for when opened; until then, what needs the user first, then
    // what is due, then the board, following the counts as they arrive.
    const [picked, setView] = useState<WorkbenchView | null>(null);
    const asked = viewParam(params);
    // Each opening asks again, even for the view it asked for last time.
    useEffect(() => {
      if (asked) setView(asked);
    }, [asked, params]);
    const view: WorkbenchView = picked ?? asked ?? fallback ?? (counts.waiting ? "waiting" : counts.today ? "today" : "board");
    const [width, setWidth] = useState(0);
    const rail = !layout.compact && width >= RAIL_FROM;
    const openChat = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : null;
    const workspaces = useValue(deps.workspaces);

    const content =
      view === "waiting" ? (
        <WaitingView deps={deps} theme={theme} compact={layout.compact} navigation={navigation} />
      ) : view === "bookmarks" ? (
        <Bookmarks t={t} deps={deps} workspaces={workspaces} open={openChat} />
      ) : (
        <TasksBoard key={view} deps={deps} theme={theme} compact={layout.compact} workspaceId={null} initialTab={view} openChat={openChat} embedded />
      );

    return (
      <View style={{ flex: 1, flexDirection: rail ? "row" : "column", backgroundColor: theme.colors.surface0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {rail ? (
          <View accessibilityRole="tablist" style={{ width: 210, padding: 8, gap: 2, borderRightWidth: 1, borderRightColor: t.c.border }}>
            {(["you", "tasks", "saved"] as const).map((section) => (
              <View key={section} style={{ gap: 2, paddingBottom: 8 }}>
                <Text style={[t.text.label, { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }]}>{SECTION_TITLES[section]}</Text>
                {ENTRIES.filter((entry) => entry.section === section).map((entry) => (
                  <RailRow key={entry.view} t={t} view={entry.view} label={entry.label} icon={entry.icon} count={countOf(entry.view, counts)} tone={countTone(entry.view, counts, t)} selected={view === entry.view} onPress={() => setView(entry.view)} />
                ))}
              </View>
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: t.c.border }} contentContainerStyle={{ padding: 8, gap: 4 }} accessibilityRole="tablist">
            {ENTRIES.map((entry) => {
              const count = countOf(entry.view, counts);
              const selected = view === entry.view;
              return (
                <Pressable
                  key={entry.view}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={count ? `${entry.label}, ${count}` : entry.label}
                  onPress={() => setView(entry.view)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, height: t.control, paddingHorizontal: 10, borderRadius: t.radius.control, backgroundColor: selected ? t.c.surface2 : "transparent" }}
                >
                  <Icon name={entry.icon} size={14} color={selected ? t.c.foreground : t.c.foregroundMuted} />
                  <Text style={{ fontSize: 13, color: selected ? t.c.foreground : t.c.foregroundMuted, fontWeight: selected ? "600" : "400" }}>{entry.label}</Text>
                  {count ? <Text style={{ fontSize: 12, color: countTone(entry.view, counts, t) }}>{count}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  };
}

// "Workbench" in Paseo's sidebar header: how many things wait on the user (amber while one needs
// permission) and how many reminders are due. It also shows each due reminder as a toast.
export function createWorkbenchSidebarItem(deps: SurfaceDeps) {
  return function WorkbenchSidebarItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
    const counts = useWorkbenchCounts(deps);
    const announcement = useValue(deps.announcements);
    const toast = useToast();
    // A remount (drawer reopened, view switched) must not replay toasts already shown.
    const shownSeq = useRef(announcement.seq);
    useEffect(() => {
      if (announcement.seq <= shownSeq.current) return;
      shownSeq.current = announcement.seq;
      for (const entry of announcement.entries) toast.show(`Reminder: ${entry.title}${entry.reminder.note ? `. ${entry.reminder.note}` : ""}`, { variant: "info", durationMs: 8000 });
    }, [announcement.seq]);
    // Lend this row's screen opener to the sidebar view's Dispatch button (see screenOpener).
    useEffect(() => lendScreenOpener(openScreen), [openScreen]);
    const active = currentScreen !== null && (currentScreen.screenId === WORKBENCH_SCREEN_ID || currentScreen.screenId in LEGACY_SCREENS);
    return (
      <SidebarRow
        icon="LayoutDashboard"
        label={counts.due ? `Workbench · ${counts.due} due` : "Workbench"}
        active={active}
        onPress={() => openScreen({ screenId: WORKBENCH_SCREEN_ID })}
        trailing={counts.waiting ? <Text style={{ fontSize: 12, color: counts.permission ? theme.colors.statusWarning : theme.colors.foregroundMuted, paddingRight: 8 }}>{counts.waiting}</Text> : null}
      />
    );
  };
}
