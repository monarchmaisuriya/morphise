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
import { type ValueStore, useValue } from "./profile-store";
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

const DEFAULT_VIEW_STATE: ViewState = { collapsed: [], statusFilter: [] };
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

// Sizes match Paseo's own sidebar (measured on 0.16.0-beta.1): 36px rows inset 8px with an 8px
// radius, 14px titles, 12px muted section labels and dimmer 12px times; the selected row uses
// surface2. "Compact" density trims rows to 30px.
function viewStyles(theme: Theme, config: ViewConfig) {
  const c = theme.colors;
  const height = TOUCH ? 44 : config.density === "compact" ? 30 : 36;
  return {
    scroll: { flex: 1 },
    header: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: 36, paddingLeft: 16, paddingRight: 8, gap: 2 },
    headerText: { color: c.foregroundMuted, fontSize: 12, flex: 1 },
    tools: { paddingHorizontal: 8, paddingBottom: 4, gap: 6 },
    heading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, minHeight: 32, paddingLeft: 16, paddingRight: 12, marginTop: 6 },
    headingText: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1 },
    count: { color: c.foregroundMuted, fontSize: 12, opacity: 0.6 },
    project: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: TOUCH ? 44 : 36, marginHorizontal: 8, marginTop: 8, paddingLeft: 8, paddingRight: 4, borderRadius: 8, gap: 2 },
    projectMain: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: 10, minHeight: TOUCH ? 44 : 36 },
    tile: { width: 16, height: 16, borderRadius: 4, alignItems: "center" as const, justifyContent: "center" as const },
    tileText: { color: "#ffffff", fontSize: 10, fontWeight: "700" as const },
    projectText: { color: c.foregroundMuted, fontSize: 14, flexShrink: 1 },
    row: { minHeight: height, marginHorizontal: 8, paddingLeft: 12, paddingRight: 4, borderRadius: 8, flexDirection: "row" as const, alignItems: "center" as const, gap: 2 },
    rowMain: { flex: 1, minWidth: 0, minHeight: height, flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
    child: { paddingLeft: 30, minHeight: TOUCH ? 40 : 30 },
    selected: { backgroundColor: c.surface2 },
    hovered: { backgroundColor: c.surface1 },
    label: { color: c.foreground, fontSize: config.density === "compact" ? 13 : 14, flexShrink: 1 },
    childLabel: { color: c.foregroundMuted, fontSize: 13, flexShrink: 1 },
    secondary: { color: c.foregroundMuted, fontSize: 12, flexShrink: 1, opacity: 0.75 },
    time: { color: c.foregroundMuted, fontSize: 12, opacity: 0.6, marginLeft: "auto" as const },
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
  const elapsed = details.timeInStatus ? formatElapsed(workspace.since, now) : null;
  const reminder = shared.workspaceReminders.get(reference.id) ?? null;
  const details2 = [details.project ? workspace.project : null, details.branch ? workspace.branch : null].filter(Boolean).join(" · ");
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
          <View style={[styles.dot, { backgroundColor: props.theme.colors[INDICATOR_TOKEN[workspace.indicator]] }]} />
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
      {config.showAgents ? <WorkspaceAgents reference={reference} shared={shared} /> : null}
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
  const elapsed = config.details.timeInStatus ? formatElapsed(chat.last, now) : null;
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
            <View style={[styles.dot, { backgroundColor: props.theme.colors[INDICATOR_TOKEN[chat.indicator]] }]} />
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

interface FilterBarProps {
  search: string;
  onSearch(text: string): void;
  statuses: readonly Indicator[];
  onStatuses(next: Indicator[]): void;
  // Opens the next item that needs the user; null when nothing does.
  onNext: (() => void) | null;
  placeholder: string;
  shared: Shared;
}

// The view's header, like Paseo's "Workspaces" heading: the list name and icon buttons for
// search, the status filter and Next. Search opens a field; the filter opens a menu; active status
// filters stay visible as removable tags.
function FilterBar({ search, onSearch, statuses, onStatuses, onNext, placeholder, shared }: FilterBarProps) {
  const { styles, props, t, config } = shared;
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const needsMe = needsMeOn(statuses);
  const active = needsMe ? 1 : statuses.length;
  const toggleStatus = (indicator: Indicator) => {
    const on = !needsMe && statuses.includes(indicator);
    onStatuses(on ? statuses.filter((item) => item !== indicator) : [...(needsMe ? [] : statuses), indicator]);
  };
  const showSearch = searching || search !== "";
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.headerText}>{config.list === "chats" ? "Chats" : "Workspaces"}</Text>
        <IconButton t={t} size="sm" icon="Search" tone={showSearch ? props.theme.colors.foreground : undefined} label={showSearch ? "Close search" : "Search"} onPress={() => (showSearch ? (onSearch(""), setSearching(false)) : setSearching(true))} />
        <View>
          <IconButton t={t} size="sm" icon="ListFilter" tone={active ? props.theme.colors.accent : undefined} label={active ? `Status filter, ${active} on` : "Filter by status"} onPress={() => setMenu(!menu)} />
          {active ? <View pointerEvents="none" style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: props.theme.colors.accent }} /> : null}
        </View>
        <IconButton t={t} size="sm" icon="SkipForward" label={onNext ? "Open the next one that needs you" : "Nothing needs you"} disabled={onNext === null} onPress={() => onNext?.()} />
      </View>
      {showSearch || menu || active ? (
        <View style={styles.tools}>
          {showSearch ? <Field t={t} plain autoFocus={searching && search === ""} icon="Search" value={search} onChangeText={onSearch} placeholder={placeholder} accessibilityLabel={placeholder} /> : null}
          {menu ? (
            <View style={{ padding: 4, borderRadius: 10, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
              <MenuItem t={t} role="checkbox" icon="Hand" label="Needs me" hint="permission or failed" checked={needsMe} onPress={() => onStatuses(needsMe ? [] : [...NEEDS_ME])} />
              {INDICATORS.map((indicator) => (
                <MenuItem key={indicator} t={t} role="checkbox" dot={props.theme.colors[INDICATOR_TOKEN[indicator]]} label={STATUS_TITLES[indicator]} checked={!needsMe && statuses.includes(indicator)} onPress={() => toggleStatus(indicator)} />
              ))}
              {active ? <MenuItem t={t} icon="X" label="Show all" onPress={() => onStatuses([])} /> : null}
            </View>
          ) : active ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {needsMe ? (
                <Tag t={t} label="Needs me" color={props.theme.colors.statusWarning} onRemove={() => onStatuses([])} />
              ) : (
                statuses.map((indicator) => <Tag key={indicator} t={t} label={STATUS_TITLES[indicator]} color={props.theme.colors[INDICATOR_TOKEN[indicator]]} onRemove={() => toggleStatus(indicator)} />)
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export type ViewDeps = PickerDeps;

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
    const waiting = new Set(useWorkspaces({ where: (workspace) => isVisible(workspace) && needsAttention(workspace.indicator) }).map((ref) => ref.key));
    const next = nextAttention(attentionOrder(sections, waiting), props.active.workspace?.key ?? null);
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
    const waiting = new Set(useAgents({ where: (chat) => isListedChat(chat) && needsAttention(chatIndicator(chat)) }).map((ref) => ref.key));
    const next = nextAttention(attentionOrder(sections, waiting), props.active.agent?.key ?? null);
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
    const now = useReminderClock(reminders.map((entry) => entry.reminder), config.details.timeInStatus);
    const viewState = useSettings(viewStateSettings);
    const state = viewState.status === "ready" ? viewState.values : DEFAULT_VIEW_STATE;
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const toast = useToast();
    // Tells the settings screen that Paseo is showing this view.
    useEffect(() => viewPresence.set(true), []);

    const saveState = (next: Partial<ViewState>) => {
      if (viewState.status !== "ready") return;
      void viewState.save({ ...viewState.values, ...next }, viewState.revision).then((saved) => {
        if (!saved) toast.error("Could not remember this view change on this device");
      });
    };

    const filter: Filter = { statuses: config.filterBar ? state.statusFilter : [], search: config.filterBar ? search : "" };
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

    return (
      <ScrollView style={styles.scroll}>
        {config.filterBar ? (
          <FilterBar
            search={search}
            onSearch={setSearch}
            statuses={state.statusFilter}
            onStatuses={(statusFilter) => saveState({ statusFilter })}
            onNext={source.onNext}
            placeholder={config.list === "chats" ? "Search chats" : "Search name, branch or project"}
            shared={shared}
          />
        ) : null}
        {dueEntries.length > 0 ? (
          <View>
            <GroupHeading title="Reminders" count={dueEntries.length} collapsed={remindersFolded} onToggle={() => toggleCollapsed(REMINDERS_GROUP)} shared={shared} />
            {remindersFolded ? null : dueEntries.map((entry) => <ReminderRow key={`${entry.taskId}:${entry.reminder.setAt}`} entry={entry} chat={entry.agentId ? dueChats.get(entry.agentId) ?? null : null} shared={shared} />)}
          </View>
        ) : null}
        {nothing ? <Text style={styles.empty}>{filter.search || filter.statuses.length ? `No ${source.noun} match` : `No ${source.noun} yet`}</Text> : null}
        {sections.map((section) => {
          const folded = section.title !== null && collapsed.has(section.key);
          const { rows, hidden } = capRows(section.items, protectedKeys, config.rowLimit, expanded.has(section.key));
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
            </View>
          );
        })}
      </ScrollView>
    );
  };
}
