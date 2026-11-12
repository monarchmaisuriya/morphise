import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { dueCount, todayGroups } from "../shared/board";
import { agentsBoardSettings } from "../shared/agents-board";
import { inboxSettings } from "../shared/inbox";
import { AgentsBoardView } from "./agents-board/board";
import { TasksBoard } from "./board/board";
import { bookmarksOf } from "./bookmark-store";
import { Bookmarks, waitingItems, WaitingView } from "./inbox";
import { useValue } from "./profile-store";
import { useReminderClock } from "./reminder-clock";
import type { SurfaceDeps } from "./task-surfaces";
import { tasksOf } from "./task-store";
import { lendScreenOpener } from "./dispatch";
import { Icon, type Tokens, useTokens } from "./ui/kit";
import { StackViewerHost } from "./polish/media/views";
import { FOCUS_SCOPE, useTooltip } from "./web";

// Workbench: everything that needs the user, in one place. Chats waiting on them (raised by agents) and
// their own tasks (Today, Board, Archived), plus bookmarked answers. A list of views on the left on
// wide screens, tabs along the top on phones.

export const WORKBENCH_SCREEN_ID = "workbench";
// Earlier versions opened these two; they still open the Workbench, on the view they used to show.
export const LEGACY_SCREENS = { tasks: "board", inbox: "waiting" } as const;

export type WorkbenchView = "waiting" | "today" | "board" | "bookmarks" | "archived";
const VIEWS: readonly WorkbenchView[] = ["board", "waiting", "today", "bookmarks", "archived"];
// Board shows the user's tasks or every agent, by a pair of tabs at its top.
type BoardTab = "tasks" | "agents";
// Below this width the views sit in a row of tabs instead of a list.
const RAIL_FROM = 720;
const RAIL_WIDTH = 176;
const RAIL_FOLDED = 52;

// The rail folded to icons, on this device.
// The rail folded to icons, and the Board's last tab, on this device.
const workbenchSettings = defineSettings({ id: "workbench", scope: "device", version: 1, schema: z.object({ railFolded: z.boolean().default(false), boardTab: z.enum(["tasks", "agents"]).catch("agents").default("agents") }) });

