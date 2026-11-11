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
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { Icon, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
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
import { INDICATORS, type Indicator, type Profile } from "../shared/profile";
import { isDue, type Reminder } from "../shared/reminders";
import { formatDue, formatElapsed } from "../shared/time-text";
import { type ViewState, viewStateSettings } from "../shared/view-state";
import { type ValueStore, useValue } from "./profile-store";
import { useReminderClock } from "./reminder-clock";
import { clearReminder, type Reminders } from "./reminders";

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
  done(agentId: string): void;
}

function report(toast: ReturnType<typeof useToast>, what: string) {
  return (error: unknown) => toast.error(`Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);
}

function AgentRow({ reference, shared }: { reference: AgentRef; shared: Shared }) {
  const { props, styles } = shared;
  const agent = useAgent(reference, (item) => ({ title: item.title, provider: item.provider }));
  if (!agent) return null;
  const selected = props.active.agent?.key === reference.key;
  const label = agent.title ?? agent.provider;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open agent ${label}`}
      onPress={() => props.navigation.openAgent(reference)}
      style={[styles.agentRow, selected ? styles.selected : null]}
    >
      <Icon name="Bot" size={12} color={props.theme.colors.foregroundMuted} />
      <Text style={styles.secondary} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function WorkspaceAgents({ reference, shared }: { reference: WorkspaceRef; shared: Shared }) {
  const agents = useAgents({
    hosts: [reference.hostId],
    where: (agent) => agent.workspace.key === reference.key,
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

// A chat whose reminder is due, listed at the top of the view.
function ReminderRow({ reference, reminder, shared }: { reference: AgentRef; reminder: Reminder; shared: Shared }) {
  const { props, styles, now } = shared;
  const agent = useAgent(reference, (item) => ({ title: item.title, provider: item.provider }));
  if (!agent) return null;
  const label = agent.title ?? agent.provider;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open chat ${label}, reminder ${formatDue(reminder, now)}`}
        onPress={() => props.navigation.openAgent(reference)}
        style={styles.rowMain}
      >
        <Icon name="AlarmClock" size={12} color={props.theme.colors.statusWarning} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.due}>{formatDue(reminder, now)}</Text>
      </Pressable>
      <RowAction icon="Check" label={`Mark the reminder for ${label} done`} onPress={() => shared.done(reference.id)} shared={shared} />
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
  next: WorkspaceRef | null;
  shared: Shared;
}

function FilterBar({ search, onSearch, statuses, onStatuses, next, shared }: FilterBarProps) {
  const { styles, props } = shared;
  const needsMe = needsMeOn(statuses);
  return (
    <View style={styles.filterBar}>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search workspaces"
          placeholder="Search name, branch or project"
          placeholderTextColor={props.theme.colors.foregroundMuted}
          value={search}
          onChangeText={onSearch}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={next ? "Open the next workspace that needs you" : "Nothing needs you"}
          accessibilityState={{ disabled: next === null }}
          disabled={next === null}
          onPress={() => next && props.navigation.openWorkspace(next)}
          style={[styles.next, next ? null : styles.disabled]}
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

export interface ViewDeps {
  reminders: ValueStore<Reminders>;
  // Tells the daemon a reminder changed, so it re-arms its timer.
  arm(agentId: string): Promise<unknown>;
}

type Section = { key: string; title: string | null; items: readonly WorkspaceRef[] };

export function createSidebarView(config: ViewConfig, deps: ViewDeps) {
  const compare = compareWorkspaces(config);
  // Chosen once per profile, so each view instance always calls the same hooks.
  const useMainSections =
    config.groupBy === "none"
      ? (where: (workspace: PluginWorkspaceSnapshot) => boolean): Section[] => [{ key: "all", title: null, items: useWorkspaces({ where, orderBy: compare }) }]
      : (where: (workspace: PluginWorkspaceSnapshot) => boolean): Section[] =>
          orderGroups<Group<WorkspaceRef>>(useWorkspaces({ where, orderBy: compare, groupBy: (workspace) => groupKeys(config, workspace) }), config);

  return function MorphiseSidebarView(props: PluginSidebarViewProps) {
    const styles = useMemo(() => viewStyles(props.theme, config, props.layout.compact), [props.theme, props.layout.compact]);
    const reminders = useValue(deps.reminders);
    const now = useReminderClock(reminders, config.details.timeInStatus);
    const viewState = useSettings(viewStateSettings);
    const state = viewState.status === "ready" ? viewState.values : DEFAULT_VIEW_STATE;
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const paseo = usePaseo();
    const toast = useToast();

    const saveState = (next: Partial<ViewState>) => {
      if (viewState.status !== "ready") return;
      void viewState.save({ ...viewState.values, ...next }, viewState.revision).then((saved) => {
        if (!saved) toast.error("Could not remember this view change on this device");
      });
    };

    const filter: Filter = { statuses: config.filterBar ? state.statusFilter : [], search: config.filterBar ? search : "" };
    const shown = (workspace: PluginWorkspaceSnapshot) => isVisible(workspace) && matchesFilter(workspace, filter);
    const sections = useMainSections(shown);
    const protectedKeys = new Set(useWorkspaces({ where: (workspace) => shown(workspace) && isProtected(workspace) }).map((ref) => ref.key));
    const waiting = new Set(useWorkspaces({ where: (workspace) => isVisible(workspace) && needsAttention(workspace.indicator) }).map((ref) => ref.key));
    const next = nextAttention(attentionOrder(sections, waiting), props.active.workspace?.key ?? null);

    const dueIds = new Set([...reminders.values()].filter((entry) => isDue(entry.reminder, now)).map((entry) => entry.agentId));
    const dueChats = useAgents({ where: (agent) => dueIds.has(agent.id) });
    const workspaceReminders = new Map<string, Reminder>();
    for (const entry of reminders.values()) {
      const current = entry.workspaceId ? workspaceReminders.get(entry.workspaceId) : undefined;
      if (entry.workspaceId && (!current || entry.reminder.at < current.at)) workspaceReminders.set(entry.workspaceId, entry.reminder);
    }

    const done = (agentId: string) =>
      void clearReminder(paseo.agents.ref(agentId))
        .then(() => deps.arm(agentId))
        .catch(report(toast, "mark the reminder done"));
    const shared: Shared = { props, styles, config, now, workspaceReminders, done };
    const collapsed = new Set(state.collapsed);
    const toggleCollapsed = (key: string) =>
      saveState({ collapsed: collapsed.has(key) ? state.collapsed.filter((item) => item !== key) : [...state.collapsed, key] });
    const nothing = sections.every((section) => section.items.length === 0) && dueChats.length === 0;
    const remindersFolded = collapsed.has(REMINDERS_GROUP);

    return (
      <ScrollView style={styles.scroll}>
        {config.filterBar ? (
          <FilterBar
            search={search}
            onSearch={setSearch}
            statuses={state.statusFilter}
            onStatuses={(statusFilter) => saveState({ statusFilter })}
            next={next}
            shared={shared}
          />
        ) : null}
        {dueChats.length > 0 ? (
          <View>
            <GroupHeading title="Reminders" count={dueChats.length} collapsed={remindersFolded} onToggle={() => toggleCollapsed(REMINDERS_GROUP)} shared={shared} />
            {remindersFolded
              ? null
              : dueChats.map((reference) => {
                  const entry = reminders.get(reference.id);
                  return entry ? <ReminderRow key={reference.key} reference={reference} reminder={entry.reminder} shared={shared} /> : null;
                })}
          </View>
        ) : null}
        {nothing ? <Text style={styles.empty}>{filter.search || filter.statuses.length ? "No workspaces match" : "No workspaces yet"}</Text> : null}
        {sections.map((section) => {
          const folded = section.title !== null && collapsed.has(section.key);
          const { rows, hidden } = capRows(section.items, protectedKeys, config.rowLimit, expanded.has(section.key));
          return (
            <View key={section.key}>
              {section.title !== null ? (
                <GroupHeading title={section.title} count={section.items.length} collapsed={folded} onToggle={() => toggleCollapsed(section.key)} shared={shared} />
              ) : null}
              {folded ? null : rows.map((reference) => <WorkspaceRow key={reference.key} reference={reference} shared={shared} />)}
              {!folded && hidden > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${hidden} more workspaces`}
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
