import {
  type AgentRef,
  type Group,
  openExternalUrl,
  type PluginHostSummary,
  type PluginSidebarViewProps,
  type ProjectRef,
  type TerminalRef,
  type WorkspaceRef,
  useAgent,
  useAgents,
  useHosts,
  usePaseo,
  useProject,
  useProjects,
  useSettings,
  useTerminals,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import type { PluginAgentSnapshot, PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  capRows,
  compareWorkspaces,
  type Filter,
  groupKeys,
  headingKind,
  isProtected,
  isVisible,
  matchesFilter,
  type NestedGroup,
  nestInGroups,
  emptyProjectsToList,
  byLastUsed,
  orderGroupsByLastUsed,
  orderGroups,
  STATUS_TITLES,
  workspaceName,
} from "../shared/arrange";
import { createGroup, type Decoration, deleteGroup, dropGroup, dropProject, EMPTY_PROJECT_GROUPS, groupOrderSettings, moveGroup, moveProject, newGroupId, type ProjectGroups, projectGroupsSettings, renameGroup, setDecoration } from "../shared/project-groups";
import { DecorIcon, DecorPicker } from "./decor-picker";
import { openChat } from "./stats/session-stats";
import type { RemoveProjectResult } from "../shared/project-actions";
import { type DragApi, DragGhost, useBoardDrag, useCardDragHandlers } from "./board/drag";
import { attentionOrder, NEEDS_ME, needsAttention, needsMeOn, nextAttention } from "../shared/attention";
import { chatGroupKey, chatIndicator, chatMatches, chatName, compareChats, isSidebarChat } from "../shared/chat-status";
import { branchSegments, parentStem } from "../shared/tree-lines";
import { INDICATORS, type Indicator, type Profile } from "../shared/profile";
import { stepsOptions } from "../shared/steps";
import { type AttentionList, waitingChildren } from "./attention";
import { type ChatListing, chatTree, DEFAULT_CHAT_ROWS, DEFAULT_REMINDER_ROWS, effectiveIndicator, listedChatKeys, listedSubAgents, listedTopChats, listsChats, MARK_KEY, markApplies, owningRowKey, type RowShows, rowShows, rowTitle, runningShownBelow, statusLine } from "../shared/row-meta";
import { newTaskId } from "./board/card-editor";
import { isDue, type Reminder } from "../shared/reminders";
import { formatDue, formatElapsed } from "../shared/time-text";
import { sidebarLook, type ViewState, viewStateSettings } from "../shared/view-state";
import { createValueStore, type ValueStore, useValue } from "./profile-store";
import { refOn, registerShowNavigator } from "./show";
import { useReminderClock } from "./reminder-clock";
import { type AlertEntry, remindersOf } from "./reminder-alerts";
import { type PickerDeps, ReminderPicker, type ReminderTarget } from "./reminder-picker";
import { followUpTask, snoozeTime, workspaceTask } from "../shared/task-ops";
import { type ApplyTaskOperations, type TaskStore, tasksOf } from "./task-store";
import { Button, Dropdown, Field, Icon, IconButton, MenuItem, PopoverHost, Segmented, Tag, type Tokens, useTokens } from "./ui/kit";
import { BLUE, DONE_OPACITY, PURPLE, statusColor, tileColor, withAlpha } from "./ui/hues";
import { usePulse } from "./ui/pulse";
import { StepsCards } from "./steps-card";
import { DISPATCH_ICON, DISPATCH_SCREEN_ID, screenOpener } from "./dispatch";
import type { PullRequestInfo, ServiceInfo, WorkspaceInfo } from "./workspaces";
import { archiveConfirm, atRiskOfArchive, type HostWorkspace, markableDone, useHostAttention, useHostWorkspaces } from "./host-workspaces";
import { viewPresence } from "./view-presence";
import { createHoverTracker, type HoverTracker, useHovered } from "./hover-tracker";
import { afterPointerMoves, cannotHover } from "./web";

type ViewConfig = Profile["sidebar"]["view"];
type Theme = PluginSidebarViewProps["theme"];



const DEFAULT_VIEW_STATE: ViewState = viewStateSettings.schema.parse({});
// Touch screens get finger-sized rows and always-visible row buttons. Paseo reports its sidebar as
// "compact" on desktop too, so the input decides this (no hover), not the layout.
const TOUCH = cannotHover();
const REMINDERS_GROUP = "reminders";

// Search text, the open menu and expanded groups live outside the view, so they survive the view
// being rebuilt when its options change.
// Selection mode (bulk actions) lives here too: workspace keys, so it survives a rebuild and each
// action goes to the workspace's own host.
const viewUi = createValueStore<{ search: string; menu: "filter" | "view" | null; expanded: readonly string[]; selecting: boolean; selected: readonly string[] }>({
  search: "",
  menu: null,
  expanded: [],
  selecting: false,
  selected: [],
});

// When the open workspace became the open one, kept outside the view: every Display change
// rebuilds the view, and a fresh ref would make a just-set Unread mark look older than the visit.
const openedAt: { key: string | null; at: number } = { key: null, at: 0 };

const toggleSelected = (workspaceKey: string) => {
  const ui = viewUi.get();
  viewUi.set({ ...ui, selected: ui.selected.includes(workspaceKey) ? ui.selected.filter((key) => key !== workspaceKey) : [...ui.selected, workspaceKey] });
};

// Sizes match Paseo's own sidebar (measured on 0.16.0-beta.1): 36px rows inset 8px with an 8px
// radius, 14px titles, 12px muted section labels and dimmer 12px times; the selected row uses
// surface2. "Comfortable" density adds 4px to each row.
function viewStyles(theme: Theme, config: ViewConfig, look: ReturnType<typeof sidebarLook>) {
  const c = theme.colors;
  // "Compact" is Paseo's own 36px row; "comfortable" adds air.
  const { height, childHeight, textSize, groupGap, rowPad } = look;
  // Rows and their chat lines move in by the indent beyond the usual 8.
  const shift = rowPad - 8;
  return {
    scroll: { flex: 1 },
    header: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: 36, paddingHorizontal: 8, gap: 2 },
    headerDivider: { width: 1, height: 14, marginHorizontal: 4, backgroundColor: c.border },
    tools: { paddingHorizontal: 8, paddingBottom: 6, gap: 6 },
    // More space above a heading than below it: the heading belongs to the rows that follow.
    heading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, minHeight: 28, paddingLeft: 16, paddingRight: 12, marginTop: groupGap },
    headingText: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1, fontWeight: look.boldGroups ? ("600" as const) : ("400" as const) },
    count: { color: c.foregroundMuted, fontSize: 12, opacity: 0.6 },
    // Paseo's measured columns: tiles and status dots share a 16px slot at x=16; text starts at x=40.
    project: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TOUCH ? 44 : 40, marginHorizontal: 8, marginTop: 10, paddingLeft: rowPad, paddingRight: 4, borderRadius: 8, gap: 2 },
    projectMain: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: 8, minHeight: TOUCH ? 44 : 40 },
    tile: { width: 16, height: 16, borderRadius: 4, alignItems: "center" as const, justifyContent: "center" as const },
    // This device's "Folder icons": off leaves a project's tile slot empty (its fold chevron still shows on hover).
    projectIcons: look.projectIcons,
    tileText: { color: "#ffffff", fontSize: 10, fontWeight: "600" as const },
    projectText: { color: c.foregroundMuted, fontSize: 14, flexShrink: 1 },
    row: { minHeight: height, marginHorizontal: 8, paddingLeft: rowPad, paddingRight: 6, borderRadius: 8, flexDirection: "row" as const, alignItems: "center" as const, gap: 2 },
    rowMain: { flex: 1, minWidth: 0, minHeight: height, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    // Two-line rows: the status mark and time line up with the title line.
    twoLine: { alignItems: "flex-start" as const, paddingVertical: 6 },
    // ...and so do the row's buttons: centred on that 20pt line (6pt down), not on the whole row.
    actions: { flexDirection: "row" as const, alignItems: "center" as const },
    actionsTwoLine: { alignSelf: "flex-start" as const, paddingTop: 6 + 10 - (TOUCH ? 32 : 24) / 2 },
    lines: { flex: 1, minWidth: 0, gap: 1 },
    line: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, minHeight: 20 },
    subLine: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, minHeight: 16, overflow: "hidden" as const },
    meta: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1 },
    // Chats hang off a thin line under their workspace's status mark, sub-agents off one under their chat's.
    branchDown: { position: "absolute" as const, top: 0, bottom: 0, width: 1, backgroundColor: c.border },
    branchTurn: { position: "absolute" as const, top: 0, borderLeftWidth: 1, borderBottomWidth: 1, borderBottomLeftRadius: 6, borderColor: c.border },
    branchTee: { position: "absolute" as const, height: 1, backgroundColor: c.border },
    // Where each kind of row's line sits: x of the line, x where the row's status slot starts, and the row's middle
    // (every chat and sub-agent row is `childHeight` tall, set by `child` and `childMain`).
    branch: {
      chat: { x: 23 + shift, to: 32 + shift, middle: childHeight / 2 },
      sub: { x: 39 + shift, to: 52 + shift, middle: childHeight / 2 },
      more: 14,
    },
    slot: { width: 16, alignItems: "center" as const, justifyContent: "center" as const },
    child: { paddingLeft: 24 + shift, minHeight: childHeight },
    // A sub-agent sits one step further in, under its parent chat.
    grandchild: { paddingLeft: 44 + shift, minHeight: childHeight },
    // The pressable inside a chat or sub-agent row: as tall as the row, not a workspace row's `height`.
    childMain: { minHeight: childHeight },
    // The open row: the theme's second surface, softened so it does not weigh more than the rows around it.
    selected: { backgroundColor: withAlpha(c.surface2, 0.7) ?? c.surface2 },
    hovered: { backgroundColor: c.surface1 },
    label: { color: c.foreground, fontSize: textSize, flexShrink: 1 },
    childLabel: { color: c.foregroundMuted, fontSize: 13, flexShrink: 1 },
    secondary: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1, opacity: 0.75 },
    time: { color: c.foregroundMuted, fontSize: 12, opacity: 0.7, marginLeft: "auto" as const },
    added: { color: c.statusSuccess, fontSize: 12 },
    removed: { color: c.statusDanger, fontSize: 12 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    more: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, minHeight: 32, marginHorizontal: 8, paddingLeft: 10, borderRadius: 8 },
    moreText: { color: c.foregroundMuted, fontSize: 14 },
    bulk: { flexDirection: "row" as const, alignItems: "center" as const, gap: 2, minHeight: 40, paddingLeft: 16, paddingRight: 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface1 },
    empty: { color: c.foregroundMuted, fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  };
}

type Styles = ReturnType<typeof viewStyles>;

interface Shared {
  props: PluginSidebarViewProps;
  styles: Styles;
  t: Tokens;
  config: ViewConfig;
  now: Date;
  // The soonest reminder on any chat of each workspace.
  workspaceReminders: ReadonlyMap<string, Reminder>;
  // The status chips also filter chats listed under a workspace.
  statuses: readonly Indicator[];
  // Each chat's own reminder (on its follow-up task), for the alarm button on chat rows.
  chatReminders: ReadonlyMap<string, Reminder>;
  picker: PickerDeps;
  // Clears a task's reminder, or asks again in some minutes.
  done(taskId: string): void;
  later(taskId: string, minutes: number): void;
  // Opens Workbench, Tasks with the task's editor.
  openTask(taskId: string): void;
  // The Display "Show" choices.
  shows: RowShows;
  // Pull requests, checks, services and marks, which Paseo's workspace hooks do not carry, by the
  // workspace's host and id.
  infoOf(reference: { hostId: string; id: string }): HostWorkspace;
  // The host whose task document this app edits (null until known); see `linksTasks`.
  taskHost: string | null;
  // A host's chats waiting on the user, with their pending permission requests, which Paseo's
  // snapshots do not carry.
  attentionOf(hostId: string): AttentionList;
  hosts: readonly PluginHostSummary[];
  // Every label in use, for the row menu's Labels list.
  labels: readonly string[];
  // "Show more" state for groups and for a workspace's chats.
  isExpanded(key: string): boolean;
  setExpanded(key: string, on: boolean): void;
  // Which chats and sub-agents are drawn under a workspace.
  listing: ChatListing;
  // The one row or heading the pointer is over (see hover-tracker.ts).
  hover: HoverTracker;
  // "Your groups": the saved groups, a change to them, and every project by key (for projects with no workspace).
  // `byLastUsed`: groups are ordered by when they were last used (Settings, Sidebar), so they cannot be moved by hand.
  groups: { doc: ProjectGroups; change(operation: (doc: ProjectGroups) => ProjectGroups): void; projectRefs: ReadonlyMap<string, ProjectRef>; byLastUsed: boolean };
  // "Your groups" in the workspace list: dragging projects between groups, and groups up and down (null while groups
  // are ordered by last use); null otherwise.
  drag: { projects: DragApi; groups: DragApi | null } | null;
  removeProject(projectId: string): Promise<RemoveProjectResult>;
}

// The drag column for Ungrouped, which has no group id.
const UNGROUPED_DROP = "~ungrouped";

// Where a dragged project or group will land: a thin accent line.
function DropLine({ shared }: { shared: Shared }) {
  return <View pointerEvents="none" style={{ height: 2, marginHorizontal: 12, marginVertical: 1, borderRadius: 1, backgroundColor: shared.t.c.accent }} />;
}

