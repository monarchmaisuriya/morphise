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
import { Icon, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
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
import { viewPresence } from "./view-presence";

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
const REMINDERS_GROUP = "reminders";

function viewStyles(theme: Theme, config: ViewConfig, compact: boolean) {
  const height = config.density === "compact" ? 28 : 36;
  return {
    scroll: { flex: 1 },
    filterBar: { paddingHorizontal: 8, paddingTop: 8, gap: 6 },
    searchRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    search: {
      flex: 1,
      height: 28,
      paddingHorizontal: 8,
      fontSize: 12,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 6,
    },
    next: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      height: 28,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    nextText: { color: theme.colors.foreground, fontSize: 11 },
    disabled: { opacity: 0.45 },
    chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 4 },
    chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
    chipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    chipText: { color: theme.colors.foregroundMuted, fontSize: 11 },
    chipTextOn: { color: theme.colors.accentForeground, fontSize: 11 },
    heading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 },
    headingText: { color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 },
    count: { color: theme.colors.foregroundMuted, fontSize: 11, opacity: 0.7 },
    row: { minHeight: height, paddingLeft: 12, paddingRight: 4, flexDirection: "row" as const, alignItems: "center" as const },
    rowMain: { flex: 1, minHeight: height, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    agentRow: { minHeight: height - 4, paddingLeft: 30, paddingRight: 12, flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    selected: { backgroundColor: theme.colors.surface2 },
    label: { color: theme.colors.foreground, fontSize: 12, lineHeight: 16, flexShrink: 1 },
    secondary: { color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 },
    due: { color: theme.colors.statusWarning, fontSize: 11 },
    added: { color: theme.colors.statusSuccess, fontSize: 11 },
    removed: { color: theme.colors.statusDanger, fontSize: 11 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    // Phones need finger-sized targets.
    action: { padding: compact ? 10 : 4, borderRadius: 4 },
    more: { paddingLeft: 26, paddingVertical: 4 },
    moreText: { color: theme.colors.accent, fontSize: 11 },
    empty: { color: theme.colors.foregroundMuted, fontSize: 12, padding: 12 },
  };
}

type Styles = ReturnType<typeof viewStyles>;

interface Shared {
  props: PluginSidebarViewProps;
  styles: Styles;
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

function RemindButton({ agentId, label, onPress, shared }: { agentId: string; label: string; onPress(): void; shared: Shared }) {
  const reminder = shared.chatReminders.get(agentId);
  const color = reminder ? (isDue(reminder, shared.now) ? shared.props.theme.colors.statusWarning : shared.props.theme.colors.accent) : shared.props.theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reminder ? `Reminder for ${label}: ${formatDue(reminder, shared.now)}. Change it` : `Remind me about ${label}`}
      onPress={onPress}
      style={shared.styles.action}
    >
      <Icon name="AlarmClock" size={13} color={color} />
    </Pressable>
  );
}

function InlinePicker({ agentId, workspaceId, title, onDone, shared }: { agentId: string; workspaceId: string; title: string; onDone(): void; shared: Shared }) {
  return (
    <View style={{ marginLeft: 12, marginRight: 4, marginBottom: 4, borderWidth: 1, borderRadius: 8, borderColor: shared.props.theme.colors.border }}>
      <ReminderPicker deps={shared.picker} target={{ kind: "chat", agentId, workspaceId, title }} title={title} theme={shared.props.theme} embedded onDone={onDone} />
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
      <View style={[styles.row, selected ? styles.selected : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open agent ${label}`}
          onPress={() => props.navigation.openAgent(reference)}
          onLongPress={remind.toggle}
          style={[styles.agentRow, { flex: 1 }]}
        >
          <Icon name="Bot" size={12} color={props.theme.colors.foregroundMuted} />
          <Text style={styles.secondary} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        <RemindButton agentId={reference.id} label={label} onPress={remind.toggle} shared={shared} />
      </View>
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
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={shared.styles.action}>
      <Icon name={icon} size={13} color={shared.props.theme.colors.foregroundMuted} />
    </Pressable>
  );
}

// A task whose reminder is due, listed at the top of the view. Tapping opens its chat when it
// has one.
function ReminderRow({ entry, chat, shared }: { entry: AlertEntry; chat: AgentRef | null; shared: Shared }) {
  const { props, styles, now } = shared;
  const due = formatDue(entry.reminder, now);
  const open = chat ? () => props.navigation.openAgent(chat) : null;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? `Open the chat for ${entry.title}, reminder ${due}` : `${entry.title}, reminder ${due}`}
        disabled={!open}
        onPress={() => open?.()}
        style={styles.rowMain}
      >
        <Icon name="AlarmClock" size={12} color={props.theme.colors.statusWarning} />
        <Text style={styles.label} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.due}>{due}</Text>
      </Pressable>
      <RowAction icon="Clock" label={`Remind me about ${entry.title} again in 15 minutes`} onPress={() => shared.later(entry.taskId, 15)} shared={shared} />
      <RowAction icon="Check" label={`Mark the reminder for ${entry.title} done`} onPress={() => shared.done(entry.taskId)} shared={shared} />
    </View>
  );
}

function WorkspaceRow({ reference, shared }: { reference: WorkspaceRef; shared: Shared }) {
  const { props, styles, config, now } = shared;
  const paseo = usePaseo();
  const toast = useToast();
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
  const elapsed = details.timeInStatus ? formatElapsed(workspace.since, now) : null;
  const reminder = shared.workspaceReminders.get(reference.id) ?? null;
  return (
    <View>
      <View style={[styles.row, selected ? styles.selected : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open workspace ${workspace.name}, ${STATUS_TITLES[workspace.indicator]}`}
          onPress={() => props.navigation.openWorkspace(reference)}
          style={styles.rowMain}
        >
          <View style={[styles.dot, { backgroundColor: props.theme.colors[INDICATOR_TOKEN[workspace.indicator]] }]} />
          {workspace.pinned ? <Icon name="Pin" size={10} color={props.theme.colors.foregroundMuted} /> : null}
          <Text style={styles.label} numberOfLines={1}>
            {workspace.name}
          </Text>
          {details.project ? <Text style={styles.secondary} numberOfLines={1}>{workspace.project}</Text> : null}
          {details.branch && workspace.branch ? <Text style={styles.secondary} numberOfLines={1}>{workspace.branch}</Text> : null}
          {details.diff && workspace.diff && workspace.diff.additions + workspace.diff.deletions > 0 ? (
            <Text>
              <Text style={styles.added}>+{workspace.diff.additions}</Text> <Text style={styles.removed}>-{workspace.diff.deletions}</Text>
            </Text>
          ) : null}
          {elapsed ? <Text style={styles.secondary}>{elapsed}</Text> : null}
          {reminder ? (
            <>
              <Icon name="AlarmClock" size={10} color={props.theme.colors.foregroundMuted} />
              <Text style={styles.secondary} numberOfLines={1}>
                {formatDue(reminder, now)}
              </Text>
            </>
          ) : null}
        </Pressable>
        {config.rowActions.includes("pin") ? (
          <RowAction
            icon={workspace.pinned ? "PinOff" : "Pin"}
            label={workspace.pinned ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`}
            onPress={() => void paseo.workspaces.ref(reference.id).setPinned(!workspace.pinned).catch(report(toast, "change the pin"))}
            shared={shared}
          />
        ) : null}
      </View>
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
      <View style={[styles.row, selected ? styles.selected : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open chat ${chat.name}, ${STATUS_TITLES[chat.indicator]}`}
          onPress={() => props.navigation.openAgent(reference)}
          onLongPress={remind.toggle}
          style={styles.rowMain}
        >
          <View style={[styles.dot, { backgroundColor: props.theme.colors[INDICATOR_TOKEN[chat.indicator]] }]} />
          <Text style={styles.label} numberOfLines={1}>
            {chat.name}
          </Text>
          {!groupedByWorkspace && workspace ? <Text style={styles.secondary} numberOfLines={1}>{workspace}</Text> : null}
          {elapsed ? <Text style={styles.secondary}>{elapsed}</Text> : null}
        </Pressable>
        <RemindButton agentId={reference.id} label={chat.name} onPress={remind.toggle} shared={shared} />
      </View>
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
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={11} color={props.theme.colors.foregroundMuted} />
      <Text style={styles.headingText} numberOfLines={1}>
        {title}
      </Text>
      {config.counts ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

function Chip({ label, on, onPress, shared }: { label: string; on: boolean; onPress(): void; shared: Shared }) {
  const { styles } = shared;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`Show ${label}`}
      onPress={onPress}
      style={[styles.chip, on ? styles.chipOn : null]}
    >
      <Text style={on ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </Pressable>
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

function FilterBar({ search, onSearch, statuses, onStatuses, onNext, placeholder, shared }: FilterBarProps) {
  const { styles, props } = shared;
  const needsMe = needsMeOn(statuses);
  return (
    <View style={styles.filterBar}>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search workspaces"
          placeholder={placeholder}
          placeholderTextColor={props.theme.colors.foregroundMuted}
          value={search}
          onChangeText={onSearch}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onNext ? "Open the next one that needs you" : "Nothing needs you"}
          accessibilityState={{ disabled: onNext === null }}
          disabled={onNext === null}
          onPress={() => onNext?.()}
          style={[styles.next, onNext ? null : styles.disabled]}
        >
          <Icon name="SkipForward" size={12} color={props.theme.colors.foreground} />
          <Text style={styles.nextText}>Next</Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        <Chip label="Needs me" on={needsMe} onPress={() => onStatuses(needsMe ? [] : [...NEEDS_ME])} shared={shared} />
        {INDICATORS.map((indicator) => {
          const on = !needsMe && statuses.includes(indicator);
          return (
            <Chip
              key={indicator}
              label={STATUS_TITLES[indicator]}
              on={on}
              onPress={() => onStatuses(on ? statuses.filter((item) => item !== indicator) : [...(needsMe ? [] : statuses), indicator])}
              shared={shared}
            />
          );
        })}
      </View>
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
  return function useWorkspaceRows(filter: Filter, props: PluginSidebarViewProps): RowSource {
    const shown = (workspace: PluginWorkspaceSnapshot) => isVisible(workspace) && matchesFilter(workspace, filter);
    const sections = useSections(shown);
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
    const styles = useMemo(() => viewStyles(props.theme, config, props.layout.compact), [props.theme, props.layout.compact]);
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
    const shared: Shared = { props, styles, config, now, workspaceReminders, statuses: filter.statuses, chatReminders, picker: deps, done, later };
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
                  <Text style={styles.moreText}>Show {hidden} more</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    );
  };
}
