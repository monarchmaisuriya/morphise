import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { dueCount, todayGroups } from "../shared/board";
import { agentsBoardSettings } from "../shared/agents-board";
import { inboxSettings } from "../shared/inbox";
import { AgentsBoardView } from "./agents-board/board";
import { TasksBoard } from "./board/board";
import { bookmarksOf } from "./bookmark-store";
import { useDeviceChoice, workbenchSettings } from "./device-choices";
import { Bookmarks, waitingItems } from "./inbox";
import { useValue } from "./profile-store";
import { useReminderClock } from "./reminder-clock";
import type { SurfaceDeps } from "./task-surfaces";
import { tasksOf } from "./task-store";
import { lendScreenOpener } from "./dispatch";
import { Icon, type Tokens, useTokens } from "./ui/kit";
import { StackViewerHost } from "./polish/media/views";
import { FOCUS_SCOPE, useTooltip } from "./web";

// Workbench: everything that needs the user, in one place. Chats waiting on them (raised by agents) and
// their own tasks (Agents, Tasks, whose Filter shows Today and Archived too), plus bookmarked answers. Tabs along the top,
// or a list at the side on wide screens when picked in Settings.

export const WORKBENCH_SCREEN_ID = "workbench";
// Earlier versions opened these two; they still open the Workbench, on the view that now holds what they showed.
export const LEGACY_SCREENS = { tasks: "board", inbox: "waiting" } as const;

// "board" is the Tasks view: its id from before 0.20, so links to it keep working.
export type WorkbenchView = "agents" | "board" | "bookmarks";
const VIEWS: readonly WorkbenchView[] = ["agents", "board", "bookmarks"];
// What Tasks shows when it opens: its columns, or the Today or Archived list (views of their own before 0.20.2).
type TasksStart = "board" | "today" | "archived";
// Below this width the views sit in a row of tabs instead of a list.
const RAIL_FROM = 720;
const RAIL_WIDTH = 176;
const RAIL_FOLDED = 52;


const askedName = (params: PluginScreenProps["params"]) => (typeof params.view === "string" ? params.view : typeof params.tab === "string" ? params.tab : null);

// The view a link or an old screen asks for. "waiting" (the Inbox, before 0.20) opens Agents, which lists what waits
// on the user first; "tasks" opens Tasks, and "today" and "archived" (views of their own before 0.20.2) open Tasks showing
// that list (Filter, Show).
function viewParam(params: PluginScreenProps["params"]): WorkbenchView | null {
  const asked = askedName(params);
  if (asked === "waiting" || asked === "inbox") return "agents";
  if (asked === "tasks" || asked === "today" || asked === "archived") return "board";
  return VIEWS.find((item) => item === asked) ?? null;
}

// The counts each view shows, kept current.
function useWorkbenchCounts(deps: SurfaceDeps) {
  const taskState = useValue(deps.tasks);
  const document = tasksOf(taskState);
  const now = useReminderClock(document.tasks.flatMap((task) => (task.reminder ? [task.reminder] : [])), true);
  const list = useValue(deps.attention);
  const workspaces = useValue(deps.workspaces);
  const settings = useSettings(inboxSettings);
  const attentionReady = useValue(deps.attentionReady);
  // The task document has arrived, or its stream failed (then it never will).
  const tasksReady = taskState.event !== null || taskState.connectionError !== null;
  const cleared = new Set(settings.status === "ready" ? settings.values.cleared : []);
  const waiting = waitingItems(list, workspaces, cleared);
  return {
    // Null until the agents and this device's cleared list have loaded, so nothing is decided on an empty or
    // uncleared count.
    waiting: settings.status === "loading" || !attentionReady ? null : waiting.length,
    // Null until the task document arrives, for the same reason.
    tasksLoaded: tasksReady,
    permission: waiting.some((item) => item.reason === "permission"),
    today: todayGroups(document, now).reduce((sum, group) => sum + group.tasks.length, 0),
    due: dueCount(document, now),
    bookmarks: bookmarksOf(useValue(deps.bookmarks)).bookmarks.length,
  };
}

type Counts = ReturnType<typeof useWorkbenchCounts>;