// The copy that follows the pointer while a project or group is dragged.
function DragPill({ title, shared }: { title: string; shared: Shared }) {
  const { t } = shared;
  return (
    <View style={{ marginHorizontal: 8, paddingHorizontal: 10, minHeight: 32, justifyContent: "center", borderRadius: 8, backgroundColor: t.c.surface2, borderWidth: 1, borderColor: t.c.border }}>
      <Text style={{ color: t.c.foreground, fontSize: 13 }} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

// The group whose name is being edited in its heading (a new group starts so); null for none.
const renamingGroup = createValueStore<string | null>(null);

function report(toast: ReturnType<typeof useToast>, what: string) {
  return (error: unknown) => toast.error(`Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);
}

// The alarm button on a chat row and the reminder picker it opens under the row. Long-pressing the
// row opens it too: Paseo's own chat menu cannot take plugin items.
function useRemindToggle() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((value) => !value), close: () => setOpen(false) };
}

// One sidebar row: the main pressable and its buttons side by side (never nested), inside a hover
// area. As in Paseo, the buttons take the place of the trailing time on hover; they always show
// on touch screens and when they carry state (a set reminder, an armed archive). A long press, or
// a right-click on the web, runs `onLongPress`.
// `stem`: the x of the line its children hang on (`branch.chat.x` or `branch.sub.x`), when it has children listed; the
// line then starts under this row's dot (`parentStem`).
function RowShell({ selected, child, grandchild, twoLine, label, onPress, onLongPress, main, trailing, actions, showActions, disabled, rowRef, onHover, stem, shared }: { selected: boolean; child?: boolean; twoLine?: boolean; label: string; onPress(): void; onLongPress?(): void; main: ReactNode; trailing?: ReactNode; actions?: ReactNode; showActions?: boolean; disabled?: boolean; rowRef?: RefObject<View | null>; onHover?(on: boolean): void; grandchild?: boolean; stem?: number; shared: Shared }) {
  const { styles } = shared;
  const key = useId();
  const hovered = useHovered(shared.hover, key);
  useEffect(() => {
    onHover?.(hovered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);
  const actionsShown = !!actions && (hovered || showActions || TOUCH);
  // Right-click opens the same menu as a long press. React Native Web forwards `onContextMenu`
  // but its Pressable never maps a mouse right-click to `onLongPress`, and React Native's types
  // do not list the prop, so it is passed untyped and on the web only.
  const contextMenu = onLongPress && Platform.OS === "web" ? { onContextMenu: (event: { preventDefault(): void }) => (event.preventDefault(), onLongPress()) } : {};
  return (
    // A plain View, not a Pressable: on web a Pressable becomes a Tab stop even when told not to.
    <View ref={rowRef} onPointerMove={() => shared.hover.mark(key)} style={[styles.row, child ? styles.child : null, grandchild ? styles.grandchild : null, selected ? styles.selected : hovered ? styles.hovered : null]}>
      <Pressable accessibilityRole={disabled ? "text" : "button"} accessibilityLabel={label} disabled={disabled} onPress={onPress} onLongPress={onLongPress} style={[styles.rowMain, child || grandchild ? styles.childMain : null, twoLine ? styles.twoLine : null]} {...contextMenu}>
        {main}
        {actionsShown ? null : trailing}
      </Pressable>
      {actionsShown ? <View style={[styles.actions, twoLine ? styles.actionsTwoLine : null]}>{actions}</View> : null}
      {stem !== undefined ? <View pointerEvents="none" style={[styles.branchDown, parentStem({ x: stem, inset: styles.row.marginHorizontal, dotFromTop: twoLine ? styles.twoLine.paddingVertical + STATUS_LINE / 2 : null })]} /> : null}
    </View>
  );
}


// The height of the line the status mark sits on (a two-line row's title line).
const STATUS_LINE = 20;
// Dots on rows that hang off a branch (chats, sub-agents) are lighter than their parent's dot.
const BRANCH_DOT_OPACITY = 0.7;

// The status mark in the same 16px column as project tiles, as Paseo draws it. Running work pulses.
// `still`: running work drawn by the rows under this one, which pulse instead.
// `branch`: the row hangs off a tree line; its dot is dimmed on top of the pulse and the done opacity.
function StatusMark({ indicator, still = false, branch = false, shared }: { indicator: Indicator; still?: boolean; branch?: boolean; shared: Shared }) {
  const pulse = usePulse(indicator === "running" && !still);
  return (
    <View style={[shared.styles.slot, { height: STATUS_LINE, opacity: branch ? BRANCH_DOT_OPACITY : 1 }]}>
      <Animated.View accessibilityLabel={STATUS_TITLES[indicator]} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(shared.props.theme.colors, indicator), opacity: indicator === "done" ? DONE_OPACITY : pulse }} />
    </View>
  );
}

// Pulsing placeholder rows until the first workspace list arrives.
function LoadingRows({ shared }: { shared: Shared }) {
  const pulse = usePulse(true);
  const { styles, props } = shared;
  const fill = props.theme.colors.surface2;
  return (
    <Animated.View accessibilityLabel="Loading" style={{ opacity: pulse, paddingTop: 8 }}>
      {[72, 50, 64, 42, 58].map((width) => (
        <View key={width} style={styles.row}>
          <View style={[styles.rowMain, { gap: 8 }]}>
            <View style={styles.slot}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fill }} />
            </View>
            <View style={{ height: 10, borderRadius: 5, width: `${width}%`, backgroundColor: fill }} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

// "Show more" and "Show less" under a group or a workspace's chats.
function MoreRow({ label, spoken, icon, count, child, grandchild, onPress, shared }: { label: string; spoken: string; icon: string; count?: number; child?: boolean; grandchild?: boolean; onPress(): void; shared: Shared }) {
  const { styles, props } = shared;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress} style={[styles.more, child || grandchild ? { paddingLeft: grandchild ? 46 : 26, minHeight: 28 } : null]}>
      <Icon name={icon} size={child || grandchild ? 12 : 14} color={props.theme.colors.foregroundMuted} />
      <Text style={[styles.moreText, child || grandchild ? { fontSize: 13 } : null]}>{label}</Text>
      {count ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

// A task link holds a bare workspace or chat id, which names one on the task document's own host.
// So tasks, reminders and their lookups apply only to that host's rows; until it is known, to none.
function linksTasks(shared: Shared, hostId: string): boolean {
  return shared.taskHost !== null && hostId === shared.taskHost;
}

const OTHER_HOST_HINT = "Other host";

function RemindButton({ chat, label, onPress, shared }: { chat: AgentRef; label: string; onPress(): void; shared: Shared }) {
  const { t, now } = shared;
  if (!linksTasks(shared, chat.hostId)) return <IconButton t={t} size="sm" icon="AlarmClock" label={`Reminders are for this host's chats only; ${label} is on another host`} disabled onPress={onPress} />;
  const reminder = shared.chatReminders.get(chat.id);
  const tone = reminder ? (isDue(reminder, now) ? t.c.statusWarning : t.c.accent) : undefined;
  return <IconButton t={t} size="sm" icon="AlarmClock" tone={tone} label={reminder ? `Reminder for ${label}: ${formatDue(reminder, now)}. Change it` : `Remind me about ${label}`} onPress={onPress} />;
}

function InlinePicker({ target, title, onDone, shared }: { target: ReminderTarget; title: string; onDone(): void; shared: Shared }) {
  return (
    <View style={{ marginHorizontal: 8, marginTop: 2, marginBottom: 6, padding: 8, borderWidth: 1, borderRadius: 10, borderColor: shared.t.c.border, backgroundColor: shared.t.c.surface1 }}>
      <ReminderPicker deps={shared.picker} target={target} title={title} theme={shared.props.theme} compact={shared.t.compact} embedded onDone={onDone} />
    </View>
  );
}

// A chat listed under its workspace, or a sub-agent under its chat (`sub`). Only the open one is
// highlighted.
function AgentRow({ reference, sub, subs = [], shared }: { reference: AgentRef; sub?: boolean; subs?: readonly AgentRef[]; shared: Shared }) {
  const { props, styles, now } = shared;
  const chat = useAgent(reference, (item) => ({ name: chatName(item), indicator: chatIndicator(item), workspaceId: item.workspaceId, last: item.lastActivityAt }));
  const remind = useRemindToggle();
  const attention = shared.attentionOf(reference.hostId);
  // Every sub-agent listed under this chat, deeper ones too (chatTree files them under it).
  const subKeys = new Set(subs.map((agent) => agent.key));
  const runningSubs = useAgents({ hosts: [reference.hostId], where: (agent) => subKeys.has(agent.ref.key) && chatIndicator(agent) === "running" });
  const listedSubs = new Set(sub ? [] : listedSubAgents(reference.key, subs, shared.listing).rows.map((agent) => agent.key));
  // Sub-agents of this chat blocked on the user (permission or failed).
  const waiting = waitingChildren(attention, reference.id);
  if (!chat) return null;
  const indicator = withPermission(chat.indicator, attention, reference.id);
  const elapsed = shared.shows.lastActivity ? formatElapsed(chat.last, now) : null;
  return (
    <View>
      <RowShell
        child={!sub}
        grandchild={sub}
        stem={!sub && listedSubs.size > 0 && !remind.open ? styles.branch.sub.x : undefined}
        selected={props.active.agent?.key === reference.key}
        label={`Open chat ${chat.name}, ${STATUS_TITLES[indicator]}`}
        onPress={() => props.navigation.openAgent(reference)}
        onLongPress={linksTasks(shared, reference.hostId) ? remind.toggle : undefined}
        showActions={linksTasks(shared, reference.hostId) && shared.chatReminders.has(reference.id)}
        main={
          <>
            <StatusMark indicator={indicator} still={runningShownBelow(runningSubs, listedSubs)} branch shared={shared} />
            <Text style={styles.childLabel} numberOfLines={1}>
              {chat.name}
            </Text>
            {waiting && !sub ? (
              <Text accessibilityLabel={`${waiting} sub-agents waiting on you`} style={[styles.meta, { color: props.theme.colors.statusWarning }]}>
                {waiting} waiting
              </Text>
            ) : null}
          </>
        }
        trailing={elapsed ? <Text style={styles.time}>{elapsed}</Text> : null}
        actions={<RemindButton chat={reference}label={chat.name} onPress={remind.toggle} shared={shared} />}
        shared={shared}
      />
      {remind.open ? <InlinePicker target={{ kind: "chat", agentId: reference.id, workspaceId: chat.workspaceId, title: chat.name }} title={chat.name} onDone={remind.close} shared={shared} /> : null}
      {!sub && subs.length > 0 ? <SubAgents parent={reference} subs={subs} shared={shared} /> : null}
    </View>
  );
}

// One row (with what hangs under it) on its parent's line. Drawn after the row, so the open row's highlight never hides
// the line: every row's line reaches its status slot, the last with a rounded corner, the rest with a tee
// (`branchSegments`).
function Branch({ x, to, middle, last, children, shared }: { x: number; to: number; middle: number; last: boolean; children: ReactNode; shared: Shared }) {
  const { styles } = shared;
  return (
    <View>
      {children}
      {branchSegments({ x, to, middle }, last).map((segment) => (
        <View
          key={segment.kind}
          pointerEvents="none"
          style={
            segment.kind === "turn"
              ? [styles.branchTurn, { left: segment.left, width: segment.width, height: segment.height }]
              : segment.kind === "tee"
                ? [styles.branchTee, { left: segment.left, top: segment.top, width: segment.width }]
                : [styles.branchDown, { left: segment.left }]
          }
        />
      ))}
    </View>
  );
}

// A chat's sub-agents, latest first: the first few (5 unless changed), then Show more, or only the
// open one when the view shows just that. The open sub-agent stays listed past the limit.
function SubAgents({ parent, subs, shared }: { parent: AgentRef; subs: readonly AgentRef[]; shared: Shared }) {
  const { styles, config } = shared;
  const key = `subs:${parent.key}`;
  const limit = config.subAgentRows ?? DEFAULT_CHAT_ROWS;
  const expanded = shared.isExpanded(key);
  const openOnly = config.showSubAgents === "open";
  const { rows, hidden } = listedSubAgents(parent.key, subs, shared.listing);
  if (rows.length === 0) return null;
  return (
    <View>
      {hangOn(
        styles.branch.sub,
        rows.map((agent) => [agent.key, false, <AgentRow reference={agent} sub shared={shared} />]),
        [
          hidden > 0 ? ["more", true, <MoreRow grandchild icon="ChevronDown" label="Show more" spoken={`Show ${hidden} more sub-agents`} count={hidden} onPress={() => shared.setExpanded(key, true)} shared={shared} />] : null,
          !openOnly && expanded && subs.length > limit ? ["less", true, <MoreRow grandchild icon="ChevronUp" label="Show less" spoken="Show fewer sub-agents" onPress={() => shared.setExpanded(key, false)} shared={shared} />] : null,
        ],
        shared,
      )}
    </View>
  );
}

// Rows and the Show more / Show less rows after them, each on the line; the last one listed takes the turn. A Show
// row (`true`) is shorter than a chat row, so its turn meets it at its own middle.
type Hung = readonly [key: string, short: boolean, row: ReactNode];
function hangOn(place: { x: number; to: number; middle: number }, rows: readonly Hung[], extra: readonly (Hung | null)[], shared: Shared) {
  const all = [...rows, ...extra.filter((item): item is Hung => item !== null)];
  return all.map(([key, short, row], index) => (
    <Branch key={key} x={place.x} to={place.to} middle={short ? shared.styles.branch.more : place.middle} last={index === all.length - 1} shared={shared}>
      {row}
    </Branch>
  ));
}

// A workspace's chats, latest first: the first few (5 unless changed), then Show more. The chat
// holding the open agent (`openKey`) stays listed past the limit.
function WorkspaceChats({ workspaceKey, chats, subsOf, openKey, shared }: { workspaceKey: string; chats: readonly AgentRef[]; subsOf: ReadonlyMap<string, readonly AgentRef[]>; openKey: string | null; shared: Shared }) {
  const { styles, config } = shared;
  const key = `chats:${workspaceKey}`;
  const limit = config.chatRows ?? DEFAULT_CHAT_ROWS;
  const expanded = shared.isExpanded(key);
  const { rows, hidden } = listedTopChats(workspaceKey, chats, shared.listing, openKey);
  return (
    <View>
      {hangOn(
        styles.branch.chat,
        rows.map((chat) => [chat.key, false, <AgentRow reference={chat} subs={shared.config.showSubAgents === false ? [] : subsOf.get(chat.id) ?? []} shared={shared} />]),
        [
          hidden > 0 ? ["more", true, <MoreRow child icon="ChevronDown" label="Show more" spoken={`Show ${hidden} more chats`} count={hidden} onPress={() => shared.setExpanded(key, true)} shared={shared} />] : null,
          expanded && chats.length > limit ? ["less", true, <MoreRow child icon="ChevronUp" label="Show less" spoken="Show fewer chats" onPress={() => shared.setExpanded(key, false)} shared={shared} />] : null,
        ],
        shared,
      )}
    </View>
  );
}

function RowAction({ icon, label, onPress, shared }: { icon: string; label: string; onPress(): void; shared: Shared }) {
  return <IconButton t={shared.t} size="sm" icon={icon} label={label} onPress={onPress} />;
}

// The bar under the list in selection mode: what is selected, and actions on all of it at once.
function BulkBar({ shown, shared }: { shown: ReadonlyMap<string, WorkspaceRef>; shared: Shared }) {
  const { t, styles } = shared;
  const paseo = usePaseo();
  const toast = useToast();
  // Only rows still listed: archived, vanished or filtered-out workspaces drop out of the selection.
  const known = (reference: WorkspaceRef) => {
    const info = shared.infoOf(reference);
    return info === "loading" ? null : info;
  };
  const selected = useValue(viewUi).selected.flatMap((key) => {
    const reference = shown.get(key);
    return reference && known(reference)?.open !== false ? [reference] : [];
  });
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const anchor = useRef<View>(null);
  useEffect(() => {
    if (!confirmArchive) return;
    const timer = setTimeout(() => setConfirmArchive(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmArchive]);
  const finish = () => viewUi.set({ ...viewUi.get(), selecting: false, selected: [] });
  // Runs one action on every selected workspace and reports how many failed, not just the first.
  const each = async (what: string, references: readonly WorkspaceRef[], run: (workspace: ReturnType<typeof paseo.workspaces.ref>, reference: WorkspaceRef) => Promise<unknown>) => {
    const results = await Promise.allSettled(references.map((reference) => run(paseo.workspaces.ref(reference), reference)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed) toast.error(`Could not ${what} ${failed} of ${references.length} workspaces`);
    return failed === 0;
  };
  // Archiving deletes a Paseo worktree's folder, so the confirm step names those with work at stake:
  // uncommitted, unpushed, or not known yet.
  const atRisk = selected.filter((reference) => atRiskOfArchive(shared.infoOf(reference))).length;
  const allPinned = selected.length > 0 && selected.every((reference) => known(reference)?.pinned);
  // Marks skip workspaces that need the user, as the row menu does, and ones not loaded yet.
  const markable = selected.filter((reference) => markableDone(shared.infoOf(reference)));
  const labels = shared.labels;
  const allHave = (label: string) => selected.length > 0 && selected.every((reference) => known(reference)?.labels.includes(label));
  const archive = () => {
    if (!confirmArchive) return setConfirmArchive(true);
    setConfirmArchive(false);
    void each("archive", selected, (workspace) =>
      workspace.archive().then((result) => {
        if (result.error) throw new Error(result.error);
      }),
    ).then((ok) => ok && finish());
  };
  const markDone = () => {
    const skipped = selected.length - markable.length;
    void each("mark", markable, (workspace, reference) => workspace.setMetadata({ [MARK_KEY]: { kind: "done", at: new Date().toISOString(), since: known(reference)?.statusEnteredAt ?? null } })).then((ok) => {
      if (skipped) toast.show(`Skipped ${skipped} that ${skipped === 1 ? "needs" : "need"} you (permission or failed) or ${skipped === 1 ? "is" : "are"} still loading`);
      if (ok) finish();
    });
  };
  const toggleLabel = (label: string) => {
    const assigned = !allHave(label);
    void each("label", selected, (workspace) => workspace.setLabel(label, { assigned }));
  };
  const createLabel = () => {
    const label = newLabel.trim();
    setNewLabel("");
    if (label) void each("label", selected, (workspace) => workspace.setLabel(label, { assigned: true }));
  };
  return (
    <View ref={anchor} style={styles.bulk}>
      <Text style={[styles.meta, { flex: 1 }]} numberOfLines={1}>
        {selected.length} selected
      </Text>
      <IconButton t={t} size="sm" icon={allPinned ? "PinOff" : "Pin"} label={allPinned ? "Unpin the selected workspaces" : "Pin the selected workspaces"} disabled={!selected.length} onPress={() => void each(allPinned ? "unpin" : "pin", selected, (workspace) => workspace.setPinned(!allPinned))} />
      <IconButton t={t} size="sm" icon="CircleCheck" label="Mark the selected workspaces done" disabled={!markable.length} onPress={markDone} />
      <IconButton t={t} size="sm" icon="Tag" label="Label the selected workspaces" disabled={!selected.length} onPress={() => setLabelsOpen(!labelsOpen)} />
      {confirmArchive ? (
        <Button
          t={t}
          variant="danger"
          label={atRisk ? `Archive? ${atRisk} with local work` : "Archive?"}
          accessibilityLabel={`Press again to archive ${selected.length} workspaces${atRisk ? `; ${atRisk} have uncommitted, unpushed or unknown changes that archiving deletes` : ""}`}
          onPress={archive}
          style={{ height: 24, paddingHorizontal: 6 }}
        />
      ) : (
        <IconButton t={t} size="sm" icon="Archive" label="Archive the selected workspaces" disabled={!selected.length} onPress={archive} />
      )}
      <IconButton t={t} size="sm" icon="X" label="Stop selecting" onPress={finish} />
      <Dropdown t={t} open={labelsOpen} onClose={() => setLabelsOpen(false)} anchor={anchor} width={260}>
        {labels.map((label) => (
          <MenuItem key={label} t={t} role="checkbox" icon="Tag" label={label} checked={allHave(label)} onPress={() => toggleLabel(label)} />
        ))}
        <View style={{ padding: 4 }}>
          <Field t={t} plain icon="Plus" value={newLabel} onChangeText={setNewLabel} onSubmit={createLabel} placeholder="Create label" accessibilityLabel="Create a label for the selected workspaces" />
        </View>
      </Dropdown>
    </View>
  );
}

// A task whose reminder is due, listed at the top of the view. Tapping opens the task in Workbench, Tasks; a task with
// a chat also has a button for the chat.
function ReminderRow({ entry, chat, shared }: { entry: AlertEntry; chat: AgentRef | null; shared: Shared }) {
  const { props, styles, now } = shared;
  const due = formatDue(entry.reminder, now);
  // Closes the drawer on phones, as Paseo's own navigation from the view does.
  const openTask = () => {
    shared.openTask(entry.taskId);
    props.dismiss();
  };
  const warning = props.theme.colors.statusWarning;
  // Two lines, as workspace rows: the title gets the row's width, and when it is due (with the reminder's note) goes under it.
  return (
    <RowShell
      selected={false}
      showActions
      twoLine
      label={`Open the task ${entry.title}, reminder ${due}`}
      onPress={openTask}
      main={
        <>
          <View style={[styles.slot, { height: 20 }]}>
            <Icon name="AlarmClock" size={14} color={warning} />
          </View>
          <View style={styles.lines}>
            <View style={styles.line}>
              <Text style={styles.label} numberOfLines={1}>
                {entry.title}
              </Text>
            </View>
            <View style={styles.subLine}>
              <Text style={[styles.meta, { color: warning, flexShrink: 0 }]} numberOfLines={1}>
                {due}
              </Text>
              {entry.reminder.note ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {entry.reminder.note}
                </Text>
              ) : null}
            </View>
          </View>
        </>
      }
      actions={
        <>
          {chat ? <RowAction icon="MessageSquare" label={`Open the chat for ${entry.title}`} onPress={() => props.navigation.openAgent(chat)} shared={shared} /> : null}
          <RowAction icon="Clock" label={`Remind me about ${entry.title} again in 15 minutes`} onPress={() => shared.later(entry.taskId, 15)} shared={shared} />
          <RowAction icon="Check" label={`Mark the reminder for ${entry.title} done`} onPress={() => shared.done(entry.taskId)} shared={shared} />
        </>
      }
      shared={shared}
    />
  );
}

// A small icon and text on a row's second line or in the hover card.
function Meta({ icon, text, color, shared }: { icon?: string; text: string; color?: string; shared: Shared }) {
  const muted = shared.props.theme.colors.foregroundMuted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0 }}>
      {icon ? <Icon name={icon} size={11} color={color ?? muted} /> : null}
      <Text style={[shared.styles.meta, color ? { color } : null]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// Commits not yet pushed (blue) and not yet pulled (amber), as "↑2 ↓1".
function AheadBehind({ ahead, behind, shared }: { ahead: number; behind: number; shared: Shared }) {
  const c = shared.props.theme.colors;
  return (
    <Text style={{ fontSize: 12 }} accessibilityLabel={`${ahead} commits to push, ${behind} to pull`}>
      {ahead ? <Text style={{ color: BLUE }}>↑{ahead}</Text> : null}
      {ahead && behind ? " " : null}
      {behind ? <Text style={{ color: c.statusWarning }}>↓{behind}</Text> : null}
    </Text>
  );
}

// Labels, each with its own colour dot (picked by name, as project tiles are).
function LabelsMeta({ labels, shared }: { labels: readonly string[]; shared: Shared }) {
  const shown = labels.slice(0, 2);
  return (
    <View accessibilityLabel={`Labels: ${labels.join(", ")}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 }}>
      {shown.map((label) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tileColor(label) }} />
          <Text style={shared.styles.meta} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
      {labels.length > shown.length ? <Text style={shared.styles.meta}>+{labels.length - shown.length}</Text> : null}
    </View>
  );
}

function DiffText({ diff, shared }: { diff: { additions: number; deletions: number }; shared: Shared }) {
  return (
    <Text style={{ fontSize: 12 }} accessibilityLabel={`${diff.additions} lines added, ${diff.deletions} removed`}>
      <Text style={shared.styles.added}>+{diff.additions}</Text> <Text style={shared.styles.removed}>-{diff.deletions}</Text>
    </Text>
  );
}

const PR_ICON = { open: "GitPullRequest", draft: "GitPullRequestDraft", merged: "GitMerge", closed: "GitPullRequestClosed" } as const;

function pullRequestColor(colors: Theme["colors"], pr: PullRequestInfo): string {
  return pr.state === "open" ? colors.statusSuccess : pr.state === "closed" ? colors.statusDanger : pr.state === "merged" ? PURPLE : colors.foregroundMuted;
}

function checksColor(colors: Theme["colors"], checks: PullRequestInfo["checks"]): string | null {
  return checks === "success" ? colors.statusSuccess : checks === "pending" ? colors.statusWarning : checks === "failure" ? colors.statusDanger : null;
}

const CHECKS_TEXT = { success: "checks passed", pending: "checks running", failure: "checks failed", none: "no checks" } as const;

// The pull request on a row's title line: its state icon and number, and a dot for its checks.
function PullRequestBadge({ pr, checks, shared }: { pr: PullRequestInfo; checks: boolean; shared: Shared }) {
  const c = shared.props.theme.colors;
  const dot = checks ? checksColor(c, pr.checks) : null;
  return (
    <View accessibilityLabel={`Pull request${pr.number ? ` ${pr.number}` : ""}, ${pr.state}${checks ? `, ${CHECKS_TEXT[pr.checks]}` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Icon name={PR_ICON[pr.state]} size={12} color={pullRequestColor(c, pr)} />
      {pr.number ? <Text style={shared.styles.meta}>#{pr.number}</Text> : null}
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
    </View>
  );
}

function serviceColor(colors: Theme["colors"], service: ServiceInfo): string {
  if (!service.running) return colors.foregroundMuted;
  return service.healthy === false ? colors.statusWarning : colors.statusSuccess;
}

function ServicesMeta({ services, shared }: { services: readonly ServiceInfo[]; shared: Shared }) {
  const first = services[0];
  return (
    <View accessibilityLabel={`Services: ${services.map((service) => `${service.name} ${service.running ? "running" : "stopped"}`).join(", ")}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: serviceColor(shared.props.theme.colors, first) }} />
      <Text style={shared.styles.meta} numberOfLines={1}>
        {first.name}
        {first.port ? `:${first.port}` : ""}
        {services.length > 1 ? ` +${services.length - 1}` : ""}
      </Text>
    </View>
  );
}

const lastSegment = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;

// The card Paseo shows for a hovered workspace: title, changes, host, branch and folder; here also
// the pull request, checks, services and labels. Paseo draws it beside the sidebar; a plugin view
// cannot draw outside its sidebar (the main pane paints over it), so it opens under the row.
function WorkspaceCard({ title, workspace, info, host, shared }: { title: string; workspace: { branch: string | null; diff: { additions: number; deletions: number } | null; directory: string; labels: readonly string[] }; info: WorkspaceInfo | null; host: string | null; shared: Shared }) {
  const c = shared.props.theme.colors;
  const pr = info?.pullRequest ?? null;
  const ahead = info ? `${info.ahead ? ` ↑${info.ahead}` : ""}${info.behind ? ` ↓${info.behind}` : ""}` : "";
  return (
    <View style={{ padding: 6, gap: 6 }}>
      <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>
        {title}
      </Text>
      {workspace.diff && workspace.diff.additions + workspace.diff.deletions > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Icon name="FileDiff" size={11} color={c.foregroundMuted} />
          <DiffText diff={workspace.diff} shared={shared} />
        </View>
      ) : null}
      {host ? <Meta icon="Server" text={host} shared={shared} /> : null}
      {workspace.branch ? <Meta icon="GitBranch" text={`${workspace.branch}${info?.dirty ? " ·" : ""}${ahead}`} shared={shared} /> : null}
      <Meta icon="Folder" text={lastSegment(workspace.directory)} shared={shared} />
      {pr ? <Meta icon={PR_ICON[pr.state]} color={pullRequestColor(c, pr)} text={`${pr.number ? `#${pr.number} ` : ""}${pr.title || pr.state}${pr.checks !== "none" ? ` · ${CHECKS_TEXT[pr.checks]}` : ""}`} shared={shared} /> : null}
      {info?.services.map((service) => (
        <View key={service.name} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: serviceColor(c, service) }} />
          <Text style={shared.styles.meta} numberOfLines={1}>
            {service.name}
            {service.port ? `:${service.port}` : ""} {service.running ? (service.healthy === false ? "unhealthy" : "running") : "stopped"}
          </Text>
        </View>
      ))}
      {workspace.labels.length ? <Meta icon="Tag" text={workspace.labels.join(", ")} shared={shared} /> : null}
    </View>
  );
}

function WorkspaceRow({ reference, shared }: { reference: WorkspaceRef; shared: Shared }) {
  const { props, styles, config, now, t, shows } = shared;
  const c = props.theme.colors;
  const paseo = usePaseo();
  const toast = useToast();
  const rowRef = useRef<View>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [menu, setMenu] = useState<"actions" | "labels" | "colour" | null>(null);
  const workspaceDecor: Decoration = shared.groups.doc.decorations.workspaces[reference.key] ?? { color: null, icon: null };
  const [newLabel, setNewLabel] = useState("");
  const [reminding, setReminding] = useState(false);
  const [card, setCard] = useState(false);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A rename saves once, though Enter and leaving the field both ask to.
  const renameSaved = useRef(false);
  // An armed "Archive?" disarms by itself, so a stray press later cannot archive.
  useEffect(() => {
    if (!confirmArchive) return;
    const timer = setTimeout(() => setConfirmArchive(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmArchive]);
  useEffect(
    () => () => {
      if (cardTimer.current) clearTimeout(cardTimer.current);
    },
    [],
  );
  const workspace = useWorkspace(reference, (item) => ({
    name: workspaceName(item),
    title: rowTitle(config, item),
    indicator: item.indicator,
    branch: item.branch,
    project: item.projectDisplayName,
    projectKey: item.project.key,
    diff: item.diffStat,
    since: item.statusEnteredAt,
    // A workspace never prompted shows the time it was created, as Paseo's list does.
    lastPrompt: item.lastPromptAt ?? item.createdAt,
    pinned: item.pinnedAt !== null,
    labels: item.labels,
    directory: item.directory,
  }));
  const found = shared.infoOf(reference);
  const info = found === "loading" ? null : found;
  const { selecting, selected: selection } = useValue(viewUi);
  const picked = selection.includes(reference.key);
  // Every agent in the workspace, latest first, and each one's parent: chats with their sub-agents
  // under them. The tree is built from all of them, so a sub-agent never loses its parent to a
  // filter; the status filter then picks which chats are listed.
  const inWorkspace = (agent: PluginAgentSnapshot) => agent.workspace.key === reference.key;
  const agents = useAgents({ hosts: [reference.hostId], where: inWorkspace, orderBy: ["lastActivityAt", "desc"] });
  const byParent = useAgents({ hosts: [reference.hostId], where: inWorkspace, groupBy: (agent) => agent.parentAgentId ?? TOP_LEVEL });
  const matching = useAgents({ hosts: [reference.hostId], where: (agent) => inWorkspace(agent) && chatMatches(agent, { statuses: shared.statuses, search: "" }) });
  const running = useAgents({ hosts: [reference.hostId], where: (agent) => inWorkspace(agent) && chatIndicator(agent) === "running" });
  const tree = chatTree(agents, parentsOf(byParent));
  const matchingKeys = new Set(matching.map((agent) => agent.key));
  const chats = shared.statuses.length ? tree.top.filter((chat) => matchingKeys.has(chat.key)) : tree.top;
  const latestChat = useAgent(tree.top[0] ?? "", (agent) => chatName(agent)) ?? null;
  const isOpen = props.active.workspace?.key === reference.key;
  const mark = info?.mark ?? null;
  if (!workspace) return null;
  const indicator = effectiveIndicator(workspace.indicator, workspace.since, mark);
  // Marks only offered where they change what the row shows: never on a row that needs the user,
  // no "Mark as done" on a done row, and undoing only a mark that is in force and visible.
  const applies = markApplies(workspace.indicator, workspace.since, mark);
  const markable = workspace.indicator !== "needs_input" && workspace.indicator !== "failed";
  const markedDone = applies && mark.kind === "done" && workspace.indicator !== "done";
  const markedUnread = applies && mark.kind === "unread" && workspace.indicator !== "attention";
  const chatsShown = config.showAgents && ((config.agentsFor ?? "active") === "all" || isOpen) && listsChats(config.singleChat, chats, config.showSubAgents === false ? new Map() : tree.children, shared.listing);
  // Exactly one row is highlighted: the open chat or sub-agent when it is listed here, else the
  // workspace. `openChat` is the listed chat that holds it, and stays listed past the limit.
  const openChat = chatsShown ? owningRowKey({ top: chats, children: tree.children }, props.active.agent?.key ?? null, config.showSubAgents !== false) : null;
  const selected = isOpen && openChat === null;
  const handle = () => paseo.workspaces.ref(reference);
  const closeMenu = () => {
    setMenu(null);
    setNewLabel("");
  };
  const startRename = () => {
    closeMenu();
    renameSaved.current = false;
    setRenaming(workspace.name);
  };
  const rename = () => {
    if (renaming === null || renameSaved.current) return;
    renameSaved.current = true;
    const title = renaming.trim();
    setRenaming(null);
    if (title === workspace.name) return;
    void handle().setTitle(title || null).catch(report(toast, "rename the workspace"));
  };
  // Archiving asks twice: the first press turns the button (or menu item) into "Archive?".
  const archive = () => {
    if (!confirmArchive) return setConfirmArchive(true);
    setConfirmArchive(false);
    closeMenu();
    void handle()
      .archive()
      .then((result) => {
        if (result.error) toast.error(`Could not archive ${workspace.name}: ${result.error}`);
      }, report(toast, "archive the workspace"));
  };
  const togglePin = () => {
    closeMenu();
    void handle().setPinned(!workspace.pinned).catch(report(toast, "change the pin"));
  };
  const copy = (text: string, what: string) => {
    closeMenu();
    void copyText(text).then(() => toast.show(`Copied the ${what}`), report(toast, `copy the ${what}`));
  };
  const setLabel = (label: string, assigned: boolean) => void handle().setLabel(label, { assigned }).catch(report(toast, "change the labels"));
  // Morphise's own Done and Unread marks, kept on the workspace so every app shows them.
  const setMark = (kind: "done" | "unread" | null) => {
    closeMenu();
    void handle()
      .setMetadata({ [MARK_KEY]: kind ? { kind, at: new Date().toISOString(), since: workspace.since } : null })
      .catch(report(toast, "mark the workspace"));
  };
  const addTask = () => {
    closeMenu();
    void shared.picker.apply({ kind: "addTask", task: { id: newTaskId(), title: workspace.title, links: { workspaceId: reference.id } } }).then(() => toast.show(`Added "${workspace.title}" to tasks`), report(toast, "add the task"));
  };
  const createLabel = () => {
    const label = newLabel.trim();
    setNewLabel("");
    if (label && !workspace.labels.includes(label)) setLabel(label, true);
  };
  const hover = (on: boolean) => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = null;
    if (!on) return setCard(false);
    if (!TOUCH && !selecting) cardTimer.current = setTimeout(() => setCard(true), 600);
  };

  // While renaming, the row becomes a field; its chats stay where they are.
  const renameField =
    renaming === null ? null : (
      <View style={{ marginHorizontal: 8, paddingVertical: 2 }}>
        <Field t={t} plain autoFocus value={renaming} onChangeText={setRenaming} onSubmit={rename} onBlur={rename} accessibilityLabel={`New name for ${workspace.name}`} placeholder="Workspace name" />
      </View>
    );
  // Like Paseo's rows: time since the last prompt, or time in the current status when chosen.
  const elapsed = shows.lastActivity ? formatElapsed(config.details.timeInStatus ? workspace.since : workspace.lastPrompt, now) : null;
  const linked = linksTasks(shared, reference.hostId);
  const reminder = linked ? shared.workspaceReminders.get(reference.id) ?? null : null;
  // The workspace's own reminder (not one of its chats'), which Remind me edits.
  const ownTask = linked ? workspaceTask(tasksOf(shared.picker.tasks.get()), reference.id) : null;
  const ownReminder = ownTask?.reminder ?? null;
  const host = shared.hosts.find((item) => item.serverId === reference.hostId)?.label ?? null;
  const pr = shows.pullRequest ? info?.pullRequest ?? null : null;
  const changes = workspace.diff && workspace.diff.additions + workspace.diff.deletions > 0 ? workspace.diff : null;
  const twoLine = config.rowStyle !== "one-line";
  const line = twoLine ? statusLine(indicator, latestChat, workspace.title) : null;

  // Second-line details, in Paseo's Display order. A row inside its project group never repeats
  // the project's name; the host shows only when there is more than one.
  const details: ReactNode[] = [];
  const branchShown = shows.branch && workspace.branch && config.titleSource !== "branch";
  // The branch turns amber while it has uncommitted changes.
  const branchColor = info?.dirty ? c.statusWarning : undefined;
  if (branchShown) details.push(<Meta key="branch" icon="GitBranch" color={branchColor} text={workspace.branch ?? ""} shared={shared} />);
  if (shows.branch && info && (info.ahead || info.behind)) details.push(<AheadBehind key="sync" ahead={info.ahead ?? 0} behind={info.behind ?? 0} shared={shared} />);
  // The project tag's icon and text take the project's chosen colour, or its automatic one.
  const projectColor = shared.groups.doc.decorations.projects[workspace.projectKey]?.color ?? tileColor(workspace.project);
  if (shows.project && config.groupBy !== "project") details.push(<Meta key="project" icon="Folder" color={projectColor} text={workspace.project} shared={shared} />);
  if (shows.host && host && shared.hosts.length > 1) details.push(<Meta key="host" icon="Server" text={host} shared={shared} />);
  if (shows.diff && changes) details.push(<DiffText key="diff" diff={changes} shared={shared} />);
  if (shows.services && info?.services.length) details.push(<ServicesMeta key="services" services={info.services} shared={shared} />);
  if (shows.labels && workspace.labels.length) details.push(<LabelsMeta key="labels" labels={workspace.labels} shared={shared} />);
  if (reminder) details.push(<Meta key="reminder" icon="AlarmClock" color={isDue(reminder, now) ? c.statusWarning : undefined} text={formatDue(reminder, now)} shared={shared} />);
  // A two-line row with nothing else to say names its branch, then its project.
  const fallback = twoLine && !line && details.length === 0 ? (workspace.branch && config.titleSource !== "branch" ? workspace.branch : config.groupBy !== "project" ? workspace.project : null) : null;
  const lead = line ? (
    <Text key="status" style={[styles.meta, line.tone === "warning" ? { color: c.statusWarning } : line.tone === "danger" ? { color: c.statusDanger } : null]} numberOfLines={1}>
      {line.text}
    </Text>
  ) : fallback ? (
    <Meta key="fallback" icon={workspace.branch && config.titleSource !== "branch" ? "GitBranch" : "Folder"} color={workspace.branch && config.titleSource !== "branch" ? branchColor : undefined} text={fallback} shared={shared} />
  ) : null;
  // Pinned rows in their own Pinned section need no icon; elsewhere the icon shows it.
  const pinIcon = workspace.pinned && !(config.pinnedFirst && config.groupBy !== "none") ? <Icon name="Pin" size={11} color={c.foregroundMuted} /> : null;
  const titleText = (
    <Text style={[styles.label, indicator === "attention" ? { fontWeight: "600" } : null, workspaceDecor.color ? { color: workspaceDecor.color } : null]} numberOfLines={1}>
      {workspace.title}
    </Text>
  );
  const mark0 = selecting ? (
    <View style={[styles.slot, { height: 20 }]}>
      <Icon name={picked ? "SquareCheck" : "Square"} size={14} color={picked ? c.accent : c.foregroundMuted} />
    </View>
  ) : (
    <StatusMark indicator={indicator} still={chatsShown && runningShownBelow(running, listedChatKeys(reference.key, { top: chats, children: shared.config.showSubAgents === false ? new Map() : tree.children }, shared.listing))} shared={shared} />
  );
  const main = twoLine ? (
    <>
      {mark0}
      <View style={styles.lines}>
        <View style={styles.line}>
          {titleText}
          {pr ? <PullRequestBadge pr={pr} checks={shows.checks} shared={shared} /> : null}
          {pinIcon}
        </View>
        {lead || details.length ? (
          <View style={styles.subLine}>
            {lead}
            {details}
          </View>
        ) : null}
      </View>
    </>
  ) : (
    <>
      {mark0}
      {titleText}
      {pr ? <PullRequestBadge pr={pr} checks={shows.checks} shared={shared} /> : null}
      {details}
      {pinIcon}
    </>
  );
  const time = elapsed ? (
    <View style={{ marginLeft: "auto", height: 20, justifyContent: "center" }}>
      <Text style={[styles.time, { marginLeft: 0 }]}>{elapsed}</Text>
    </View>
  ) : null;

  return (
    <View>
      {renameField ?? (
        <RowShell
          rowRef={rowRef}
          twoLine={twoLine}
          selected={selecting ? picked : selected}
          label={selecting ? `${picked ? "Deselect" : "Select"} ${workspace.title}` : `Open workspace ${workspace.title}, ${STATUS_TITLES[indicator]}`}
          onPress={() => (selecting ? toggleSelected(reference.key) : props.navigation.openWorkspace(reference))}
          onLongPress={() => (selecting ? toggleSelected(reference.key) : setMenu("actions"))}
          onHover={hover}
          stem={chatsShown && !reminding ? styles.branch.chat.x : undefined}
          showActions={confirmArchive || menu !== null}
          main={main}
          trailing={time}
          actions={selecting ? undefined : (
            <>
              {config.rowActions.includes("pin") ? <IconButton t={t} size="sm" icon={workspace.pinned ? "PinOff" : "Pin"} tone={workspace.pinned ? c.foreground : undefined} label={workspace.pinned ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`} onPress={togglePin} /> : null}
              {confirmArchive && menu === null ? (
                <Button t={t} variant="danger" {...archiveConfirm(workspace.name, found)} onPress={archive} style={{ height: 24, paddingHorizontal: 6 }} />
              ) : (
                <IconButton t={t} size="sm" icon="Archive" label={`Archive ${workspace.name}`} onPress={archive} />
              )}
              <IconButton t={t} size="sm" icon="EllipsisVertical" label={`Actions for ${workspace.name}`} onPress={() => setMenu(menu ? null : "actions")} />
            </>
          )}
          shared={shared}
        />
      )}
      <Dropdown t={t} open={card && menu === null && renaming === null} onClose={() => setCard(false)} anchor={rowRef} passive width={280}>
        <WorkspaceCard title={workspace.title} workspace={workspace} info={info} host={host} shared={shared} />
      </Dropdown>
      <Dropdown t={t} open={menu !== null} onClose={closeMenu} anchor={rowRef} width={menu === "colour" ? 300 : 250}>
        {menu === "colour" ? (
          <>
            <MenuItem t={t} icon="ChevronLeft" label="Set colour" onPress={() => setMenu("actions")} />
            <DecorPicker t={t} value={workspaceDecor} withIcon={false} onChange={(next) => shared.groups.change((doc) => setDecoration(doc, "workspaces", reference.key, next))} />
          </>
        ) : menu === "labels" ? (
          <>
            <MenuItem t={t} icon="ChevronLeft" label="Labels" onPress={() => setMenu("actions")} />
            {[...new Set([...shared.labels, ...workspace.labels])].sort().map((label) => (
              <MenuItem key={label} t={t} role="checkbox" icon="Tag" label={label} checked={workspace.labels.includes(label)} onPress={() => setLabel(label, !workspace.labels.includes(label))} />
            ))}
            <View style={{ padding: 4 }}>
              <Field t={t} plain icon="Plus" value={newLabel} onChangeText={setNewLabel} onSubmit={createLabel} placeholder="Create label" accessibilityLabel={`Create a label for ${workspace.name}`} />
            </View>
          </>
        ) : (
          <>
            <MenuItem t={t} icon="Copy" label="Copy path" onPress={() => copy(workspace.directory, "path")} />
            {workspace.branch ? <MenuItem t={t} icon="GitBranch" label="Copy branch name" onPress={() => copy(workspace.branch ?? "", "branch name")} /> : null}
            <MenuItem t={t} icon="Pencil" label="Rename workspace" onPress={startRename} />
            <MenuItem t={t} icon="Palette" label="Set colour" hint={workspaceDecor.color ? "Set" : undefined} onPress={() => setMenu("colour")} />
            {/* Pin and Archive are buttons on the row; Pin is here only when its row button is turned off. */}
            {config.rowActions.includes("pin") ? null : <MenuItem t={t} icon={workspace.pinned ? "PinOff" : "Pin"} label={workspace.pinned ? "Unpin" : "Pin to top"} onPress={togglePin} />}
            <MenuItem t={t} icon="Tag" label="Labels" hint={workspace.labels.length ? String(workspace.labels.length) : undefined} onPress={() => setMenu("labels")} />
            <MenuItem
              t={t}
              icon="AlarmClock"
              label={ownReminder ? "Change reminder" : "Remind me"}
              hint={!linked ? OTHER_HOST_HINT : ownReminder ? formatDue(ownReminder, now) : undefined}
              disabled={!linked}
              onPress={() => {
                closeMenu();
                setReminding(true);
              }}
            />
            {/* Only marks that change something: no "Mark as done" on a done workspace. Paseo's own
                unread state cannot be cleared by a plugin, so a natively unread row offers neither. */}
            {markedDone ? <MenuItem t={t} icon="RotateCcw" label="Mark as not done" onPress={() => setMark(null)} /> : markable && indicator !== "done" ? <MenuItem t={t} icon="CircleCheck" label="Mark as done" onPress={() => setMark("done")} /> : null}
            {markedUnread ? <MenuItem t={t} icon="MailOpen" label="Mark as read" onPress={() => setMark(null)} /> : markable && indicator !== "attention" ? <MenuItem t={t} icon="Mail" label="Mark as unread" onPress={() => setMark("unread")} /> : null}
            {/* A workspace belongs to one task, so one that has it says so instead. */}
            <MenuItem t={t} icon="ListPlus" label="Add task" hint={!linked ? OTHER_HOST_HINT : ownTask ? "Has a task" : undefined} disabled={!linked || ownTask !== null} onPress={addTask} />
            <MenuItem
              t={t}
              icon="ListChecks"
              label="Select"
              hint="for bulk actions"
              onPress={() => {
                closeMenu();
                viewUi.set({ ...viewUi.get(), selecting: true, selected: [reference.key] });
              }}
            />
            {info?.pullRequest ? (
              <MenuItem
                t={t}
                icon={PR_ICON[info.pullRequest.state]}
                label={`Open pull request${info.pullRequest.number ? ` #${info.pullRequest.number}` : ""}`}
                onPress={() => {
                  closeMenu();
                  void openExternalUrl(info.pullRequest?.url ?? "").catch(report(toast, "open the pull request"));
                }}
              />
            ) : null}
            {info?.pullRequest ? <MenuItem t={t} icon="Link" label="Copy pull request link" onPress={() => copy(info.pullRequest?.url ?? "", "pull request link")} /> : null}
            {info?.services
              .filter((service) => service.url)
              .map((service) => (
                <MenuItem
                  key={service.name}
                  t={t}
                  icon="ExternalLink"
                  label={`Open ${service.name}`}
                  hint={service.port ? `:${service.port}` : undefined}
                  onPress={() => {
                    closeMenu();
                    void openExternalUrl(service.url ?? "").catch(report(toast, `open ${service.name}`));
                  }}
                />
              ))}
          </>
        )}
      </Dropdown>
      {reminding ? <InlinePicker target={{ kind: "workspace", workspaceId: reference.id, title: workspace.title }} title={workspace.title} onDone={() => setReminding(false)} shared={shared} /> : null}
      {chatsShown ? <WorkspaceChats workspaceKey={reference.key} chats={chats} subsOf={tree.children} openKey={openChat ?? props.active.agent?.key ?? null} shared={shared} /> : null}
    </View>
  );
}

// One chat in the Chats list.
function ChatRow({ reference, shared }: { reference: AgentRef; shared: Shared }) {
  const { props, styles, config, now } = shared;
  const chat = useAgent(reference, (item) => ({
    name: chatName(item),
    indicator: chatIndicator(item),
    workspaceId: item.workspaceId,
    workspace: item.workspace,
    last: item.lastActivityAt,
  }));
  const workspace = useWorkspace(chat?.workspace ?? "", (item) => item.title ?? item.name);
  const remind = useRemindToggle();
  const attention = shared.attentionOf(reference.hostId);
  if (!chat) return null;
  const indicator = withPermission(chat.indicator, attention, reference.id);
  const selected = props.active.agent?.key === reference.key;
  const elapsed = shared.shows.lastActivity ? formatElapsed(chat.last, now) : null;
  const groupedByWorkspace = config.groupBy !== "status" && config.groupBy !== "none";
  return (
    <View>
      <RowShell
        selected={selected}
        label={`Open chat ${chat.name}, ${STATUS_TITLES[indicator]}`}
        onPress={() => props.navigation.openAgent(reference)}
        onLongPress={linksTasks(shared, reference.hostId) ? remind.toggle : undefined}
        showActions={linksTasks(shared, reference.hostId) && shared.chatReminders.has(reference.id)}
        main={
          <>
            <StatusMark indicator={indicator} shared={shared} />
            <Text style={styles.label} numberOfLines={1}>
              {chat.name}
            </Text>
            {!groupedByWorkspace && workspace ? <Text style={styles.secondary} numberOfLines={1}>{workspace}</Text> : null}
          </>
        }
        trailing={elapsed ? <Text style={styles.time}>{elapsed}</Text> : null}
        actions={<RemindButton chat={reference}label={chat.name} onPress={remind.toggle} shared={shared} />}
        shared={shared}
      />
      {remind.open ? <InlinePicker target={{ kind: "chat", agentId: reference.id, workspaceId: chat.workspaceId, title: chat.name }} title={chat.name} onDone={remind.close} shared={shared} /> : null}
    </View>
  );
}

function GroupHeading({ title, count, collapsed, onToggle, shared }: { title: string; count: number; collapsed: boolean; onToggle(): void; shared: Shared }) {
  const { styles, config, props } = shared;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${title}, ${count} ${count === 1 ? "item" : "items"}`}
      onPress={onToggle}
      style={styles.heading}
    >
      <Text style={styles.headingText} numberOfLines={1}>
        {title}
      </Text>
      {config.counts ? <Text style={styles.count}>{count}</Text> : null}
      <View style={{ flex: 1 }} />
      {/* Open or folded, the chevron says the heading folds its group. */}
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={12} color={props.theme.colors.foregroundMuted} />
    </Pressable>
  );
}

// One of the user's groups ("Your groups"): its name, count and fold chevron, and a menu to rename it, move it up
// or down, or delete it (its projects then show under Ungrouped; a group with projects asks for a second press).
// Ungrouped has no menu.
function UserGroupHeading({ group, index, count, collapsed, onToggle, shared }: { group: NestedGroup<{ key: string }>; index: number; count: number; collapsed: boolean; onToggle(): void; shared: Shared }) {
  const { styles, config, props, t } = shared;
  const key = useId();
  const hovered = useHovered(shared.hover, key);
  const anchor = useRef<View>(null);
  const [menu, setMenu] = useState<"actions" | "decor" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = group.groupId;
  const renamingId = useValue(renamingGroup);
  const renaming = id !== null && renamingId === id;
  const [name, setName] = useState(group.title);
  useEffect(() => {
    if (renaming) setName(group.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);
  const saved = shared.groups.doc.groups;
  const projects = saved.find((item) => item.id === id)?.projects.length ?? 0;
  // Ungrouped stays last, so it cannot be dragged.
  const groupDrag = id !== null && !renaming ? shared.drag?.groups ?? null : null;
  const dragHandlers = useCardDragHandlers("", id ?? "", groupDrag);
  const close = () => {
    setMenu(null);
    setConfirmDelete(false);
  };
  const decor: Decoration = (id ? shared.groups.doc.decorations.groups[id] : undefined) ?? { color: null, icon: null };
  const finishRename = () => {
    if (renamingGroup.get() !== id) return;
    renamingGroup.set(null);
    if (id && name.trim() && name.trim() !== group.title) shared.groups.change((doc) => renameGroup(doc, id, name));
  };
  const remove = () => {
    if (!id) return;
    if (projects > 0 && !confirmDelete) return setConfirmDelete(true);
    close();
    shared.groups.change((doc) => deleteGroup(doc, id));
  };
  const move = (to: number) => {
    close();
    if (id) shared.groups.change((doc) => moveGroup(doc, id, to));
  };
  return (
    <View ref={anchor} onPointerMove={() => shared.hover.mark(key)} style={[styles.heading, { paddingRight: 8 }]} {...dragHandlers}>
      {renaming ? (
        <View style={{ flex: 1 }}>
          <Field t={t} plain autoFocus value={name} onChangeText={setName} onSubmit={finishRename} onBlur={finishRename} maxLength={60} accessibilityLabel={`Name of the group ${group.title}`} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${group.title}, ${count} ${count === 1 ? "item" : "items"}`}
          accessibilityHint={groupDrag ? "Drag to move the group" : undefined}
          onPress={onToggle}
          onLongPress={groupDrag && TOUCH && id ? () => groupDrag.arm(id) : undefined}
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 }}
        >
          {decor.icon ? (
            <DecorIcon icon={decor.icon} color={decor.color ?? props.theme.colors.foregroundMuted} size={12} />
          ) : decor.color ? (
            // A colour without an icon shows as a small swatch, since the name keeps the normal text colour.
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: decor.color }} />
          ) : null}
          <Text style={styles.headingText} numberOfLines={1}>
            {group.title}
          </Text>
          {config.counts ? <Text style={styles.count}>{count}</Text> : null}
          <View style={{ flex: 1 }} />
          <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={12} color={props.theme.colors.foregroundMuted} />
        </Pressable>
      )}
      {id !== null && !renaming && (hovered || TOUCH || menu) ? <IconButton t={t} size="sm" icon="Ellipsis" label={`Actions for the group ${group.title}`} onPress={() => (menu ? close() : setMenu("actions"))} /> : null}
      {id !== null ? (
        <Dropdown t={t} open={menu !== null} onClose={close} anchor={anchor} width={menu === "decor" ? 300 : 260}>
          {menu === "decor" ? (
            <>
              <MenuItem t={t} icon="ChevronLeft" label="Colour and icon" onPress={() => setMenu("actions")} />
              <DecorPicker t={t} value={decor} withIcon onChange={(next) => shared.groups.change((doc) => setDecoration(doc, "groups", id, next))} />
            </>
          ) : (
          <>
          <MenuItem
            t={t}
            icon="Pencil"
            label="Rename group"
            onPress={() => {
              close();
              renamingGroup.set(id);
            }}
          />
          {shared.groups.byLastUsed ? null : (
            <>
              <MenuItem t={t} icon="ArrowUp" label="Move up" disabled={index === 0} onPress={() => move(index - 1)} />
              <MenuItem t={t} icon="ArrowDown" label="Move down" disabled={index >= saved.length - 1} onPress={() => move(index + 1)} />
            </>
          )}
          <MenuItem t={t} icon="Palette" label="Colour and icon" onPress={() => setMenu("decor")} />
          <MenuItem t={t} icon="Trash2" tone={t.c.statusDanger} label={confirmDelete ? `Delete: its ${projects} ${projects === 1 ? "project moves" : "projects move"} to Ungrouped` : "Delete group"} onPress={remove} />
          </>
          )}
        </Dropdown>
      ) : null}
    </View>
  );
}

