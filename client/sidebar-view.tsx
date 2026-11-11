import {
  type AgentRef,
  type Group,
  type PluginSidebarViewProps,
  type WorkspaceRef,
  useAgent,
  useAgents,
  usePaseo,
  useSettings,
  useWorkspace,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import type { PluginAgentSnapshot, PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  capRows,
  compareWorkspaces,
  type Filter,
  groupKeys,
  isProtected,
  isVisible,
  matchesFilter,
  orderGroups,
  STATUS_TITLES,
  workspaceName,
} from "../shared/arrange";
import { attentionOrder, NEEDS_ME, needsAttention, needsMeOn, nextAttention } from "../shared/attention";
import { chatGroupKey, chatIndicator, chatMatches, chatName, compareChats, isListedChat } from "../shared/chat-status";
import { INDICATORS, type Indicator, type Profile } from "../shared/profile";
import { isDue, type Reminder } from "../shared/reminders";
import { formatDue, formatElapsed } from "../shared/time-text";
import { type ViewState, viewStateSettings } from "../shared/view-state";
import { createValueStore, type ValueStore, useValue } from "./profile-store";
import { useReminderClock } from "./reminder-clock";
import { type AlertEntry, remindersOf } from "./reminder-alerts";
import { type PickerDeps, ReminderPicker } from "./reminder-picker";
import { followUpTask } from "../shared/task-ops";
import { type ApplyTaskOperations, type TaskStore, tasksOf } from "./task-store";
import { Button, Field, IconButton, MenuItem, Tag, type Tokens, useTokens } from "./ui/kit";
import { viewPresence } from "./view-presence";
import { cannotHover } from "./web";

type ViewConfig = Profile["sidebar"]["view"];
type Theme = PluginSidebarViewProps["theme"];

const INDICATOR_TOKEN = {
  needs_input: "statusWarning",
  attention: "statusWarning",
  failed: "statusDanger",
  running: "accent",
  done: "statusSuccess",
} as const;

const DEFAULT_VIEW_STATE: ViewState = { collapsed: [], statusFilter: [], projectFilter: [], hideDone: false, changedOnly: false, pinnedOnly: false };
// Touch screens get finger-sized rows and always-visible row buttons. Paseo reports its sidebar as
// "compact" on desktop too, so the input decides this (no hover), not the layout.
const TOUCH = cannotHover();
// Letter tiles for projects, as Paseo's own sidebar draws them; picked by the project's name.
const TILE_COLORS = ["#b05c80", "#c08a3e", "#4f9a8f", "#5b7fc7", "#8a6cc7", "#c76b5b", "#6b9a4f", "#7f8496"];
function tileColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}
const REMINDERS_GROUP = "reminders";

// Search text, the open menu and expanded groups live outside the view, so they survive the view
// being rebuilt when its options change.
const viewUi = createValueStore<{ search: string; searching: boolean; menu: "filter" | "view" | null; expanded: readonly string[] }>({ search: "", searching: false, menu: null, expanded: [] });