// One list, without group headings, in this order.
const ENTRIES: readonly { view: WorkbenchView; label: string; icon: string }[] = [
  { view: "agents", label: "Agents", icon: "Bot" },
  { view: "board", label: "Tasks", icon: "SquareKanban" },
  { view: "bookmarks", label: "Bookmarks", icon: "Bookmark" },
];

// Agents counts the agents waiting on the user (it lists them first).
function countOf(view: WorkbenchView, counts: Counts): number {
  // Tasks counts what is due today (its Filter, Show, Today lists it).
  return view === "agents" ? counts.waiting ?? 0 : view === "board" ? counts.today : view === "bookmarks" ? counts.bookmarks : 0;
}

// The count's colour: amber while something needs permission or a reminder is due.
function countTone(view: WorkbenchView, counts: Counts, t: Tokens): string {
  if (view === "agents" && counts.permission) return t.c.statusWarning;
  if (view === "board" && counts.due) return t.c.statusWarning;
  return t.c.foregroundMuted;
}

// One view as a tab along the top, drawn as Paseo draws its chat tabs: a 28 pt chip with a 14 pt icon and a muted
// label; the chosen one filled and in the text colour, a hovered one lightly filled.
function WorkbenchTab({ t, label, icon, count, countTone, selected, onPress }: { t: Tokens; label: string; icon: string; count: number; countTone: string; selected: boolean; onPress(): void }) {
  const [hovered, setHovered] = useState(false);
  const lit = selected || hovered;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, height: t.compact ? 32 : 28, paddingHorizontal: 8, marginHorizontal: 2, borderRadius: 6, backgroundColor: selected ? t.c.surface2 : hovered ? t.c.surface1 : "transparent" }}
    >
      <Icon name={icon} size={14} color={lit ? t.c.foreground : t.c.foregroundMuted} />
      <Text style={{ fontSize: 14, color: lit ? t.c.foreground : t.c.foregroundMuted }} numberOfLines={1}>
        {label}
      </Text>
      {count ? <Text style={{ fontSize: 12, color: countTone, fontVariant: ["tabular-nums"] }}>{count}</Text> : null}
    </Pressable>
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