// A project group's heading, as in Paseo's own sidebar: a letter tile and the project's name. On
// hover the tile turns into the fold chevron and a plus opens Paseo's New workspace screen for the
// project (what Paseo's openProject navigation shows). The count shows on hover, as a detail.
// "Copy path" for a project: its own component, as the path is read from the project, which exists only here.
function CopyPathItem({ project, onDone, t }: { project: ProjectRef; onDone(): void; t: Tokens }) {
  const rootPath = useProject(project, (item) => item.rootPath);
  const toast = useToast();
  if (!rootPath) return null;
  return (
    <MenuItem
      t={t}
      icon="Copy"
      label="Copy path"
      onPress={() => {
        onDone();
        void copyText(rootPath).then(() => toast.show("Copied the path"), report(toast, "copy the path"));
      }}
    />
  );
}

// Under "Your groups" a project with no workspace is listed too, by `projectRef`, and the heading gets a menu: Move to
// group, New workspace and Copy path.
function ProjectHeading({ title, first, projectRef = null, count, collapsed, onToggle, shared }: { title: string; first: WorkspaceRef | null; projectRef?: ProjectRef | null; count: number; collapsed: boolean; onToggle(): void; shared: Shared }) {
  const { styles, config, props, t } = shared;
  const project = useWorkspace(first ?? "", (workspace) => workspace.project) ?? projectRef;
  const key = useId();
  const hovered = useHovered(shared.hover, key);
  const chevron = collapsed || hovered;
  const anchor = useRef<View>(null);
  const [menu, setMenu] = useState<"actions" | "move" | "decor" | "remove" | null>(null);
  const toast = useToast();
  const [removing, setRemoving] = useState(false);
  // Only after the confirm: Paseo deletes the project and its workspaces, and the worktrees it made with their ignored files.
  const remove = () => {
    if (!project || removing) return;
    setRemoving(true);
    void shared.removeProject(project.id).then(
      (result) => {
        setRemoving(false);
        if (!result.ok) return void toast.error(`Could not remove ${title}: ${result.error}`);
        setMenu(null);
        toast.show(`Removed ${title}${result.removedWorkspaceIds.length ? ` and ${result.removedWorkspaceIds.length} workspaces` : ""}`);
        shared.groups.change((doc) => setDecoration(moveProject(doc, project.key, null, 0), "projects", project.key, { color: null, icon: null }));
      },
      (error: unknown) => {
        setRemoving(false);
        report(toast, "remove the project")(error);
      },
    );
  };
  const decor: Decoration = (project ? shared.groups.doc.decorations.projects[project.key] : undefined) ?? { color: null, icon: null };
  const custom = config.groupBy === "custom" && project !== null;
  const projectDrag = custom ? shared.drag?.projects ?? null : null;
  const dragHandlers = useCardDragHandlers("", project?.key ?? "", projectDrag);
  const currentGroup = project ? shared.groups.doc.groups.find((group) => group.projects.includes(project.key))?.id ?? null : null;
  const moveTo = (groupId: string | null) => {
    setMenu(null);
    if (project) shared.groups.change((doc) => moveProject(doc, project.key, groupId, Number.MAX_SAFE_INTEGER));
  };
  return (
    <View ref={anchor} onPointerMove={() => shared.hover.mark(key)} style={[styles.project, hovered ? styles.hovered : null]} {...dragHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${title}, ${count} ${count === 1 ? "workspace" : "workspaces"}`}
        accessibilityHint={projectDrag ? "Drag to move it to another group" : undefined}
        onPress={onToggle}
        onLongPress={projectDrag && TOUCH && project ? () => projectDrag.arm(project.key) : undefined}
        style={styles.projectMain}
      >
        {chevron ? (
          <View style={styles.tile}>
            <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={13} color={props.theme.colors.foregroundMuted} />
          </View>
        ) : (
          !styles.projectIcons ? (
            <View style={styles.tile} />
          ) : decor.icon ? (
            <View style={styles.tile}>
              <DecorIcon icon={decor.icon} color={decor.color ?? props.theme.colors.foreground} size={14} />
            </View>
          ) : (
            <View style={[styles.tile, { backgroundColor: decor.color ?? tileColor(title) }]}>
              <Text style={styles.tileText}>{title.trim().charAt(0).toUpperCase() || "?"}</Text>
            </View>
          )
        )}
        <Text style={styles.projectText} numberOfLines={1}>
          {title}
        </Text>
        {config.counts && (hovered || collapsed || TOUCH) ? <Text style={styles.count}>{count}</Text> : null}
        <View style={{ flex: 1 }} />
      </Pressable>
      {project && (hovered || TOUCH) ? <IconButton t={t} size="sm" icon="Plus" label={`New workspace in ${title}`} onPress={() => props.navigation.openProject(project)} /> : null}
      {custom && (hovered || TOUCH || menu) ? <IconButton t={t} size="sm" icon="Ellipsis" label={`Actions for the project ${title}`} onPress={() => setMenu(menu ? null : "actions")} /> : null}
      {custom ? (
        <Dropdown t={t} open={menu !== null} onClose={() => setMenu(null)} anchor={anchor} width={menu === "decor" ? 300 : 260}>
          {menu === "remove" && project ? (
            <View style={{ padding: 8, gap: 8 }}>
              <Text style={[t.text.body, { fontWeight: "600" }]}>Remove {title}?</Text>
              <Text style={t.text.small}>
                Paseo deletes the project and archives its workspaces{count ? ` (${count} shown here)` : ""}. Worktrees Paseo made are deleted with their folders, including files git ignores there. The project folder stays on disk. This cannot be undone.
              </Text>
              <MenuItem t={t} icon="Trash2" tone={t.c.statusDanger} label={removing ? "Removing…" : `Remove ${title}`} disabled={removing} onPress={remove} />
              <MenuItem t={t} icon="X" label="Cancel" onPress={() => setMenu("actions")} />
            </View>
          ) : menu === "decor" && project ? (
            <>
              <MenuItem t={t} icon="ChevronLeft" label="Colour and icon" onPress={() => setMenu("actions")} />
              <DecorPicker t={t} value={decor} withIcon onChange={(next) => shared.groups.change((doc) => setDecoration(doc, "projects", project.key, next))} />
            </>
          ) : menu === "move" ? (
            <>
              <MenuItem t={t} icon="ChevronLeft" label="Move to group" onPress={() => setMenu("actions")} />
              {shared.groups.doc.groups.map((group) => (
                <MenuItem key={group.id} t={t} role="radio" icon="Folder" label={group.name} checked={group.id === currentGroup} onPress={() => moveTo(group.id)} />
              ))}
              <MenuItem t={t} role="radio" icon="FolderMinus" label="Ungrouped" checked={currentGroup === null} onPress={() => moveTo(null)} />
            </>
          ) : (
            <>
              <MenuItem t={t} icon="FolderInput" label="Move to group" expanded={false} onPress={() => setMenu("move")} />
              <MenuItem t={t} icon="Palette" label="Colour and icon" onPress={() => setMenu("decor")} />
              <MenuItem
                t={t}
                icon="Plus"
                label="New workspace"
                onPress={() => {
                  setMenu(null);
                  if (project) props.navigation.openProject(project);
                }}
              />
              {project ? <CopyPathItem project={project} onDone={() => setMenu(null)} t={t} /> : null}
              <MenuItem t={t} icon="Trash2" tone={t.c.statusDanger} label="Remove project…" onPress={() => setMenu("remove")} />
            </>
          )}
        </Dropdown>
      ) : null}
    </View>
  );
}

type Menu = "filter" | "view" | null;

interface HeaderProps {
  menu: Menu;
  setMenu(menu: Menu): void;
  search: string;
  onSearch(text: string): void;
  // What screen readers say for the search box.
  searchLabel: string;
  filters: number;
  // Opens the next item that needs the user; null when nothing does.
  onNext: (() => void) | null;
  // Where the Filter and Display menus open from.
  headerRef: RefObject<View | null>;
  shared: Shared;
}

// The view's header, search first: a search box that fills the row, then the tools in groups split
// by thin dividers: create (Dispatch, New group), view (Filter, Display), and Next on its own.
// Menus open over the list instead of pushing it down.
function Header({ menu, setMenu, search, onSearch, searchLabel, filters, onNext, headerRef, shared }: HeaderProps) {
  const { styles, props, t, config } = shared;
  const toggle = (next: Exclude<Menu, null>) => setMenu(menu === next ? null : next);
  const openScreen = useValue(screenOpener);
  const divider = <View style={styles.headerDivider} />;
  return (
    <View ref={headerRef} style={styles.header}>
      {/* The box takes the space the buttons leave, down to nothing (Field's own `grow` keeps 140). */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Field t={t} plain quiet icon="Search" value={search} onChangeText={onSearch} placeholder="Search" accessibilityLabel={searchLabel} />
      </View>
      {search !== "" ? <IconButton t={t} size="sm" icon="X" label="Clear search" onPress={() => onSearch("")} /> : null}
      {openScreen ? <IconButton t={t} size="sm" icon={DISPATCH_ICON} label="Dispatch: start several agents in new workspaces" onPress={() => openScreen({ screenId: DISPATCH_SCREEN_ID })} /> : null}
      {config.groupBy === "custom" ? (
        <IconButton
          t={t}
          size="sm"
          icon="FolderPlus"
          label="New group"
          onPress={() => {
            const id = newGroupId();
            renamingGroup.set(id);
            shared.groups.change((doc) => createGroup(doc, id));
          }}
        />
      ) : null}
      {divider}
      <View>
        <IconButton t={t} size="sm" icon="ListFilter" tone={filters || menu === "filter" ? props.theme.colors.foreground : undefined} label={filters ? `Filters, ${filters} on` : "Filter"} onPress={() => toggle("filter")} />
        {filters ? <View pointerEvents="none" style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: props.theme.colors.accent }} /> : null}
      </View>
      <IconButton t={t} size="sm" icon="SlidersHorizontal" tone={menu === "view" ? props.theme.colors.foreground : undefined} label="Display: grouping, sorting, what rows show" onPress={() => toggle("view")} />
      {divider}
      <IconButton t={t} size="sm" icon="SkipForward" label={onNext ? "Open the next one that needs you" : "Nothing needs you"} disabled={onNext === null} onPress={() => onNext?.()} />
    </View>
  );
}

// A titled block inside a menu.
function MenuSection({ title, children, shared }: { title: string; children: ReactNode; shared: Shared }) {
  return (
    <View style={{ paddingVertical: 4 }}>
      <Text style={[shared.styles.headingText, { paddingHorizontal: 8, paddingBottom: 2 }]}>{title}</Text>
      {children}
    </View>
  );
}

interface FilterMenuProps {
  state: ViewState;
  save(next: Partial<ViewState>): void;
  projects: readonly { key: string; title: string }[];
  shared: Shared;
}

// Statuses, projects and quick toggles; each choice applies at once and is kept on this device.
function FilterMenu({ state, save, projects, shared }: FilterMenuProps) {
  const { t, props, config } = shared;
  const statuses = state.statusFilter;
  const needsMe = needsMeOn(statuses);
  // Statuses add up: picking one while "Needs me" (permission and failed) is on keeps those two and
  // adds it; picking one of those two takes just that one out.
  const toggleStatus = (indicator: Indicator) => {
    const on = statuses.includes(indicator);
    save({ statusFilter: on ? statuses.filter((item) => item !== indicator) : [...statuses, indicator] });
  };
  const toggleProject = (key: string) => save({ projectFilter: state.projectFilter.includes(key) ? state.projectFilter.filter((item) => item !== key) : [...state.projectFilter, key] });
  return (
    <>
      <MenuSection title="Status" shared={shared}>
        <MenuItem t={t} role="checkbox" icon="Hand" label="Needs me" hint="permission or failed" checked={needsMe} onPress={() => save({ statusFilter: needsMe ? [] : [...NEEDS_ME] })} />
        {INDICATORS.map((indicator) => (
          <MenuItem key={indicator} t={t} role="checkbox" dot={statusColor(props.theme.colors, indicator)} label={STATUS_TITLES[indicator]} checked={statuses.includes(indicator)} onPress={() => toggleStatus(indicator)} />
        ))}
      </MenuSection>
      <MenuSection title="Show only" shared={shared}>
        <MenuItem t={t} role="checkbox" icon="EyeOff" label="Hide done" checked={state.hideDone} onPress={() => save({ hideDone: !state.hideDone })} />
        {config.list === "workspaces" ? (
          <>
            <MenuItem t={t} role="checkbox" icon="FileDiff" label="With changed lines" checked={state.changedOnly} onPress={() => save({ changedOnly: !state.changedOnly })} />
            <MenuItem t={t} role="checkbox" icon="Pin" label="Pinned" checked={state.pinnedOnly} onPress={() => save({ pinnedOnly: !state.pinnedOnly })} />
          </>
        ) : null}
      </MenuSection>
      {config.list === "workspaces" && projects.length > 1 ? (
        <MenuSection title="Projects" shared={shared}>
          {projects.map((project) => (
            <MenuItem key={project.key} t={t} role="checkbox" dot={tileColor(project.title)} label={project.title} checked={state.projectFilter.includes(project.key)} onPress={() => toggleProject(project.key)} />
          ))}
        </MenuSection>
      ) : null}
      <View style={{ borderTopWidth: 1, borderTopColor: t.c.border, paddingTop: 4 }}>
        <MenuItem t={t} icon="X" label="Clear filters" onPress={() => save({ statusFilter: [], projectFilter: [], hideDone: false, changedOnly: false, pinnedOnly: false })} />
      </View>
    </>
  );
}

// The Display menu: the few view choices people change often, each as one row of choices you see at once, plus
// Show background (kept on this device, as Paseo keeps it). Everything else (row height, how many per group,
// chats and sub-agents under each row, the details rows show, auto-archive) lives in Settings, Sidebar, one press
// away. View choices are saved to the active layout so every app shows the same list.
function ViewMenu({ update, state, saveState, shared, openSettings }: { update(patch: Partial<ViewConfig>): void; state: ViewState; saveState(next: Partial<ViewState>): void; shared: Shared; openSettings(): void }) {
  const { t, config } = shared;
  // Choosing the current value writes nothing, so an unchanged option never adds a key an older version cannot read.
  const row = <Value extends string>(title: string, current: Value, options: readonly (readonly [Value, string])[], apply: (value: Value) => void) => (
    <View style={{ gap: 6 }}>
      <Text style={shared.styles.meta}>{title}</Text>
      <Segmented<Value> t={t} label={title} value={current} options={options.map(([value, label]) => ({ value, label }))} onChange={(value) => value !== current && apply(value)} />
    </View>
  );
  const chatsFor = config.showAgents ? config.agentsFor ?? "active" : "off";
  return (
    <View style={{ padding: 12, gap: 14 }}>
      {row("Group by", config.groupBy, [["project", "Project"], ["custom", "Your groups"], ["status", "Status"], ["activity", "Last used"], ["label", "Label"], ["none", "None"]] as const, (groupBy) => update({ groupBy }))}
      {row("Sort by", config.orderBy, [["activity", "Last prompt"], ["created", "Created"], ["status", "Status"], ["name", "Name"], ["statusChanged", "Status change"], ["changes", "Changed lines"]] as const, (orderBy) => update({ orderBy }))}
      {row("Rows", config.rowStyle ?? "two-line", [["two-line", "Two lines"], ["one-line", "One line"]] as const, (rowStyle) => update({ rowStyle }))}
      {config.list === "workspaces" ? row("Chats under workspaces", chatsFor, [["off", "None"], ["active", "Open workspace"], ["all", "Every workspace"]] as const, (value) => update(value === "off" ? { showAgents: false } : { showAgents: true, agentsFor: value })) : null}
      {row("Row height", config.density, [["compact", "Compact"], ["comfortable", "Comfortable"], ["spacious", "Spacious"]] as const, (density) => update({ density }))}
      {/* The rest of the look is kept on this device. */}
      {row("Text size", state.textSize === null ? "auto" : (String(state.textSize) as "11" | "12" | "13" | "14" | "15"), [["auto", "Auto"], ["11", "11"], ["12", "12"], ["13", "13"], ["14", "14"], ["15", "15"]] as const, (size) => saveState({ textSize: size === "auto" ? null : Number(size) }))}
      {row("Space between groups", state.groupSpacing, [["none", "None"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["xlarge", "Extra large"]] as const, (groupSpacing) => saveState({ groupSpacing }))}
      {row("Indent", state.indent, [["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"]] as const, (indent) => saveState({ indent }))}
      <View style={{ height: 1, backgroundColor: t.c.border, marginHorizontal: -12 }} />
      <View style={{ marginHorizontal: -8, marginVertical: -6 }}>
        {config.list === "workspaces" ? <MenuItem t={t} role="checkbox" icon="EyeOff" label="Show background workspaces" checked={state.showBackground} onPress={() => saveState({ showBackground: !state.showBackground })} /> : null}
        <MenuItem t={t} role="checkbox" icon="Bold" label="Bold group names" checked={state.boldGroupNames} onPress={() => saveState({ boldGroupNames: !state.boldGroupNames })} />
        {config.list === "workspaces" ? <MenuItem t={t} role="checkbox" icon="Folder" label="Folder icons" checked={state.showProjectIcons} onPress={() => saveState({ showProjectIcons: !state.showProjectIcons })} /> : null}
        <MenuItem t={t} icon="Settings2" label="All sidebar settings" onPress={openSettings} />
      </View>
    </View>
  );
}

export interface ViewDeps extends PickerDeps {
  // Saves the view's group, sort and limit options to the active layout.
  updateView(patch: Partial<ViewConfig>): Promise<void>;
  // Changes the user's project groups ("Your groups").
  changeGroups(operation: (doc: ProjectGroups) => ProjectGroups): Promise<void>;
  // Removes a project and its workspaces (Paseo's CLI on the daemon).
  removeProject(projectId: string): Promise<RemoveProjectResult>;
  // Opens Settings, Sidebar on the layout in use (the Display menu's "All sidebar settings").
  openSidebarSettings(): void;
  // Opens Workbench, Tasks with this task's editor.
  openTask(taskId: string): void;
  // The id of the host whose task document this app edits; null until known.
  taskHost: ValueStore<string | null>;
  // False until the first workspace list arrives, while the view shows loading placeholders.
  workspacesReady: ValueStore<boolean>;
}

interface RowSource {
  sections: { key: string; title: string | null; items: readonly { key: string }[] }[];
  // Rows the row limit never hides.
  protectedKeys: ReadonlySet<string>;
  // Opens the next row that needs the user, in view order; null when none does.
  onNext: (() => void) | null;
  noun: string;
  renderRow(reference: { key: string }, shared: Shared): ReactNode;
  // "Your groups": the sections placed under the user's groups (`sections` then lists them flat, in that order, for
  // Next and bulk actions); null for every other grouping.
  nested: NestedGroup<{ key: string }>[] | null;
  // Every project by key, so a project with no workspace still has a heading under "Your groups".
  projectRefs: ReadonlyMap<string, ProjectRef>;
}

// True when anything narrows the list; projects with no workspace then stay out of "Your groups".
const filtering = (filter: Filter) => filter.statuses.length > 0 || filter.search !== "" || (filter.projects?.length ?? 0) > 0 || !!filter.hideDone || !!filter.changedOnly || !!filter.pinnedOnly;

type Where<Snapshot> = (item: Snapshot) => boolean;

// Next visits what needs the user in the order the view shows it, then anything a filter hides,
// so a filter never makes Next say "Nothing needs you" while something does.
function withHidden<Ref extends { key: string }>(shown: readonly Ref[], all: readonly Ref[]): Ref[] {
  const keys = new Set(shown.map((ref) => ref.key));
  return [...shown, ...all.filter((ref) => !keys.has(ref.key))];
}

// Paseo's plugin snapshots carry no pending permission requests, so a chat's "waiting for
// permission" comes from the attention store, read from the daemon's agent records.
function withPermission(indicator: Indicator, attention: AttentionList, agentId: string): Indicator {
  return attention.get(agentId)?.reason === "permission" ? "needs_input" : indicator;
}

// The group key for top-level agents when agents are grouped by parent; agent ids are UUIDs, so it
// cannot clash with a parent id.
const TOP_LEVEL = "~top-level";

function parentsOf(groups: readonly { key: string; items: readonly { id: string }[] }[]): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  for (const group of groups) for (const item of group.items) parents.set(item.id, group.key === TOP_LEVEL ? null : group.key);
  return parents;
}

// Morphise's Done and Unread marks change what a workspace's status is for every rule: filters,
// sorting, status groups, the row limit and Next all see the marked status.
// A workspace not loaded yet shows no mark, as before its host's first snapshot.
function withMark(workspace: PluginWorkspaceSnapshot, infoOf: Shared["infoOf"]): PluginWorkspaceSnapshot {
  const info = infoOf(workspace.ref);
  const mark = info && info !== "loading" ? info.mark : null;
  if (!mark) return workspace;
  const indicator = effectiveIndicator(workspace.indicator, workspace.statusEnteredAt, mark);
  return indicator === workspace.indicator ? workspace : { ...workspace, indicator };
}

// Project keys, most recently used first (by their most recently used shown workspace), and how to order "Your groups"
// with them: by last use while Settings, Sidebar asks for it (the default), else in the saved order.
function useRecentProjects(showBackground: boolean): { keys: readonly string[]; on: boolean } {
  const order = useSettings(groupOrderSettings);
  const keys = useWorkspaces({ where: (workspace) => isVisible(workspace, showBackground), orderBy: byLastUsed, groupBy: (workspace) => ({ key: workspace.project.key }) }).map((group) => group.key);
  return { keys, on: order.status !== "ready" || order.values.lastUsedFirst };
}
function orderUserGroups<Ref>(nested: NestedGroup<Ref>[], recent: { keys: readonly string[]; on: boolean }): NestedGroup<Ref>[] {
  return recent.on ? orderGroupsByLastUsed(nested, recent.keys) : nested;
}

function workspaceRows(config: ViewConfig) {
  const compareBase = compareWorkspaces(config);
  // Like Paseo's own sidebar, pinned workspaces get their own section above the groups.
  const pinnedApart = config.pinnedFirst && config.groupBy !== "none";
  // "Your groups" groups workspaces by project first, then places the projects under the user's groups.
  const custom = config.groupBy === "custom";
  const keyConfig: ViewConfig = custom ? { ...config, groupBy: "project" } : config;
  return function useWorkspaceRows(filter: Filter, props: PluginSidebarViewProps, showBackground: boolean, infoOf: Shared["infoOf"], groups: ProjectGroups): RowSource {
    const marked = (workspace: PluginWorkspaceSnapshot) => withMark(workspace, infoOf);
    const compare = (left: PluginWorkspaceSnapshot, right: PluginWorkspaceSnapshot) => compareBase(marked(left), marked(right));
    const shown = (workspace: PluginWorkspaceSnapshot) => isVisible(workspace, showBackground) && matchesFilter(marked(workspace), filter);
    const pinned = useWorkspaces({ where: (workspace) => shown(workspace) && workspace.pinnedAt !== null, orderBy: compare });
    const inGroups = (workspace: PluginWorkspaceSnapshot) => shown(workspace) && !(pinnedApart && workspace.pinnedAt !== null);
    // The same hook in both branches, so the hook order never depends on the grouping.
    const groupedRefs = useWorkspaces(config.groupBy === "none" ? { where: inGroups, orderBy: compare } : { where: inGroups, orderBy: compare, groupBy: (workspace) => groupKeys(keyConfig, marked(workspace)) });
    const grouped = config.groupBy === "none" ? [{ key: "all", title: null, items: groupedRefs as readonly WorkspaceRef[] }] : orderGroups<Group<WorkspaceRef>>(groupedRefs as readonly Group<WorkspaceRef>[], keyConfig);
    // Every project, one group each, for their names and refs; called always, so the hook order never changes.
    const allProjects = useProjects({ groupBy: (project) => ({ key: project.ref.key, title: project.displayName }) });
    const projectRefs = new Map(allProjects.flatMap((group) => group.items.map((ref) => [ref.key, ref] as const)));
    const inner = grouped.map((group) => ({ key: group.key, title: group.title ?? "", items: group.items, project: group.key.slice("project:".length) }));
    const listed = new Set(inner.map((section) => section.project));
    // Projects whose unarchived workspaces are all hidden as background; called always, so the hook order never changes.
    const hiddenProjects = new Set(useWorkspaces({ where: (workspace) => workspace.archivingAt === null && !isVisible(workspace, showBackground), groupBy: (workspace) => ({ key: workspace.project.key }) }).map((group) => group.key));
    const emptyProjects = custom && !filtering(filter) ? emptyProjectsToList(allProjects, listed, hiddenProjects).map((group) => ({ key: group.key, title: group.title ?? "" })) : [];
    const recentProjects = useRecentProjects(showBackground);
    const nested = custom ? orderUserGroups(nestInGroups(inner, groups.groups, emptyProjects), recentProjects) : null;
    const flat = nested ? nested.flatMap((group) => group.sections) : grouped;
    const sections = pinnedApart && pinned.length ? [{ key: "pinned", title: "Pinned", items: pinned }, ...flat] : flat;
    const protectedKeys = new Set(useWorkspaces({ where: (workspace) => shown(workspace) && isProtected(marked(workspace)) }).map((ref) => ref.key));
    const waitingRefs = useWorkspaces({ where: (workspace) => isVisible(workspace, showBackground) && needsAttention(marked(workspace).indicator), orderBy: compare });
    const next = nextAttention(withHidden(attentionOrder(sections, new Set(waitingRefs.map((ref) => ref.key))), waitingRefs), props.active.workspace?.key ?? null);
    return {
      sections,
      protectedKeys,
      onNext: next ? () => props.navigation.openWorkspace(next) : null,
      noun: "workspaces",
      renderRow: (reference, shared) => <WorkspaceRow key={reference.key} reference={reference as WorkspaceRef} shared={shared} />,
      nested,
      projectRefs,
    };
  };
}

function chatRows(config: ViewConfig) {
  const compare = compareChats(config);
  const useSections =
    config.groupBy === "none"
      ? (where: Where<PluginAgentSnapshot>) => [{ key: "all", title: null, items: useAgents({ where, orderBy: compare }) }]
      : (where: Where<PluginAgentSnapshot>) =>
          orderGroups<Group<AgentRef>>(useAgents({ where, orderBy: compare, groupBy: (chat) => chatGroupKey(config, chat) }), config);
  const custom = config.groupBy === "custom";
  return function useChatRows(filter: Filter, props: PluginSidebarViewProps, showBackground: boolean, infoOf: Shared["infoOf"], groups: ProjectGroups): RowSource {
    // Chats in archived, internal or (unless shown) background workspaces stay out, as their
    // workspaces do. A workspace the list has not loaded yet does not hide its chats.
    const inShownWorkspace = (chat: PluginAgentSnapshot) => {
      const workspace = infoOf(chat.workspace);
      return !workspace || workspace === "loading" || workspace.open || (showBackground && workspace.background);
    };
    const listed = (chat: PluginAgentSnapshot) => isSidebarChat(chat) && inShownWorkspace(chat);
    const shown = (chat: PluginAgentSnapshot) => listed(chat) && chatMatches(chat, filter);
    const grouped = useSections(shown);
    // "Your groups": chats are grouped by workspace, and each workspace goes under its project's group.
    const byProject = useWorkspaces({ groupBy: (workspace) => ({ key: workspace.project.key, title: workspace.projectDisplayName }) });
    const projectOf = new Map(byProject.flatMap((group) => group.items.map((ref) => [ref.key, group.key] as const)));
    const recentProjects = useRecentProjects(showBackground);
    const nested = custom ? orderUserGroups(nestInGroups(grouped.map((group) => ({ key: group.key, title: group.title ?? "", items: group.items, project: projectOf.get(group.key.slice("workspace:".length)) ?? "" })), groups.groups, []), recentProjects) : null;
    const sections = nested ? nested.flatMap((group) => group.sections) : grouped;
    const isProtectedChat = (chat: PluginAgentSnapshot) => ["needs_input", "failed"].includes(chatIndicator(chat));
    const protectedKeys = new Set(useAgents({ where: (chat) => shown(chat) && isProtectedChat(chat) }).map((ref) => ref.key));
    const waitingRefs = useAgents({ where: (chat) => listed(chat) && needsAttention(chatIndicator(chat)), orderBy: compare });
    const next = nextAttention(withHidden(attentionOrder(sections, new Set(waitingRefs.map((ref) => ref.key))), waitingRefs), props.active.agent?.key ?? null);
    return {
      sections,
      protectedKeys,
      onNext: next ? () => props.navigation.openAgent(next) : null,
      noun: "chats",
      renderRow: (reference, shared) => <ChatRow key={reference.key} reference={reference as AgentRef} shared={shared} />,
      nested,
      projectRefs: new Map(),
    };
  };
}

// A heading for a group of chats from one workspace, titled with that workspace's name.
// Named from the group's first chat's workspace ref, so the name comes from that chat's host.
function WorkspaceGroupHeading(props: { chat: AgentRef; count: number; collapsed: boolean; onToggle(): void; shared: Shared }) {
  const workspace = useAgent(props.chat, (agent) => agent.workspace);
  const name = useWorkspace(workspace ?? "", (item) => item.title ?? item.name);
  return <GroupHeading title={name ?? "Workspace"} count={props.count} collapsed={props.collapsed} onToggle={props.onToggle} shared={props.shared} />;
}

// Lets "Show in Paseo" open terminals and workspaces: only a mounted view holds the app's references
// to them (client/show.ts). Draws nothing.
function ShowTargets({ navigation }: { navigation: PluginSidebarViewProps["navigation"] }) {
  const latest = useRef<{ terminals: readonly TerminalRef[]; workspaces: readonly WorkspaceRef[]; navigation: PluginSidebarViewProps["navigation"] }>({ terminals: [], workspaces: [], navigation });
  latest.current = { terminals: useTerminals(), workspaces: useWorkspaces(), navigation };
  useEffect(
    () =>
      registerShowNavigator({
        openTerminal(hostId, terminalId) {
          const ref = refOn(latest.current.terminals, hostId, terminalId);
          if (ref) latest.current.navigation.openTerminal(ref);
          return Boolean(ref);
        },
        openWorkspace(hostId, workspaceId) {
          const ref = refOn(latest.current.workspaces, hostId, workspaceId);
          if (ref) latest.current.navigation.openWorkspace(ref);
          return Boolean(ref);
        },
      }),
    [],
  );
  return null;
}

export function createSidebarView(config: ViewConfig, deps: ViewDeps) {
  // Chosen once per profile, so each view instance always calls the same hooks.
  const useRows = config.list === "chats" ? chatRows(config) : workspaceRows(config);

  return function MorphiseSidebarView(props: PluginSidebarViewProps) {
    const t = useTokens(props.theme, TOUCH);
    const reminders = remindersOf(tasksOf(useValue(deps.tasks)));
    // Rows show times, so the clock ticks every minute.
    const now = useReminderClock(reminders.map((entry) => entry.reminder), true);
    const viewState = useSettings(viewStateSettings);
    // The latest view change not saved yet. Each tap builds on it and one save runs at a time,
    // against the newest revision, so a quick second tap is neither refused nor lost.
    const [unsaved, setUnsaved] = useState<ViewState | null>(null);
    const viewSaving = useRef(false);
    const state = unsaved ?? (viewState.status === "ready" ? viewState.values : DEFAULT_VIEW_STATE);
    const look = sidebarLook(state, config.density, TOUCH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const styles = useMemo(() => viewStyles(props.theme, config, look), [props.theme, ...Object.values(look)]);
    const ui = useValue(viewUi);
    const setUi = (patch: Partial<typeof ui>) => viewUi.set({ ...viewUi.get(), ...patch });
    const { search, menu } = ui;
    const expanded = new Set(ui.expanded);
    const setSearch = (text: string) => setUi({ search: text });
    const setMenu = (next: Menu) => setUi({ menu: next });
    const setExpanded = (next: ReadonlySet<string>) => setUi({ expanded: [...next] });
    // Project names for the Projects filter, from the same visible workspaces.
    const projects = useWorkspaces({ where: (workspace) => isVisible(workspace, state.showBackground), groupBy: (workspace) => ({ key: workspace.project.key, title: workspace.projectDisplayName }) }).map((group) => ({ key: group.key, title: group.title ?? "Project" }));
    const toast = useToast();
    const headerRef = useRef<View>(null);
    const [hover] = useState(createHoverTracker);
    useEffect(() => afterPointerMoves(hover.settle, hover.clear), [hover]);
    // The open workspace's chats, latest first, for steps cards shown for every chat.
    const openWorkspaceKey = props.active.workspace?.key ?? null;
    const workspaceChats = useAgents({ where: (agent) => agent.workspace.key === openWorkspaceKey && agent.parentAgentId === null, orderBy: ["lastActivityAt", "desc"] });
    // Unread clears once its workspace is the open one, as Paseo's own unread does, whether or not
    // its row is on screen. A mark made after the workspace became open (marking the open
    // workspace unread) stays until it is opened again.
    const paseo = usePaseo();
    const hosts = useHosts();
    const onlineHosts = hosts.filter((host) => host.status === "online").map((host) => host.serverId);
    const { infoOf, all: workspaceInfos } = useHostWorkspaces(onlineHosts);
    const attentionOf = useHostAttention(onlineHosts);
    // The open workspace by host and id: the same id can be another host's workspace.
    const openWorkspace = props.active.workspace;
    if (openedAt.key !== openWorkspaceKey) Object.assign(openedAt, { key: openWorkspaceKey, at: Date.now() });
    const openInfo = openWorkspace ? infoOf(openWorkspace) : null;
    const openMark = openInfo && openInfo !== "loading" ? openInfo.mark : null;
    useEffect(() => {
      if (!openWorkspace || openMark?.kind !== "unread" || Date.parse(openMark.at) >= openedAt.at) return;
      void paseo.workspaces.ref(openWorkspace).setMetadata({ [MARK_KEY]: null }).catch(report(toast, "mark the workspace read"));
    }, [openWorkspace, openMark, paseo, toast]);
    const viewRef = useRef<View>(null);
    const saveState = (next: Partial<ViewState>) => {
      if (viewState.status !== "ready") return;
      setUnsaved((current) => ({ ...(current ?? viewState.values), ...next }));
    };
    // Tells the settings screen that Paseo is showing this view: for this session, and saved for this device, so a plugin
    // reload (an update) doesn't bring back the "still showing its own sidebar" note while Settings hides the sidebar.
    useEffect(() => viewPresence.set(true), []);
    const shownSaved = viewState.status === "ready" && viewState.values.viewShown;
    useEffect(() => {
      if (viewState.status === "ready" && !shownSaved) saveState({ viewShown: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewState.status, shownSaved]);
    useEffect(() => {
      if (!unsaved || viewState.status !== "ready" || viewSaving.current) return;
      viewSaving.current = true;
      void viewState.save(unsaved, viewState.revision).then((saved) => {
        viewSaving.current = false;
        // A change made while this one saved is copied so this effect runs again and saves it.
        setUnsaved((current) => (current === unsaved ? null : current && { ...current }));
        if (!saved) toast.error("Could not remember this view change on this device");
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unsaved, viewState.status]);

    const on = config.filterBar;
    const filter: Filter = {
      statuses: on ? state.statusFilter : [],
      search: on ? search : "",
      // Projects, changed lines and pins exist on workspaces only; the chat list ignores them.
      projects: on && config.list === "workspaces" ? state.projectFilter : [],
      hideDone: on && state.hideDone,
      changedOnly: on && config.list === "workspaces" && state.changedOnly,
      pinnedOnly: on && config.list === "workspaces" && state.pinnedOnly,
    };
    const filters = filter.statuses.length + (filter.projects?.length ?? 0) + Number(filter.hideDone) + Number(filter.changedOnly) + Number(filter.pinnedOnly);
    const updateView = (patch: Partial<ViewConfig>) => void deps.updateView(patch).catch(report(toast, "change the view"));
    // The open chat, for the top bar's Stats button (it is told only its workspace).
    const activeAgentId = props.active.agent?.id ?? null;
    useEffect(() => openChat.set(activeAgentId), [activeAgentId]);
    useEffect(() => () => openChat.set(null), []);
    const groupsState = useSettings(projectGroupsSettings);
    const groupsDoc = groupsState.status === "ready" ? groupsState.values : EMPTY_PROJECT_GROUPS;
    const groupOrder = useSettings(groupOrderSettings);
    const groupsByLastUsed = groupOrder.status !== "ready" || groupOrder.values.lastUsedFirst;
    const source = useRows(filter, props, state.showBackground, infoOf, groupsDoc);
    const changeGroups = (operation: (doc: ProjectGroups) => ProjectGroups) => void deps.changeGroups(operation).catch(report(toast, "change your groups"));
    // "Your groups" in the workspace list: projects drag between groups (each group a column, each project a card), and
    // groups drag up and down (one column of groups). Both hooks always run, with no columns otherwise.
    const draggable = config.list === "workspaces" && source.nested !== null ? source.nested : [];
    const projectDrag = useBoardDrag(
      draggable.map((group) => ({ column: { id: group.groupId ?? UNGROUPED_DROP }, lanes: [{ key: "", tasks: group.sections.map((section) => ({ id: section.project })) }] })),
      (projectKey, target) => changeGroups((doc) => dropProject(doc, projectKey, { group: target.column === UNGROUPED_DROP ? null : target.column, before: target.before })),
      false,
      "vertical",
      0,
    );
    const groupDrag = useBoardDrag(
      [{ column: { id: "groups" }, lanes: [{ key: "", tasks: draggable.flatMap((group) => (group.groupId ? [{ id: group.groupId }] : [])) }] }],
      (groupId, target) => changeGroups((doc) => dropGroup(doc, groupId, target.before)),
      false,
      "vertical",
      0,
    );
    const projectScroll = projectDrag.value.scroller("board", false);
    const groupScroll = groupDrag.value.scroller("board", false);
    // One scroller serves both drags.
    const scrollRef = useCallback((view: ScrollView | null) => {
      projectScroll.ref(view);
      groupScroll.ref(view);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const dragRoot = useCallback((view: View | null) => {
      projectDrag.root.current = view;
      groupDrag.root.current = view;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const projectTarget = projectDrag.value.state?.target ?? null;
    const groupTarget = groupDrag.value.state?.target ?? null;
    const ready = useValue(deps.workspacesReady);
    const taskHost = useValue(deps.taskHost);
    const { sections, protectedKeys } = source;

    const dueEntries = reminders.filter((entry) => isDue(entry.reminder, now));
    const dueChatIds = new Set(dueEntries.flatMap((entry) => (entry.agentId ? [entry.agentId] : [])));
    // Task links name the task host's chats only.
    const dueChats = new Map(useAgents({ where: (agent) => agent.hostId === taskHost && dueChatIds.has(agent.id) }).map((ref) => [ref.id, ref]));
    const workspaceReminders = new Map<string, Reminder>();
    const document = tasksOf(useValue(deps.tasks));
    for (const entry of reminders) {
      const workspaceId = document.tasks.find((task) => task.id === entry.taskId)?.links.workspaceId;
      const current = workspaceId ? workspaceReminders.get(workspaceId) : undefined;
      if (workspaceId && (!current || entry.reminder.at < current.at)) workspaceReminders.set(workspaceId, entry.reminder);
    }

    // The same task the pill, picker and /remind act on.
    const chatReminders = new Map<string, Reminder>();
    for (const agentId of new Set(reminders.flatMap((entry) => (entry.agentId ? [entry.agentId] : [])))) {
      const reminder = followUpTask(document, agentId)?.reminder;
      if (reminder) chatReminders.set(agentId, reminder);
    }
    const done = (taskId: string) => void deps.apply({ kind: "setReminder", id: taskId, reminder: null }).catch(report(toast, "mark the reminder done"));
    const later = (taskId: string, minutes: number) => {
      const reminder = document.tasks.find((task) => task.id === taskId)?.reminder ?? null;
      void deps.apply({ kind: "snoozeReminder", id: taskId, at: snoozeTime(reminder, minutes, new Date()) }).catch(report(toast, "move the reminder"));
    };
    const labels = [...new Set(workspaceInfos.flatMap((workspace) => workspace.labels))].sort();
    const setExpandedKey = (key: string, on: boolean) => setExpanded(new Set(on ? [...expanded, key] : [...expanded].filter((item) => item !== key)));
    const shared: Shared = {
      props,
      styles,
      t,
      config,
      now,
      workspaceReminders,
      statuses: filter.statuses,
      chatReminders,
      picker: deps,
      done,
      later,
      openTask: deps.openTask,
      shows: rowShows(config),
      infoOf,
      taskHost,
      attentionOf,
      hosts,
      labels,
      isExpanded: (key) => expanded.has(key),
      setExpanded: setExpandedKey,
      listing: {
        limit: config.chatRows ?? DEFAULT_CHAT_ROWS,
        subLimit: config.subAgentRows ?? DEFAULT_CHAT_ROWS,
        subAgents: config.showSubAgents ?? true,
        singleSubAgent: config.singleSubAgent,
        isExpanded: (key) => expanded.has(key),
        openKey: props.active.agent?.key ?? null,
      },
      hover,
      groups: { doc: groupsDoc, change: changeGroups, projectRefs: source.projectRefs, byLastUsed: groupsByLastUsed },
      drag: draggable.length ? { projects: projectDrag.value, groups: groupsByLastUsed ? null : groupDrag.value } : null,
      removeProject: deps.removeProject,
    };
    const collapsed = new Set(state.collapsed);
    const toggleCollapsed = (key: string) =>
      saveState({ collapsed: collapsed.has(key) ? state.collapsed.filter((item) => item !== key) : [...state.collapsed, key] });
    const nothing = sections.every((section) => section.items.length === 0) && dueEntries.length === 0;
    const remindersFolded = collapsed.has(REMINDERS_GROUP);
    // The first few due reminders, then Show more (Settings, Sidebar, Reminders).
    const reminderLimit = config.reminderRows ?? DEFAULT_REMINDER_ROWS;
    const shownReminders = expanded.has(REMINDERS_GROUP) ? dueEntries : dueEntries.slice(0, reminderLimit);

    const searchLabel = config.list === "chats" ? "Search chats" : "Search name, branch or project";
    const activeTags = [
      ...(needsMeOn(filter.statuses) ? [{ key: "needs", label: "Needs me", color: props.theme.colors.statusWarning, remove: () => saveState({ statusFilter: [] }) }] : filter.statuses.map((indicator) => ({ key: indicator, label: STATUS_TITLES[indicator], color: statusColor(props.theme.colors, indicator), remove: () => saveState({ statusFilter: state.statusFilter.filter((item) => item !== indicator) }) }))),
      ...(filter.projects ?? []).map((key) => ({ key, label: projects.find((project) => project.key === key)?.title ?? "Project", color: tileColor(projects.find((project) => project.key === key)?.title ?? ""), remove: () => saveState({ projectFilter: state.projectFilter.filter((item) => item !== key) }) })),
      ...(filter.hideDone ? [{ key: "hideDone", label: "Done hidden", color: undefined, remove: () => saveState({ hideDone: false }) }] : []),
      ...(filter.changedOnly ? [{ key: "changed", label: "Changed", color: undefined, remove: () => saveState({ changedOnly: false }) }] : []),
      ...(filter.pinnedOnly ? [{ key: "pinned", label: "Pinned", color: undefined, remove: () => saveState({ pinnedOnly: false }) }] : []),
    ];

    // One group of rows with its heading, Show more and Show less. The heading follows the group's key.
    const renderSection = (section: RowSource["sections"][number] & { project?: string }, dropColumn?: string) => {
      const folded = section.title !== null && collapsed.has(section.key);
      // The Pinned section is never shortened: pins are few by choice.
      const limit = section.key === "pinned" ? { ...config.rowLimit, enabled: false } : config.rowLimit;
      const { rows, hidden } = capRows(section.items, protectedKeys, limit, expanded.has(section.key));
      const collapsible = expanded.has(section.key) && capRows(section.items, protectedKeys, limit, false).hidden > 0;
      const kind = headingKind(section.key);
      const toggle = () => toggleCollapsed(section.key);
      const heading =
        section.title === null ? null : kind === "workspace" ? (
          <WorkspaceGroupHeading chat={section.items[0] as AgentRef} count={section.items.length} collapsed={folded} onToggle={toggle} shared={shared} />
        ) : kind === "project" ? (
          <ProjectHeading title={section.title} first={(section.items[0] as WorkspaceRef | undefined) ?? null} projectRef={source.projectRefs.get(section.key.slice("project:".length)) ?? null} count={section.items.length} collapsed={folded} onToggle={toggle} shared={shared} />
        ) : (
          <GroupHeading title={section.title} count={section.items.length} collapsed={folded} onToggle={toggle} shared={shared} />
        );
      const card = dropColumn !== undefined && section.project !== undefined ? projectDrag.value.card("", section.project) : undefined;
      return (
        <View key={section.key} ref={card}>
          {dropColumn !== undefined && projectTarget?.column === dropColumn && projectTarget.before === section.project ? <DropLine shared={shared} /> : null}
          {heading}
          {folded ? null : rows.map((reference) => source.renderRow(reference, shared))}
          {!folded && hidden > 0 ? <MoreRow icon="ChevronDown" label="Show more" spoken={`Show ${hidden} more ${source.noun}`} count={hidden} onPress={() => setExpandedKey(section.key, true)} shared={shared} /> : null}
          {!folded && collapsible ? <MoreRow icon="ChevronUp" label="Show less" spoken={`Show fewer ${source.noun}`} onPress={() => setExpandedKey(section.key, false)} shared={shared} /> : null}
        </View>
      );
    };

    const steps = stepsOptions(config.steps);
    // In the chat, the cards are drawn there instead (see the steps.chat section).
    const stepsCards = config.stepsCard !== false && steps.position !== "chat" ? <StepsCards open={props.active.agent ?? null} chats={workspaceChats} paseo={paseo} t={t} options={steps} /> : null;
    return (
      <View ref={viewRef} style={styles.scroll}>
        <ShowTargets navigation={props.navigation} />
        <PopoverHost bounds={viewRef}>
        {on ? (
          <Header menu={menu} setMenu={setMenu} search={search} onSearch={setSearch} searchLabel={searchLabel} filters={filters} onNext={source.onNext} headerRef={headerRef} shared={shared} />
        ) : null}
        {on && activeTags.length ? (
          <View style={styles.tools}>
            {activeTags.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {activeTags.map((tag) => (
                  <Tag key={tag.key} t={t} label={tag.label} color={tag.color} onRemove={tag.remove} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {stepsCards && steps.position === "top" ? stepsCards : null}
        <View ref={dragRoot} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 12 }}
        onScroll={(event) => {
          projectScroll.onScroll(event);
          groupScroll.onScroll(event);
        }}
        onContentSizeChange={(width, height) => {
          projectScroll.onContentSizeChange(width, height);
          groupScroll.onContentSizeChange(width, height);
        }}
        onLayout={(event) => {
          projectScroll.onLayout(event);
          groupScroll.onLayout(event);
        }}
        scrollEventThrottle={16}
        scrollEnabled={projectScroll.scrollEnabled && groupScroll.scrollEnabled}
      >
        {dueEntries.length > 0 ? (
          <View>
            <GroupHeading title="Reminders" count={dueEntries.length} collapsed={remindersFolded} onToggle={() => toggleCollapsed(REMINDERS_GROUP)} shared={shared} />
            {remindersFolded ? null : shownReminders.map((entry) => <ReminderRow key={`${entry.taskId}:${entry.reminder.setAt}`} entry={entry} chat={entry.agentId ? dueChats.get(entry.agentId) ?? null : null} shared={shared} />)}
            {!remindersFolded && shownReminders.length < dueEntries.length ? <MoreRow icon="ChevronDown" label="Show more" spoken={`Show ${dueEntries.length - shownReminders.length} more reminders`} count={dueEntries.length - shownReminders.length} onPress={() => setExpandedKey(REMINDERS_GROUP, true)} shared={shared} /> : null}
            {!remindersFolded && expanded.has(REMINDERS_GROUP) && dueEntries.length > reminderLimit ? <MoreRow icon="ChevronUp" label="Show less" spoken="Show fewer reminders" onPress={() => setExpandedKey(REMINDERS_GROUP, false)} shared={shared} /> : null}
          </View>
        ) : null}
        {nothing && !ready ? <LoadingRows shared={shared} /> : null}
        {nothing && ready ? <Text style={styles.empty}>{filter.search || filters ? `No ${source.noun} match` : `No ${source.noun} yet`}</Text> : null}
        {source.nested ? (
          <>
            {sections.filter((section) => section.key === "pinned").map((section) => renderSection(section))}
            <View ref={groupDrag.value.column("groups")}>
              {source.nested.map((group, index) => {
                const folded = collapsed.has(group.key);
                const column = group.groupId ?? UNGROUPED_DROP;
                const columnRef = projectDrag.value.column(column);
                const cardRef = group.groupId ? groupDrag.value.card("", group.groupId) : null;
                // A group is both a column for projects and a card in the column of groups.
                const ref = (view: View | null) => {
                  columnRef(view);
                  cardRef?.(view);
                };
                const lineBefore = groupTarget !== null && (groupTarget.before === group.groupId || (groupTarget.before === null && group.groupId === null));
                return (
                  <View key={group.key} ref={ref}>
                    {lineBefore ? <DropLine shared={shared} /> : null}
                    <UserGroupHeading group={group} index={index} count={group.sections.reduce((sum, section) => sum + section.items.length, 0)} collapsed={folded} onToggle={() => toggleCollapsed(group.key)} shared={shared} />
                    {folded ? null : group.sections.map((section) => renderSection(section, column))}
                    {projectTarget?.column === column && projectTarget.before === null ? <DropLine shared={shared} /> : null}
                  </View>
                );
              })}
              {groupTarget !== null && groupTarget.before === null && !source.nested.some((group) => group.groupId === null) ? <DropLine shared={shared} /> : null}
            </View>
          </>
        ) : (
          sections.map((section) => renderSection(section))
        )}
      </ScrollView>
          <DragGhost drag={projectDrag.value}>{(projectKey) => <DragPill title={draggable.flatMap((group) => group.sections).find((section) => section.project === projectKey)?.title ?? "Project"} shared={shared} />}</DragGhost>
          <DragGhost drag={groupDrag.value}>{(groupId) => <DragPill title={draggable.find((group) => group.groupId === groupId)?.title ?? "Group"} shared={shared} />}</DragGhost>
          {stepsCards && steps.position === "bottom" ? stepsCards : null}
          {ui.selecting && config.list === "workspaces" ? <BulkBar shown={new Map(sections.flatMap((section) => section.items.map((item) => [item.key, item as WorkspaceRef] as const)))} shared={shared} /> : null}
          <Dropdown t={t} open={menu !== null} onClose={() => setMenu(null)} anchor={headerRef} width={420} maxHeight={560}>
            {menu === "filter" ? <FilterMenu state={state} save={saveState} projects={projects} shared={shared} /> : <ViewMenu update={updateView} state={state} saveState={saveState} shared={shared} openSettings={() => (setMenu(null), deps.openSidebarSettings())} />}
          </Dropdown>
        </View>
        </PopoverHost>
      </View>
    );
  };
}