// Sizes match Paseo's own sidebar (measured on 0.16.0-beta.1): 36px rows inset 8px with an 8px
// radius, 14px titles, 12px muted section labels and dimmer 12px times; the selected row uses
// surface2. "Comfortable" density adds 4px to each row.
function viewStyles(theme: Theme, config: ViewConfig) {
  const c = theme.colors;
  // "Compact" is Paseo's own 36px row; "comfortable" adds air.
  const height = TOUCH ? 44 : config.density === "compact" ? 36 : 40;
  return {
    scroll: { flex: 1 },
    header: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: 36, paddingLeft: 16, paddingRight: 8, gap: 2 },
    headerText: { color: c.foregroundMuted, fontSize: 12, flex: 1 },
    tools: { paddingHorizontal: 8, paddingBottom: 6, gap: 6 },
    // Floats over the list below the header, with the platform's usual shadow.
    menu: {
      position: "absolute" as const,
      top: 0,
      left: 8,
      right: 8,
      // Bounded by the list area, so it never runs off a short screen; short menus stay short.
      maxHeight: "95%" as const,
      padding: 4,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface1,
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    // More space above a heading than below it: the heading belongs to the rows that follow.
    heading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, minHeight: 28, paddingLeft: 16, paddingRight: 12, marginTop: 14 },
    headingText: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1 },
    count: { color: c.foregroundMuted, fontSize: 12, opacity: 0.6 },
    // Paseo's measured columns: tiles and status dots share a 16px slot at x=16; text starts at x=40.
    project: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TOUCH ? 44 : 40, marginHorizontal: 8, marginTop: 10, paddingLeft: 8, paddingRight: 4, borderRadius: 8, gap: 2 },
    projectMain: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: 8, minHeight: TOUCH ? 44 : 40 },
    tile: { width: 16, height: 16, borderRadius: 4, alignItems: "center" as const, justifyContent: "center" as const },
    tileText: { color: "#ffffff", fontSize: 10, fontWeight: "700" as const },
    projectText: { color: c.foregroundMuted, fontSize: 14, flexShrink: 1 },
    row: { minHeight: height, marginHorizontal: 8, paddingLeft: 8, paddingRight: 6, borderRadius: 8, flexDirection: "row" as const, alignItems: "center" as const, gap: 2 },
    rowMain: { flex: 1, minWidth: 0, minHeight: height, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    slot: { width: 16, alignItems: "center" as const, justifyContent: "center" as const },
    child: { paddingLeft: 32, minHeight: TOUCH ? 40 : 30 },
    selected: { backgroundColor: c.surface2 },
    hovered: { backgroundColor: c.surface1 },
    label: { color: c.foreground, fontSize: config.density === "compact" ? 13 : 14, flexShrink: 1 },
    childLabel: { color: c.foregroundMuted, fontSize: 13, flexShrink: 1 },
    secondary: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1, opacity: 0.75 },
    time: { color: c.foregroundMuted, fontSize: 12, opacity: 0.7, marginLeft: "auto" as const },
    due: { color: c.statusWarning, fontSize: 12, marginLeft: "auto" as const },
    added: { color: c.statusSuccess, fontSize: 12 },
    removed: { color: c.statusDanger, fontSize: 12 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    more: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, minHeight: 32, marginHorizontal: 8, paddingLeft: 10, borderRadius: 8 },
    moreText: { color: c.foregroundMuted, fontSize: 14 },
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
}

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
// area. Buttons show on hover, on touch screens, or when they carry state (a set reminder).
function RowShell({ selected, child, label, onPress, onLongPress, main, actions, showActions, disabled, shared }: { selected: boolean; child?: boolean; label: string; onPress(): void; onLongPress?(): void; main: ReactNode; actions?: ReactNode; showActions?: boolean; disabled?: boolean; shared: Shared }) {
  const { styles } = shared;
  const [hovered, setHovered] = useState(false);
  return (
    // A plain View, not a Pressable: on web a Pressable becomes a Tab stop even when told not to.
    <View onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={[styles.row, child ? styles.child : null, selected ? styles.selected : hovered ? styles.hovered : null]}>
      <Pressable accessibilityRole={disabled ? "text" : "button"} accessibilityLabel={label} disabled={disabled} onPress={onPress} onLongPress={onLongPress} style={styles.rowMain}>
        {main}
      </Pressable>
      {actions && (hovered || showActions || TOUCH) ? <View style={{ flexDirection: "row", alignItems: "center" }}>{actions}</View> : null}
    </View>
  );
}

// A 6px status dot in the same 16px column as project tiles, as Paseo draws it. It takes colour
// only when the status needs the user or is in motion; finished work is plain, done work dim.
function StatusDot({ indicator, shared }: { indicator: Indicator; shared: Shared }) {
  const c = shared.props.theme.colors;
  const color = indicator === "done" ? c.foregroundMuted : indicator === "attention" ? c.foreground : c[INDICATOR_TOKEN[indicator]];
  return (
    <View style={shared.styles.slot}>
      <View accessibilityLabel={STATUS_TITLES[indicator]} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: indicator === "done" ? 0.6 : 1 }} />
    </View>
  );
}

function RemindButton({ agentId, label, onPress, shared }: { agentId: string; label: string; onPress(): void; shared: Shared }) {
  const { t, now } = shared;
  const reminder = shared.chatReminders.get(agentId);
  const tone = reminder ? (isDue(reminder, now) ? t.c.statusWarning : t.c.accent) : undefined;
  return <IconButton t={t} size="sm" icon="AlarmClock" tone={tone} label={reminder ? `Reminder for ${label}: ${formatDue(reminder, now)}. Change it` : `Remind me about ${label}`} onPress={onPress} />;
}

function InlinePicker({ agentId, workspaceId, title, onDone, shared }: { agentId: string; workspaceId: string; title: string; onDone(): void; shared: Shared }) {
  return (
    <View style={{ marginHorizontal: 8, marginTop: 2, marginBottom: 6, borderWidth: 1, borderRadius: 10, borderColor: shared.t.c.border, backgroundColor: shared.t.c.surface1 }}>
      <ReminderPicker deps={shared.picker} target={{ kind: "chat", agentId, workspaceId, title }} title={title} theme={shared.props.theme} compact={shared.t.compact} embedded onDone={onDone} />
    </View>
  );
}

function AgentRow({ reference, shared }: { reference: AgentRef; shared: Shared }) {
  const { props, styles } = shared;
  const agent = useAgent(reference, (item) => ({ title: item.title, provider: item.provider, workspaceId: item.workspaceId }));
  const remind = useRemindToggle();
  if (!agent) return null;
  const selected = props.active.agent?.key === reference.key;
  const label = agent.title ?? agent.provider;
  return (
    <View>
      <RowShell
        child
        selected={selected}
        label={`Open chat ${label}`}
        onPress={() => props.navigation.openAgent(reference)}
        onLongPress={remind.toggle}
        showActions={shared.chatReminders.has(reference.id)}
        main={
          <>
            <Icon name="MessageSquare" size={13} color={props.theme.colors.foregroundMuted} />
            <Text style={styles.childLabel} numberOfLines={1}>
              {label}
            </Text>
          </>
        }
        actions={<RemindButton agentId={reference.id} label={label} onPress={remind.toggle} shared={shared} />}
        shared={shared}
      />
      {remind.open ? <InlinePicker agentId={reference.id} workspaceId={agent.workspaceId} title={label} onDone={remind.close} shared={shared} /> : null}
    </View>
  );
}