export function createWorkbenchScreen(deps: SurfaceDeps, fallback: string | null = null) {
  const fallbackView = fallback ? viewParam({ view: fallback }) : null;
  return function WorkbenchScreen({ theme, layout, params, navigation }: PluginScreenProps) {
    const t = useTokens(theme, layout.compact);
    const counts = useWorkbenchCounts(deps);
    // The view picked here or asked for when opened. Until then, decided once when the counts load: Agents while
    // something waits on the user, else Tasks with Today on when something is due, else whichever of Agents and Tasks was last
    // opened on this device. It holds for this opening, even as the user clears what waited.
    const [picked, setView] = useState<WorkbenchView | null>(null);
    // The Agents view is listed unless its setting turns it off; it still opens when something waits on the user or
    // a link asks for it, since it is the only place to answer those agents.
    const boardSettings = useSettings(agentsBoardSettings);
    const agentsShown = boardSettings.status !== "ready" || boardSettings.values.enabled;
    const asked = viewParam(params);
    // Which list Tasks starts on: the one a link asked for ("today", "archived"), the columns once the user picks Tasks;
    // null until either happens.
    const [tasksStartChosen, setTasksStart] = useState<TasksStart | null>(null);
    const startOf = (name: string | null): TasksStart => (name === "today" || name === "archived" ? name : "board");
    // Each opening asks again, even for the view it asked for last time; counting openings lets a link start Tasks on its
    // list again after the user switched away from it.
    const [openings, setOpenings] = useState(0);
    useEffect(() => {
      if (!asked) return;
      setView(asked);
      setTasksStart(startOf(askedName(params)));
      setOpenings((count) => count + 1);
    }, [asked, params]);
    const [width, setWidth] = useState(0);
    const railSettings = useSettings(workbenchSettings);
    // Tabs along the top unless this device picked the side list (Settings, General), which needs a wide window.
    const [nav] = useDeviceChoice(railSettings, "workbenchNav");
    const rail = nav === "rail" && !layout.compact && width >= RAIL_FROM;
    const [folded, setFolded] = useDeviceChoice(railSettings, "railFolded");
    const toggleFolded = () => setFolded(!folded);
    const [lastBoard, saveLastBoard] = useDeviceChoice(railSettings, "boardTab");
    // Picked in Settings, General.
    const [agentsLayout] = useDeviceChoice(railSettings, "agentsLayout");
    const lastOpened: WorkbenchView = lastBoard === "agents" && agentsShown ? "agents" : "board";
    const countsReady = counts.waiting !== null && counts.tasksLoaded && railSettings.status !== "loading" && boardSettings.status !== "loading";
    const opening = useRef<WorkbenchView | null>(null);
    const openedForToday = useRef(false);
    if (opening.current === null && countsReady) {
      openedForToday.current = (counts.waiting ?? 0) === 0 && counts.today > 0;
      opening.current = (counts.waiting ?? 0) > 0 ? "agents" : openedForToday.current ? "board" : lastOpened;
    }
    const view: WorkbenchView = picked ?? asked ?? fallbackView ?? opening.current ?? lastOpened;
    // No entry looks chosen until the view is known, so the selection does not jump once the counts load.
    const decided = picked !== null || asked !== null || fallbackView !== null || opening.current !== null;
    const entries = agentsShown || (counts.waiting ?? 0) > 0 || view === "agents" ? ENTRIES : ENTRIES.filter((entry) => entry.view !== "agents");
    const pick = (next: WorkbenchView) => {
      setView(next);
      if (next === "board") setTasksStart("board");
      if (next === "agents" || next === "board") saveLastBoard(next === "agents" ? "agents" : "tasks");
    };
    const openChat = navigation ? (agentId: string) => navigation.openAgent({ agentId }) : null;
    const workspaces = useValue(deps.workspaces);
    // Agents and Tasks wait for the settings and counts, so neither shows for a moment before the opening view is known.
    const ready = countsReady;
    const tasksStart: TasksStart = tasksStartChosen ?? (asked ? startOf(askedName(params)) : openedForToday.current ? "today" : "board");

    const content =
      view === "bookmarks" ? (
        <Bookmarks t={t} deps={deps} workspaces={workspaces} open={openChat} />
      ) : (view === "agents" || view === "board") && !ready ? null : view === "agents" ? (
        <AgentsBoardView client={deps.client} workspaces={deps.workspaces} theme={theme} compact={layout.compact} navigation={navigation} layout={agentsLayout} bookmarkLastAnswer={deps.bookmarkLastAnswer} />
      ) : view === "board" ? (
        // Today or Archived shows when a link asked for it, or Today when the Workbench opened for what is due; Filter
        // changes it after.
        <TasksBoard key={`board:${tasksStart}:${openings}`} deps={deps} theme={theme} compact={layout.compact} workspaceId={null} initialTab={tasksStart} openChat={openChat} />
      ) : null;

    return (
      <View {...FOCUS_SCOPE} style={{ flex: 1, flexDirection: rail ? "row" : "column", backgroundColor: theme.colors.surface0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {rail ? (
          <View accessibilityRole="tablist" style={{ width: folded ? RAIL_FOLDED : RAIL_WIDTH, padding: folded ? 6 : 8, gap: 2, borderRightWidth: 1, borderRightColor: t.c.border }}>
            {entries.map((entry) => (
              <RailRow key={entry.view} t={t} view={entry.view} label={entry.label} icon={entry.icon} count={countOf(entry.view, counts)} tone={countTone(entry.view, counts, t)} selected={decided && view === entry.view} folded={folded} onPress={() => pick(entry.view)} />
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: t.c.border, backgroundColor: t.c.surface0 }} contentContainerStyle={{ height: t.compact ? 44 : 36, alignItems: "center", paddingHorizontal: 4 }} accessibilityRole="tablist">
            {entries.map((entry) => (
              <WorkbenchTab key={entry.view} t={t} label={entry.label} icon={entry.icon} count={countOf(entry.view, counts)} countTone={countTone(entry.view, counts, t)} selected={decided && view === entry.view} onPress={() => pick(entry.view)} />
            ))}
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