// "agents" was a view of its own before 0.19.2; it now opens Board on its Agents tab.
function viewParam(params: PluginScreenProps["params"]): { view: WorkbenchView; tab?: BoardTab } | null {
  const asked = typeof params.view === "string" ? params.view : typeof params.tab === "string" ? params.tab : null;
  if (asked === "agents") return { view: "board", tab: "agents" };
  const view = VIEWS.find((item) => item === asked);
  return view ? { view, tab: view === "board" ? "tasks" : undefined } : null;
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

// One list, without group headings, in this order.
const ENTRIES: readonly { view: WorkbenchView; label: string; icon: string }[] = [
  { view: "board", label: "Board", icon: "Columns3" },
  { view: "waiting", label: "Waiting", icon: "Inbox" },
  { view: "today", label: "Today", icon: "CalendarClock" },
  { view: "archived", label: "Archived", icon: "Archive" },
  { view: "bookmarks", label: "Bookmarks", icon: "Bookmark" },
];

function countOf(view: WorkbenchView, counts: Counts): number {
  return view === "waiting" ? counts.waiting : view === "today" ? counts.today : view === "bookmarks" ? counts.bookmarks : view === "archived" ? counts.archived : 0;
}

// The count's colour: amber while something needs permission or a reminder is due.
function countTone(view: WorkbenchView, counts: Counts, t: Tokens): string {
  if (view === "waiting" && counts.permission) return t.c.statusWarning;
  if (view === "today" && counts.due) return t.c.statusWarning;
  return t.c.foregroundMuted;
}

// Board's two tabs: plain words with a thin line under the chosen one.
function BoardTabs({ t, tab, onChange }: { t: Tokens; tab: BoardTab; onChange(tab: BoardTab): void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 18, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.c.border }}>
      {(["tasks", "agents"] as const).map((item) => {
        const selected = item === tab;
        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item)}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ height: 36, justifyContent: "center", borderBottomWidth: 2, marginBottom: -1, borderBottomColor: selected ? t.c.foreground : "transparent", opacity: selected || hovered ? 1 : 0.7 })}
          >
            <Text style={{ fontSize: 13, color: selected ? t.c.foreground : t.c.foregroundMuted, fontWeight: selected ? "600" : "400" }}>{item === "tasks" ? "Tasks" : "Agents"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RailRow({ t, view, label, icon, count, tone, selected, folded, onPress }: { t: Tokens; view: WorkbenchView; label: string; icon: string; count: number; tone: string; selected: boolean; folded: boolean; onPress(): void }) {
  // Folded to an icon, the view's name shows on hover.
  const tooltip = useTooltip(folded ? (count ? `${label}, ${count}` : label) : undefined, t.c);
  return (
    <Pressable
      ref={tooltip}
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
        justifyContent: folded ? "center" : "flex-start",
        borderRadius: t.radius.row,
        backgroundColor: selected ? t.c.surface2 : pressed || hovered ? t.c.surface1 : "transparent",
      })}
      testID={`workbench-view-${view}`}
    >
      <View>
        <Icon name={icon} size={15} color={selected ? t.c.foreground : t.c.foregroundMuted} />
        {/* Folded, a count becomes a dot on the icon, in the count's colour. */}
        {folded && count ? <View style={{ position: "absolute", top: -2, right: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: tone === t.c.foregroundMuted ? t.c.foreground : tone }} /> : null}
      </View>
      {folded ? null : (
        <>
          <Text style={{ flex: 1, fontSize: 14, color: t.c.foreground, fontWeight: selected ? "600" : "400" }} numberOfLines={1}>
            {label}
          </Text>
          {count ? <Text style={{ fontSize: 12, color: tone }}>{count}</Text> : null}
        </>
      )}
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
    // Board's Agents tab shows unless its setting turns it off.
    const boardSettings = useSettings(agentsBoardSettings);
    const agentsShown = boardSettings.status !== "ready" || boardSettings.values.enabled;
    const entries = ENTRIES;
    const asked = viewParam(params);
    // A tab the user pressed is remembered on the device; one a link asked for applies to that opening only.
    const [pickedTab, setPickedTab] = useState<BoardTab | null>(null);
    const [linkedTab, setLinkedTab] = useState<BoardTab | null>(null);
    // Each opening asks again, even for the view it asked for last time.
    useEffect(() => {
      if (!asked) return;
      setView(asked.view);
      setLinkedTab(asked.tab ?? null);
    }, [asked?.view, asked?.tab, params]);
    const view: WorkbenchView = picked ?? asked?.view ?? fallback ?? (counts.waiting ? "waiting" : counts.today ? "today" : "board");
    const [width, setWidth] = useState(0);
    const rail = !layout.compact && width >= RAIL_FROM;
    const railSettings = useSettings(workbenchSettings);
    const savedFolded = railSettings.status === "ready" ? railSettings.values.railFolded : false;
    // The fold the user chose here applies at once and is saved until the stored value matches,
    // so a press before the settings load, or a save refused for an old revision, is not lost.
    const [chosenFolded, setChosenFolded] = useState<boolean | null>(null);
    const folded = chosenFolded ?? savedFolded;
    const toggleFolded = () => setChosenFolded(!folded);
    useEffect(() => {
      if (chosenFolded === null || railSettings.status !== "ready" || railSettings.saving || railSettings.values.railFolded === chosenFolded) return;
      void railSettings.save({ ...railSettings.values, railFolded: chosenFolded }, railSettings.revision);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chosenFolded, railSettings.status, railSettings.saving, railSettings.status === "ready" ? railSettings.revision : null]);
    const openChat = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : null;
    const workspaces = useValue(deps.workspaces);
    // The Board's tab: the one picked here, else the one last used on this device; saved like the fold.
    const savedTab: BoardTab = railSettings.status === "ready" ? railSettings.values.boardTab : "agents";
    const boardTab: BoardTab = agentsShown ? linkedTab ?? pickedTab ?? savedTab : "tasks";
    // Board waits for both settings, so it never shows the Agents tab for a moment when it is off or not the saved tab.
    const boardReady = boardSettings.status !== "loading" && railSettings.status !== "loading";
    const pickTab = (tab: BoardTab) => {
      setLinkedTab(null);
      setPickedTab(tab);
    };
    useEffect(() => {
      if (pickedTab === null || railSettings.status !== "ready" || railSettings.saving || railSettings.values.boardTab === pickedTab) return;
      void railSettings.save({ ...railSettings.values, boardTab: pickedTab }, railSettings.revision);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickedTab, railSettings.status, railSettings.saving, railSettings.status === "ready" ? railSettings.revision : null]);

    const content =
      view === "waiting" ? (
        <WaitingView deps={deps} theme={theme} compact={layout.compact} navigation={navigation} />
      ) : view === "bookmarks" ? (
        <Bookmarks t={t} deps={deps} workspaces={workspaces} open={openChat} />
      ) : view === "board" ? (
        !boardReady ? null : <View style={{ flex: 1 }}>
          {agentsShown ? <BoardTabs t={t} tab={boardTab} onChange={pickTab} /> : null}
          {boardTab === "agents" ? (
            <AgentsBoardView client={deps.client} workspaces={deps.workspaces} theme={theme} compact={layout.compact} navigation={navigation} />
          ) : (
            <TasksBoard key="board" deps={deps} theme={theme} compact={layout.compact} workspaceId={null} initialTab="board" openChat={openChat} embedded />
          )}
        </View>
      ) : (
        <TasksBoard key={view} deps={deps} theme={theme} compact={layout.compact} workspaceId={null} initialTab={view} openChat={openChat} embedded />
      );

    return (
      <View {...FOCUS_SCOPE} style={{ flex: 1, flexDirection: rail ? "row" : "column", backgroundColor: theme.colors.surface0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {rail ? (
          <View accessibilityRole="tablist" style={{ width: folded ? RAIL_FOLDED : RAIL_WIDTH, padding: folded ? 6 : 8, gap: 2, borderRightWidth: 1, borderRightColor: t.c.border }}>
            {entries.map((entry) => (
              <RailRow key={entry.view} t={t} view={entry.view} label={entry.label} icon={entry.icon} count={countOf(entry.view, counts)} tone={countTone(entry.view, counts, t)} selected={view === entry.view} folded={folded} onPress={() => setView(entry.view)} />
            ))}
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={folded ? "Show the list of views" : "Fold the list of views to icons"}
              onPress={toggleFolded}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", justifyContent: folded ? "center" : "flex-start", gap: 8, height: t.control, paddingHorizontal: 10, borderRadius: t.radius.row, backgroundColor: pressed || hovered ? t.c.surface1 : "transparent" })}
            >
              <Icon name={folded ? "PanelLeftOpen" : "PanelLeftClose"} size={15} color={t.c.foregroundMuted} />
              {folded ? null : <Text style={t.text.meta}>Fold</Text>}
            </Pressable>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: t.c.border }} contentContainerStyle={{ padding: 8, gap: 4 }} accessibilityRole="tablist">
            {entries.map((entry) => {
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
      <>
        <SidebarRow
          icon="LayoutDashboard"
          label={counts.due ? `Workbench · ${counts.due} due` : "Workbench"}
          active={active}
          onPress={() => openScreen({ screenId: WORKBENCH_SCREEN_ID })}
          trailing={counts.waiting ? <Text style={{ fontSize: 12, color: counts.permission ? theme.colors.statusWarning : theme.colors.foregroundMuted, paddingRight: 8 }}>{counts.waiting}</Text> : null}
        />
        {/* Always mounted with this row, so it shows the viewer for image stacks in Paseo's own replies. */}
        <StackViewerHost />
      </>
    );
  };
}