function WorkspaceAgents({ reference, shared }: { reference: WorkspaceRef; shared: Shared }) {
  const agents = useAgents({
    hosts: [reference.hostId],
    where: (agent) => agent.workspace.key === reference.key && isListedChat(agent) && chatMatches(agent, { statuses: shared.statuses, search: "" }),
    orderBy: ["lastActivityAt", "desc"],
  });
  return (
    <>
      {agents.map((agent) => (
        <AgentRow key={agent.key} reference={agent} shared={shared} />
      ))}
    </>
  );
}

function RowAction({ icon, label, onPress, shared }: { icon: string; label: string; onPress(): void; shared: Shared }) {
  return <IconButton t={shared.t} size="sm" icon={icon} label={label} onPress={onPress} />;
}

// A task whose reminder is due, listed at the top of the view. Tapping opens its chat when it
// has one.
function ReminderRow({ entry, chat, shared }: { entry: AlertEntry; chat: AgentRef | null; shared: Shared }) {
  const { props, styles, now } = shared;
  const due = formatDue(entry.reminder, now);
  const open = chat ? () => props.navigation.openAgent(chat) : null;
  return (
    <RowShell
      selected={false}
      showActions
      disabled={!open}
      label={open ? `Open the chat for ${entry.title}, reminder ${due}` : `${entry.title}, reminder ${due}`}
      onPress={() => open?.()}
      main={
        <>
          <Icon name="AlarmClock" size={14} color={props.theme.colors.statusWarning} />
          <Text style={styles.label} numberOfLines={1}>
            {entry.title}
          </Text>
          <Text style={styles.due}>{due}</Text>
        </>
      }
      actions={
        <>
          <RowAction icon="Clock" label={`Remind me about ${entry.title} again in 15 minutes`} onPress={() => shared.later(entry.taskId, 15)} shared={shared} />
          <RowAction icon="Check" label={`Mark the reminder for ${entry.title} done`} onPress={() => shared.done(entry.taskId)} shared={shared} />
        </>
      }
      shared={shared}
    />
  );
}

function WorkspaceRow({ reference, shared }: { reference: WorkspaceRef; shared: Shared }) {
  const { props, styles, config, now, t } = shared;
  const paseo = usePaseo();
  const toast = useToast();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // A rename saves once, though Enter and leaving the field both ask to.
  const renameSaved = useRef(false);
  // An armed "Archive?" disarms by itself, so a stray press later cannot archive.
  useEffect(() => {
    if (!confirmArchive) return;
    const timer = setTimeout(() => setConfirmArchive(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmArchive]);
  const workspace = useWorkspace(reference, (item) => ({
    name: workspaceName(item),
    indicator: item.indicator,
    branch: item.branch,
    project: item.projectDisplayName,
    diff: item.diffStat,
    since: item.statusEnteredAt,
    // A workspace never prompted shows the time it was created, as Paseo's list does.
    lastPrompt: item.lastPromptAt ?? item.createdAt,
    pinned: item.pinnedAt !== null,
  }));
  if (!workspace) return null;
  const selected = props.active.workspace?.key === reference.key;
  const { details } = config;
  const handle = () => paseo.workspaces.ref(reference.id);
  const startRename = () => {
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
  // Archiving asks twice: the first press turns the button into "Archive?".
  const archive = () => {
    if (!confirmArchive) return setConfirmArchive(true);
    setConfirmArchive(false);
    void handle()
      .archive()
      .then((result) => {
        if (result.error) toast.error(`Could not archive ${workspace.name}: ${result.error}`);
      }, report(toast, "archive the workspace"));
  };
  // While renaming, the row becomes a field; its nested chats stay where they are.
  const renameField =
    renaming === null ? null : (
      <View style={{ marginHorizontal: 8, paddingVertical: 2 }}>
        <Field t={t} plain autoFocus value={renaming} onChangeText={setRenaming} onSubmit={rename} onBlur={rename} accessibilityLabel={`New name for ${workspace.name}`} placeholder="Workspace name" />
      </View>
    );
  // Like Paseo's rows: time since the last prompt, or time in the current status when chosen.
  const elapsed = formatElapsed(details.timeInStatus ? workspace.since : workspace.lastPrompt, now);
  const reminder = shared.workspaceReminders.get(reference.id) ?? null;
  // Inside its own project group a row never repeats the project's name.
  const details2 = [details.project && config.groupBy !== "project" ? workspace.project : null, details.branch ? workspace.branch : null].filter(Boolean).join(" · ");
  return (
    <View>
      {renameField ?? (
      <RowShell
        selected={selected}
        label={`Open workspace ${workspace.name}, ${STATUS_TITLES[workspace.indicator]}`}
        onPress={() => props.navigation.openWorkspace(reference)}
        showActions={confirmArchive}
        main={
          <>
          <StatusDot indicator={workspace.indicator} shared={shared} />
          <Text style={styles.label} numberOfLines={1}>
            {workspace.name}
          </Text>
          {details2 ? <Text style={styles.secondary} numberOfLines={1}>{details2}</Text> : null}
          {details.diff && workspace.diff && workspace.diff.additions + workspace.diff.deletions > 0 ? (
            <Text>
              <Text style={styles.added}>+{workspace.diff.additions}</Text> <Text style={styles.removed}>-{workspace.diff.deletions}</Text>
            </Text>
          ) : null}
          {/* Pinned rows in their own Pinned section need no icon; elsewhere the icon shows it. */}
          {workspace.pinned && !(config.pinnedFirst && config.groupBy !== "none") ? <Icon name="Pin" size={11} color={props.theme.colors.foregroundMuted} /> : null}
          {reminder ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Icon name="AlarmClock" size={12} color={isDue(reminder, now) ? props.theme.colors.statusWarning : props.theme.colors.foregroundMuted} />
              <Text style={[styles.secondary, isDue(reminder, now) ? { color: props.theme.colors.statusWarning, opacity: 1 } : null]} numberOfLines={1}>
                {formatDue(reminder, now)}
              </Text>
            </View>
          ) : null}
          {elapsed ? <Text style={styles.time}>{elapsed}</Text> : <View style={{ marginLeft: "auto" }} />}
          </>
        }
        actions={
          <>
            <IconButton t={t} size="sm" icon="Pencil" label={`Rename ${workspace.name}`} onPress={startRename} />
            {confirmArchive ? (
              <Button t={t} variant="danger" label="Archive?" accessibilityLabel={`Press again to archive ${workspace.name}`} onPress={archive} style={{ height: 24, paddingHorizontal: 6 }} />
            ) : (
              <IconButton t={t} size="sm" icon="Archive" label={`Archive ${workspace.name}`} onPress={archive} />
            )}
            {config.rowActions.includes("pin") ? (
              <IconButton
                t={t}
                size="sm"
                icon={workspace.pinned ? "PinOff" : "Pin"}
                tone={workspace.pinned ? props.theme.colors.foreground : undefined}
                label={workspace.pinned ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`}
                onPress={() => void handle().setPinned(!workspace.pinned).catch(report(toast, "change the pin"))}
              />
            ) : null}
          </>
        }
        shared={shared}
      />
      )}
      {config.showAgents && ((config.agentsFor ?? "active") === "all" || selected) ? <WorkspaceAgents reference={reference} shared={shared} /> : null}
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
    last: item.lastActivityAt,
  }));
  const workspace = useWorkspace(chat?.workspaceId ?? "", (item) => item.title ?? item.name);
  const remind = useRemindToggle();
  if (!chat) return null;
  const selected = props.active.agent?.key === reference.key;
  const elapsed = formatElapsed(chat.last, now);
  const groupedByWorkspace = config.groupBy !== "status" && config.groupBy !== "none";
  return (
    <View>
      <RowShell
        selected={selected}
        label={`Open chat ${chat.name}, ${STATUS_TITLES[chat.indicator]}`}
        onPress={() => props.navigation.openAgent(reference)}
        onLongPress={remind.toggle}
        showActions={shared.chatReminders.has(reference.id)}
        main={
          <>
            <StatusDot indicator={chat.indicator} shared={shared} />
            <Text style={styles.label} numberOfLines={1}>
              {chat.name}
            </Text>
            {!groupedByWorkspace && workspace ? <Text style={styles.secondary} numberOfLines={1}>{workspace}</Text> : null}
            {elapsed ? <Text style={styles.time}>{elapsed}</Text> : <View style={{ marginLeft: "auto" }} />}
          </>
        }
        actions={<RemindButton agentId={reference.id} label={chat.name} onPress={remind.toggle} shared={shared} />}
        shared={shared}
      />
      {remind.open ? <InlinePicker agentId={reference.id} workspaceId={chat.workspaceId} title={chat.name} onDone={remind.close} shared={shared} /> : null}
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
      {collapsed ? <Icon name="ChevronRight" size={12} color={props.theme.colors.foregroundMuted} /> : null}
    </Pressable>
  );
}

// A project group's heading, as in Paseo's own sidebar: a letter tile and the project's name.
// Pressing it folds the group; on hover a plus opens Paseo's New workspace screen for the project
// (what Paseo's openProject navigation shows).
function ProjectHeading({ title, first, count, collapsed, onToggle, shared }: { title: string; first: WorkspaceRef | null; count: number; collapsed: boolean; onToggle(): void; shared: Shared }) {
  const { styles, config, props, t } = shared;
  const project = useWorkspace(first ?? "", (workspace) => workspace.project) ?? null;
  const [hovered, setHovered] = useState(false);
  return (
    <View onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={[styles.project, hovered ? styles.hovered : null]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${title}, ${count} ${count === 1 ? "workspace" : "workspaces"}`} onPress={onToggle} style={styles.projectMain}>
        <View style={[styles.tile, { backgroundColor: tileColor(title) }]}>
          <Text style={styles.tileText}>{title.trim().charAt(0).toUpperCase() || "?"}</Text>
        </View>
        <Text style={styles.projectText} numberOfLines={1}>
          {title}
        </Text>
        {config.counts ? <Text style={styles.count}>{count}</Text> : null}
        <View style={{ flex: 1 }} />
        {collapsed || hovered ? <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={13} color={props.theme.colors.foregroundMuted} /> : null}
      </Pressable>
      {project && (hovered || TOUCH) ? <IconButton t={t} size="sm" icon="Plus" label={`New workspace in ${title}`} onPress={() => props.navigation.openProject(project)} /> : null}
    </View>
  );
}

type Menu = "filter" | "view" | null;

interface HeaderProps {
  menu: Menu;
  setMenu(menu: Menu): void;
  searching: boolean;
  setSearching(on: boolean): void;
  search: string;
  onSearch(text: string): void;
  filters: number;
  // Opens the next item that needs the user; null when nothing does.
  onNext: (() => void) | null;
  shared: Shared;
}

// The view's header, like Paseo's "Workspaces" heading: the list's name, then icon buttons for
// search, filters, view options and Next. Menus open over the list instead of pushing it down.
function Header({ menu, setMenu, searching, setSearching, search, onSearch, filters, onNext, shared }: HeaderProps) {
  const { styles, props, t, config } = shared;
  const showSearch = searching || search !== "";
  const toggle = (next: Exclude<Menu, null>) => setMenu(menu === next ? null : next);
  return (
    <View style={styles.header}>
      <Text style={styles.headerText}>{config.list === "chats" ? "Chats" : "Workspaces"}</Text>
      <IconButton t={t} size="sm" icon="Search" tone={showSearch ? props.theme.colors.foreground : undefined} label={showSearch ? "Close search" : "Search"} onPress={() => (showSearch ? (onSearch(""), setSearching(false)) : setSearching(true))} />
      <View>
        <IconButton t={t} size="sm" icon="ListFilter" tone={filters || menu === "filter" ? props.theme.colors.foreground : undefined} label={filters ? `Filters, ${filters} on` : "Filter"} onPress={() => toggle("filter")} />
        {filters ? <View pointerEvents="none" style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: props.theme.colors.accent }} /> : null}
      </View>
      <IconButton t={t} size="sm" icon="SlidersHorizontal" tone={menu === "view" ? props.theme.colors.foreground : undefined} label="View options: grouping, sorting, rows per group" onPress={() => toggle("view")} />
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
  const toggleStatus = (indicator: Indicator) => {
    const on = !needsMe && statuses.includes(indicator);
    save({ statusFilter: on ? statuses.filter((item) => item !== indicator) : [...(needsMe ? [] : statuses), indicator] });
  };
  const toggleProject = (key: string) => save({ projectFilter: state.projectFilter.includes(key) ? state.projectFilter.filter((item) => item !== key) : [...state.projectFilter, key] });
  return (
    <>
      <MenuSection title="Status" shared={shared}>
        <MenuItem t={t} role="checkbox" icon="Hand" label="Needs me" hint="permission or failed" checked={needsMe} onPress={() => save({ statusFilter: needsMe ? [] : [...NEEDS_ME] })} />
        {INDICATORS.map((indicator) => (
          <MenuItem key={indicator} t={t} role="checkbox" dot={indicator === "done" ? props.theme.colors.foregroundMuted : indicator === "attention" ? props.theme.colors.foreground : props.theme.colors[INDICATOR_TOKEN[indicator]]} label={STATUS_TITLES[indicator]} checked={!needsMe && statuses.includes(indicator)} onPress={() => toggleStatus(indicator)} />
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

// Grouping, sorting, rows per group and row details, saved to the active layout so every app
// shows the same list.
function ViewMenu({ update, shared }: { update(patch: Partial<ViewConfig>): void; shared: Shared }) {
  const { t, config } = shared;
  const radio = <Value extends string>(value: Value, current: Value, label: string, apply: () => void, hint?: string) => <MenuItem key={value} t={t} role="radio" label={label} hint={hint} checked={value === current} onPress={apply} />;
  const perGroup = config.rowLimit.enabled ? config.rowLimit.rows : 0;
  return (
    <>
      <MenuSection title="Group by" shared={shared}>
        {(
          [
            ["project", "Project"],
            ["status", "Status"],
            ["activity", "Last used"],
            ["label", "Label"],
            ["none", "No groups"],
          ] as const
        ).map(([value, label]) => radio(value, config.groupBy, label, () => update({ groupBy: value })))}
      </MenuSection>
      <MenuSection title="Sort by" shared={shared}>
        {(
          [
            ["activity", "Last prompt"],
            ["status", "Status"],
            ["name", "Name"],
            ["created", "Newest"],
            ["statusChanged", "Latest status change"],
            ["changes", "Most changed lines"],
          ] as const
        ).map(([value, label]) => radio(value, config.orderBy, label, () => update({ orderBy: value })))}
      </MenuSection>
      <MenuSection title="Per group" shared={shared}>
        {[...new Set([5, 10, 20, ...(perGroup && ![5, 10, 20].includes(perGroup) ? [perGroup] : []), 0])].map((rows) =>
          radio(String(rows), String(perGroup), rows === 0 ? "Show all" : `${rows}, then Show more`, () => update({ rowLimit: rows === 0 ? { ...config.rowLimit, enabled: false } : { enabled: true, rows } })),
        )}
      </MenuSection>
      {config.list === "workspaces" ? (
        <MenuSection title="Chats under workspaces" shared={shared}>
          {radio("off", config.showAgents ? config.agentsFor ?? "active" : "off", "Hidden", () => update({ showAgents: false }))}
          {radio("active", config.showAgents ? config.agentsFor ?? "active" : "off", "Open workspace only", () => update({ showAgents: true, agentsFor: "active" }))}
          {radio("all", config.showAgents ? config.agentsFor ?? "active" : "off", "Every workspace", () => update({ showAgents: true, agentsFor: "all" }))}
        </MenuSection>
      ) : null}
      <MenuSection title="Rows" shared={shared}>
        <MenuItem t={t} role="checkbox" label="Comfortable height" checked={config.density === "comfortable"} onPress={() => update({ density: config.density === "comfortable" ? "compact" : "comfortable" })} />
        <MenuItem t={t} role="checkbox" label="Branch" checked={config.details.branch} onPress={() => update({ details: { ...config.details, branch: !config.details.branch } })} />
        <MenuItem t={t} role="checkbox" label="Changed lines" checked={config.details.diff} onPress={() => update({ details: { ...config.details, diff: !config.details.diff } })} />
        <MenuItem t={t} role="checkbox" label="Time in status" checked={config.details.timeInStatus} onPress={() => update({ details: { ...config.details, timeInStatus: !config.details.timeInStatus } })} />
        <MenuItem t={t} role="checkbox" label="Counts in headings" checked={config.counts} onPress={() => update({ counts: !config.counts })} />
      </MenuSection>
    </>
  );
}

export interface ViewDeps extends PickerDeps {
  // Saves the view's group, sort and limit options to the active layout.
  updateView(patch: Partial<ViewConfig>): Promise<void>;
}

interface RowSource {
  sections: { key: string; title: string | null; items: readonly { key: string }[] }[];
  // Rows the row limit never hides.
  protectedKeys: ReadonlySet<string>;
  // Opens the next row that needs the user, in view order; null when none does.
  onNext: (() => void) | null;
  noun: string;
  renderRow(reference: { key: string }, shared: Shared): ReactNode;
  // Chat groups by workspace carry the workspace id as title; their heading looks up its name.
  groupsAreWorkspaces: boolean;
}

type Where<Snapshot> = (item: Snapshot) => boolean;

// Next visits what needs the user in the order the view shows it, then anything a filter hides,
// so a filter never makes Next say "Nothing needs you" while something does.
function withHidden<Ref extends { key: string }>(shown: readonly Ref[], all: readonly Ref[]): Ref[] {
  const keys = new Set(shown.map((ref) => ref.key));
  return [...shown, ...all.filter((ref) => !keys.has(ref.key))];
}

function workspaceRows(config: ViewConfig) {
  const compare = compareWorkspaces(config);
  const useSections =
    config.groupBy === "none"
      ? (where: Where<PluginWorkspaceSnapshot>) => [{ key: "all", title: null, items: useWorkspaces({ where, orderBy: compare }) }]
      : (where: Where<PluginWorkspaceSnapshot>) =>
          orderGroups<Group<WorkspaceRef>>(useWorkspaces({ where, orderBy: compare, groupBy: (workspace) => groupKeys(config, workspace) }), config);
  // Like Paseo's own sidebar, pinned workspaces get their own section above the groups.
  const pinnedApart = config.pinnedFirst && config.groupBy !== "none";
  return function useWorkspaceRows(filter: Filter, props: PluginSidebarViewProps): RowSource {
    const shown = (workspace: PluginWorkspaceSnapshot) => isVisible(workspace) && matchesFilter(workspace, filter);
    const pinned = useWorkspaces({ where: (workspace) => shown(workspace) && workspace.pinnedAt !== null, orderBy: compare });
    const grouped = useSections((workspace) => shown(workspace) && !(pinnedApart && workspace.pinnedAt !== null));
    const sections = pinnedApart && pinned.length ? [{ key: "pinned", title: "Pinned", items: pinned }, ...grouped] : grouped;
    const protectedKeys = new Set(useWorkspaces({ where: (workspace) => shown(workspace) && isProtected(workspace) }).map((ref) => ref.key));
    const waitingRefs = useWorkspaces({ where: (workspace) => isVisible(workspace) && needsAttention(workspace.indicator), orderBy: compare });
    const next = nextAttention(withHidden(attentionOrder(sections, new Set(waitingRefs.map((ref) => ref.key))), waitingRefs), props.active.workspace?.key ?? null);
    return {
      sections,
      protectedKeys,
      onNext: next ? () => props.navigation.openWorkspace(next) : null,
      noun: "workspaces",
      renderRow: (reference, shared) => <WorkspaceRow key={reference.key} reference={reference as WorkspaceRef} shared={shared} />,
      groupsAreWorkspaces: false,
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
  return function useChatRows(filter: Filter, props: PluginSidebarViewProps): RowSource {
    const shown = (chat: PluginAgentSnapshot) => isListedChat(chat) && chatMatches(chat, filter);
    const sections = useSections(shown);
    const isProtectedChat = (chat: PluginAgentSnapshot) => ["needs_input", "failed"].includes(chatIndicator(chat));
    const protectedKeys = new Set(useAgents({ where: (chat) => shown(chat) && isProtectedChat(chat) }).map((ref) => ref.key));
    const waitingRefs = useAgents({ where: (chat) => isListedChat(chat) && needsAttention(chatIndicator(chat)), orderBy: compare });
    const next = nextAttention(withHidden(attentionOrder(sections, new Set(waitingRefs.map((ref) => ref.key))), waitingRefs), props.active.agent?.key ?? null);
    return {
      sections,
      protectedKeys,
      onNext: next ? () => props.navigation.openAgent(next) : null,
      noun: "chats",
      renderRow: (reference, shared) => <ChatRow key={reference.key} reference={reference as AgentRef} shared={shared} />,
      groupsAreWorkspaces: config.groupBy !== "status",
    };
  };
}

// A heading for a group of chats from one workspace, titled with that workspace's name.
function WorkspaceGroupHeading(props: { workspaceId: string; count: number; collapsed: boolean; onToggle(): void; shared: Shared }) {
  const name = useWorkspace(props.workspaceId, (workspace) => workspace.title ?? workspace.name);
  return <GroupHeading title={name ?? "Workspace"} count={props.count} collapsed={props.collapsed} onToggle={props.onToggle} shared={props.shared} />;
}

export function createSidebarView(config: ViewConfig, deps: ViewDeps) {
  // Chosen once per profile, so each view instance always calls the same hooks.
  const useRows = config.list === "chats" ? chatRows(config) : workspaceRows(config);

  return function MorphiseSidebarView(props: PluginSidebarViewProps) {
    const styles = useMemo(() => viewStyles(props.theme, config), [props.theme]);
    const t = useTokens(props.theme, TOUCH);
    const reminders = remindersOf(tasksOf(useValue(deps.tasks)));
    // Rows show times, so the clock ticks every minute.
    const now = useReminderClock(reminders.map((entry) => entry.reminder), true);
    const viewState = useSettings(viewStateSettings);
    const state = viewState.status === "ready" ? viewState.values : DEFAULT_VIEW_STATE;
    const ui = useValue(viewUi);
    const setUi = (patch: Partial<typeof ui>) => viewUi.set({ ...viewUi.get(), ...patch });
    const { search, searching, menu } = ui;
    const expanded = new Set(ui.expanded);
    const setSearch = (text: string) => setUi({ search: text });
    const setSearching = (on: boolean) => setUi({ searching: on });
    const setMenu = (next: Menu) => setUi({ menu: next });
    const setExpanded = (next: ReadonlySet<string>) => setUi({ expanded: [...next] });
    // Project names for the Projects filter, from the same visible workspaces.
    const projects = useWorkspaces({ where: isVisible, groupBy: (workspace) => ({ key: workspace.project.key, title: workspace.projectDisplayName }) }).map((group) => ({ key: group.key, title: group.title ?? "Project" }));
    const toast = useToast();
    // Tells the settings screen that Paseo is showing this view.
    useEffect(() => viewPresence.set(true), []);

    const saveState = (next: Partial<ViewState>) => {
      if (viewState.status !== "ready") return;
      void viewState.save({ ...viewState.values, ...next }, viewState.revision).then((saved) => {
        if (!saved) toast.error("Could not remember this view change on this device");
      });
    };

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
    const source = useRows(filter, props);
    const { sections, protectedKeys } = source;

    const dueEntries = reminders.filter((entry) => isDue(entry.reminder, now));
    const dueChatIds = new Set(dueEntries.flatMap((entry) => (entry.agentId ? [entry.agentId] : [])));
    const dueChats = new Map(useAgents({ where: (agent) => dueChatIds.has(agent.id) }).map((ref) => [ref.id, ref]));
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
    const later = (taskId: string, minutes: number) => void deps.apply({ kind: "remindAgain", id: taskId, minutes }).catch(report(toast, "move the reminder"));
    const shared: Shared = { props, styles, t, config, now, workspaceReminders, statuses: filter.statuses, chatReminders, picker: deps, done, later };
    const collapsed = new Set(state.collapsed);
    const toggleCollapsed = (key: string) =>
      saveState({ collapsed: collapsed.has(key) ? state.collapsed.filter((item) => item !== key) : [...state.collapsed, key] });
    const nothing = sections.every((section) => section.items.length === 0) && dueEntries.length === 0;
    const remindersFolded = collapsed.has(REMINDERS_GROUP);

    const placeholder = config.list === "chats" ? "Search chats" : "Search name, branch or project";
    const activeTags = [
      ...(needsMeOn(filter.statuses) ? [{ key: "needs", label: "Needs me", color: props.theme.colors.statusWarning, remove: () => saveState({ statusFilter: [] }) }] : filter.statuses.map((indicator) => ({ key: indicator, label: STATUS_TITLES[indicator], color: props.theme.colors[INDICATOR_TOKEN[indicator]], remove: () => saveState({ statusFilter: state.statusFilter.filter((item) => item !== indicator) }) }))),
      ...(filter.projects ?? []).map((key) => ({ key, label: projects.find((project) => project.key === key)?.title ?? "Project", color: tileColor(projects.find((project) => project.key === key)?.title ?? ""), remove: () => saveState({ projectFilter: state.projectFilter.filter((item) => item !== key) }) })),
      ...(filter.hideDone ? [{ key: "hideDone", label: "Done hidden", color: undefined, remove: () => saveState({ hideDone: false }) }] : []),
      ...(filter.changedOnly ? [{ key: "changed", label: "Changed", color: undefined, remove: () => saveState({ changedOnly: false }) }] : []),
      ...(filter.pinnedOnly ? [{ key: "pinned", label: "Pinned", color: undefined, remove: () => saveState({ pinnedOnly: false }) }] : []),
    ];

    return (
      <View style={styles.scroll}>
        {on ? (
          <Header menu={menu} setMenu={setMenu} searching={searching} setSearching={setSearching} search={search} onSearch={setSearch} filters={filters} onNext={source.onNext} shared={shared} />
        ) : null}
        {on && (searching || search !== "" || activeTags.length) ? (
          <View style={styles.tools}>
            {searching || search !== "" ? <Field t={t} plain autoFocus={searching && search === ""} icon="Search" value={search} onChangeText={setSearch} placeholder={placeholder} accessibilityLabel={placeholder} /> : null}
            {activeTags.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {activeTags.map((tag) => (
                  <Tag key={tag.key} t={t} label={tag.label} color={tag.color} onRemove={tag.remove} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 12 }}>
        {dueEntries.length > 0 ? (
          <View>
            <GroupHeading title="Reminders" count={dueEntries.length} collapsed={remindersFolded} onToggle={() => toggleCollapsed(REMINDERS_GROUP)} shared={shared} />
            {remindersFolded ? null : dueEntries.map((entry) => <ReminderRow key={`${entry.taskId}:${entry.reminder.setAt}`} entry={entry} chat={entry.agentId ? dueChats.get(entry.agentId) ?? null : null} shared={shared} />)}
          </View>
        ) : null}
        {nothing ? <Text style={styles.empty}>{filter.search || filters ? `No ${source.noun} match` : `No ${source.noun} yet`}</Text> : null}
        {sections.map((section) => {
          const folded = section.title !== null && collapsed.has(section.key);
          // The Pinned section is never shortened: pins are few by choice.
          const limit = section.key === "pinned" ? { ...config.rowLimit, enabled: false } : config.rowLimit;
          const { rows, hidden } = capRows(section.items, protectedKeys, limit, expanded.has(section.key));
          const collapsible = expanded.has(section.key) && capRows(section.items, protectedKeys, limit, false).hidden > 0;
          const heading =
            section.title === null ? null : source.groupsAreWorkspaces ? (
              <WorkspaceGroupHeading workspaceId={section.title} count={section.items.length} collapsed={folded} onToggle={() => toggleCollapsed(section.key)} shared={shared} />
            ) : section.key.startsWith("project:") ? (
              <ProjectHeading title={section.title} first={(section.items[0] as WorkspaceRef | undefined) ?? null} count={section.items.length} collapsed={folded} onToggle={() => toggleCollapsed(section.key)} shared={shared} />
            ) : (
              <GroupHeading title={section.title} count={section.items.length} collapsed={folded} onToggle={() => toggleCollapsed(section.key)} shared={shared} />
            );
          return (
            <View key={section.key}>
              {heading}
              {folded ? null : rows.map((reference) => source.renderRow(reference, shared))}
              {!folded && hidden > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${hidden} more ${source.noun}`}
                  onPress={() => setExpanded(new Set([...expanded, section.key]))}
                  style={styles.more}
                >
                  <Icon name="ChevronDown" size={14} color={props.theme.colors.foregroundMuted} />
                  <Text style={styles.moreText}>Show more</Text>
                  <Text style={styles.count}>{hidden}</Text>
                </Pressable>
              ) : null}
              {!folded && collapsible ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Show fewer ${source.noun}`}
                  onPress={() => setExpanded(new Set([...expanded].filter((key) => key !== section.key)))}
                  style={styles.more}
                >
                  <Icon name="ChevronUp" size={14} color={props.theme.colors.foregroundMuted} />
                  <Text style={styles.moreText}>Show less</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
          {menu ? (
            <>
              {/* Tapping outside the menu closes it. */}
              <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setMenu(null)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
              <View style={styles.menu}>
                <ScrollView>
                  {menu === "filter" ? <FilterMenu state={state} save={saveState} projects={projects} shared={shared} /> : <ViewMenu update={updateView} shared={shared} />}
                </ScrollView>
              </View>
            </>
          ) : null}
        </View>
      </View>
    );
  };
}
