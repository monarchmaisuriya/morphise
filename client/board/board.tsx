import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Icon, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type BoardColumn, boardColumns, todayGroups } from "../../shared/board";
import { parseQuickAdd } from "../../shared/quick-add";
import { isDue, type Reminder, reminderAt } from "../../shared/reminders";
import { firstOpenColumn, type TaskOperation } from "../../shared/task-ops";
import { DEFAULT_FILTER, type Task, type TaskDocument, type TaskFilter, type TaskView } from "../../shared/tasks";
import { formatDue } from "../../shared/time-text";
import { todayDate } from "../../shared/when";
import { useValue } from "../profile-store";
import { useReminderClock } from "../reminder-clock";
import { tasksOf } from "../task-store";
import { CardEditor, type EditorTarget, newTaskId } from "./card-editor";
import { CustomiseBoard } from "./customise";
import type { BoardDeps } from "./deps";
import { type BoardStyles, boardStyles, PRIORITY_COLOR } from "./styles";

type Layout = Pick<TaskView, "filter" | "sort" | "swimlanes" | "density">;
type Tab = "board" | "today" | "archived";

const ALL_TASKS: Layout = { filter: DEFAULT_FILTER, sort: "manual", swimlanes: "none", density: "detailed" };

function layoutOf(document: TaskDocument): Layout {
  const view = document.views.find((item) => item.id === document.activeView);
  return view ? { filter: view.filter, sort: view.sort, swimlanes: view.swimlanes, density: view.density } : ALL_TASKS;
}

// A label colour at one third strength; "#abc" is widened to "#aabbcc" first.
function translucent(color: string): string {
  const full = color.length === 4 ? `#${[...color.slice(1)].map((digit) => digit + digit).join("")}` : color;
  return `${full}55`;
}

function useBoardState(deps: BoardDeps) {
  const state = useValue(deps.tasks);
  const document = tasksOf(state);
  const chats = useValue(deps.chats);
  const reminders = document.tasks.flatMap((task) => (task.reminder && task.archivedAt === null ? [task.reminder] : []));
  // Ticks every minute too: due dates turn overdue at midnight without any reminder.
  const now = useReminderClock(reminders, true);
  const toast = useToast();
  const run = (...operations: TaskOperation[]) =>
    deps.apply(...operations).then(
      () => true,
      (error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
        return false;
      },
    );
  // Without the stream the board would show an empty default list, which looks like lost data.
  const problem = state.connectionError ? `Tasks are not up to date: ${state.connectionError}` : state.event === null ? "Loading tasks…" : state.event.status === "invalid" ? `The saved task list is invalid: ${state.event.error}` : null;
  return { document, chats, now, run, problem };
}

// ---------- Cards ----------

function CardView({ task, document, now, styles, theme, compact, onOpen, run }: { task: Task; document: TaskDocument; now: Date; styles: BoardStyles; theme: PluginTheme; compact: boolean; onOpen(): void; run(...operations: TaskOperation[]): Promise<boolean> }) {
  const index = document.columns.findIndex((column) => column.id === task.column);
  const previous = document.columns[index - 1];
  const next = document.columns[index + 1];
  const today = todayDate(now);
  const done = task.checklist.filter((item) => item.done).length;
  const inDone = document.columns[index]?.done === true;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${task.title}`} onPress={onOpen} style={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={compact ? 2 : 4}>
        {task.title}
      </Text>
      <View style={styles.meta}>
        {task.priority ? (
          <View style={[styles.badge, { borderColor: PRIORITY_COLOR(theme, task.priority) }]}>
            <Text style={{ color: PRIORITY_COLOR(theme, task.priority), fontSize: 10, fontWeight: "600" }}>P{task.priority}</Text>
          </View>
        ) : null}
        {task.labels.map((id) => {
          const label = document.labels.find((item) => item.id === id);
          return label ? (
            <View key={id} style={[styles.label, { backgroundColor: translucent(label.color) }]}>
              <Text style={styles.labelText}>{label.name}</Text>
            </View>
          ) : null;
        })}
        {task.due ? <Text style={task.due < today ? styles.overdue : task.due === today ? styles.dueSoon : styles.metaText}>{task.due === today ? "Due today" : `Due ${task.due}`}</Text> : null}
        {task.reminder ? (
          // Reminders on Done cards do not fire; they resume if the card leaves Done.
          <Text style={!inDone && isDue(task.reminder, now) ? styles.overdue : styles.metaText}>⏰ {inDone ? "paused" : formatDue(task.reminder, now)}</Text>
        ) : null}
        {task.checklist.length ? <Text style={styles.metaText}>☑ {done}/{task.checklist.length}</Text> : null}
        {task.links.agentId ? <Icon name="MessageSquare" size={11} color={theme.colors.foregroundMuted} /> : null}
        {task.links.url ? <Icon name="Link" size={11} color={theme.colors.foregroundMuted} /> : null}
      </View>
      {task.reminder?.note ? <Text style={styles.metaText} numberOfLines={2}>{task.reminder.note}</Text> : null}
      <View style={styles.arrows}>
        <Pressable accessibilityRole="button" accessibilityLabel={previous ? `Move to ${previous.name}` : "First column"} disabled={!previous} onPress={() => previous && void run({ kind: "moveTask", id: task.id, column: previous.id })} style={[styles.arrow, !previous ? styles.disabled : null]}>
          <Icon name="ChevronLeft" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={next ? `Move to ${next.name}` : "Last column"} disabled={!next} onPress={() => next && void run({ kind: "moveTask", id: task.id, column: next.id })} style={[styles.arrow, !next ? styles.disabled : null]}>
          <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ---------- Toolbar: quick add, views, filters ----------

function QuickAdd({ document, run, styles, theme, workspaceId }: { document: TaskDocument; run(...operations: TaskOperation[]): Promise<boolean>; styles: BoardStyles; theme: PluginTheme; workspaceId: string | null }) {
  const [text, setText] = useState("");
  // Read on every keystroke: relative times ("45m") count from when they were typed, not from the
  // board clock, which only ticks near a reminder.
  const now = new Date();
  const parsed = text.trim() ? parseQuickAdd(text, document, now) : null;
  const summary = parsed
    ? [
        parsed.priority ? `P${parsed.priority}` : null,
        ...parsed.labelNames.map((name) => `@${name}`),
        parsed.column ? `in ${document.columns.find((column) => column.id === parsed.column)?.name}` : null,
        parsed.due ? `due ${parsed.due}` : null,
        parsed.reminderAt ? `⏰ ${formatDue({ at: parsed.reminderAt.toISOString(), setAt: now.toISOString() }, now)}` : null,
      ].filter(Boolean)
    : [];
  // The reminder is validated while typing (1 minute to 7 days ahead), so a bad one shows before Add.
  let reminder: Reminder | null = null;
  const problems = parsed ? [...parsed.problems] : [];
  if (parsed?.reminderAt) {
    try {
      reminder = reminderAt(parsed.reminderAt, now);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  async function add() {
    if (!parsed || problems.length) return;
    const ok = await run({
      kind: "addTask",
      task: { id: newTaskId(), title: parsed.title, column: parsed.column ?? firstOpenColumn(document).id, priority: parsed.priority, due: parsed.due, reminder, links: workspaceId ? { workspaceId } : {} },
      labelNames: parsed.labelNames,
    });
    if (ok) setText("");
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Quick add a task"
          placeholder="Add a task: Fix login p1 @bug #review due:fri tomorrow 9am"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void add()}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Add task" disabled={!parsed || problems.length > 0} onPress={() => void add()} style={[styles.primary, !parsed || problems.length ? styles.disabled : null]}>
          <Text style={styles.primaryText}>Add</Text>
        </Pressable>
      </View>
      {parsed ? (
        <Text style={problems.length ? styles.error : styles.muted}>
          {problems.length ? problems.join(". ") : `"${parsed.title}"${summary.length ? ` · ${summary.join(" · ")}` : ""}`}
        </Text>
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress, styles }: { label: string; on: boolean; onPress(): void; styles: BoardStyles }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} style={[styles.chip, on ? styles.chipOn : null]}>
      <Text style={on ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function Filters({ layout, setLayout, document, styles, theme }: { layout: Layout; setLayout(layout: Layout): void; document: TaskDocument; styles: BoardStyles; theme: PluginTheme }) {
  const filter = layout.filter;
  const setFilter = (patch: Partial<TaskFilter>) => setLayout({ ...layout, filter: { ...filter, ...patch } });
  const toggle = <Value,>(list: readonly Value[], value: Value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const pick = <Key extends "sort" | "swimlanes" | "density">(key: Key, options: { value: Layout[Key]; label: string }[]) => (
    <View style={styles.row}>
      {options.map((option) => (
        <Chip key={String(option.value)} label={option.label} on={layout[key] === option.value} onPress={() => setLayout({ ...layout, [key]: option.value })} styles={styles} />
      ))}
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <TextInput accessibilityLabel="Search tasks" placeholder="Search tasks" placeholderTextColor={theme.colors.foregroundMuted} value={filter.text} onChangeText={(text) => setFilter({ text })} style={styles.input} />
      </View>
      <View style={styles.row}>
        {[1, 2, 3, 4].map((priority) => (
          <Chip key={priority} label={`P${priority}`} on={filter.priorities.includes(priority)} onPress={() => setFilter({ priorities: toggle(filter.priorities, priority) })} styles={styles} />
        ))}
        {document.labels.map((label) => (
          <Chip key={label.id} label={`@${label.name}`} on={filter.labels.includes(label.id)} onPress={() => setFilter({ labels: toggle(filter.labels, label.id) })} styles={styles} />
        ))}
        {(["overdue", "today", "week", "none"] as const).map((due) => (
          <Chip key={due} label={{ overdue: "Overdue", today: "Due today", week: "This week", none: "No date" }[due]} on={filter.due === due} onPress={() => setFilter({ due: filter.due === due ? "any" : due })} styles={styles} />
        ))}
        <Chip label="Has reminder" on={filter.hasReminder === true} onPress={() => setFilter({ hasReminder: filter.hasReminder === true ? null : true })} styles={styles} />
      </View>
      <View style={styles.row}>
        <Text style={styles.muted}>Sort</Text>
        {pick("sort", [
          { value: "manual", label: "Manual" },
          { value: "priority", label: "Priority" },
          { value: "due", label: "Due" },
          { value: "updated", label: "Updated" },
        ])}
        <Text style={styles.muted}>Rows</Text>
        {pick("swimlanes", [
          { value: "none", label: "None" },
          { value: "priority", label: "Priority" },
          { value: "label", label: "Label" },
          { value: "workspace", label: "Workspace" },
        ])}
        <Text style={styles.muted}>Cards</Text>
        {pick("density", [
          { value: "detailed", label: "Detailed" },
          { value: "compact", label: "Compact" },
        ])}
      </View>
    </View>
  );
}

function ViewBar({ document, layout, clearEdits, run, styles, theme }: { document: TaskDocument; layout: Layout; clearEdits(): void; run(...operations: TaskOperation[]): Promise<boolean>; styles: BoardStyles; theme: PluginTheme }) {
  const [name, setName] = useState("");
  const active = document.views.find((view) => view.id === document.activeView) ?? null;
  const choose = (id: string | null) => {
    clearEdits();
    void run({ kind: "setActiveView", id });
  };
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>Views</Text>
      <Chip label="All tasks" on={!active} onPress={() => choose(null)} styles={styles} />
      {document.views.map((view) => (
        <Chip key={view.id} label={view.name} on={active?.id === view.id} onPress={() => choose(view.id)} styles={styles} />
      ))}
      <TextInput accessibilityLabel="Name for a new view" placeholder="Save these filters as…" placeholderTextColor={theme.colors.foregroundMuted} value={name} onChangeText={setName} style={[styles.smallInput, { width: 170 }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save view"
        disabled={!name.trim()}
        onPress={() => {
          const id = `view-${Date.now().toString(36)}`;
          void run({ kind: "saveView", view: { id, name: name.trim(), ...layout } }, { kind: "setActiveView", id }).then((ok) => {
            if (!ok) return;
            setName("");
            clearEdits();
          });
        }}
        style={[styles.button, !name.trim() ? styles.disabled : null]}
      >
        <Text style={styles.buttonText}>Save view</Text>
      </Pressable>
      {active ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Update view ${active.name}`} onPress={() => void run({ kind: "saveView", view: { ...active, ...layout } }).then((ok) => ok && clearEdits())} style={styles.button}>
            <Text style={styles.buttonText}>Update "{active.name}"</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete view ${active.name}`} onPress={() => void run({ kind: "deleteView", id: active.id }).then((ok) => ok && clearEdits())} style={styles.button}>
            <Text style={styles.buttonText}>Delete view</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

// ---------- Board, Today, Archived ----------

function ColumnView({ entry, ...shared }: { entry: BoardColumn; document: TaskDocument; now: Date; styles: BoardStyles; theme: PluginTheme; compact: boolean; layout: Layout; open(target: EditorTarget): void; run(...operations: TaskOperation[]): Promise<boolean>; workspaceId: string | null }) {
  const { styles, theme } = shared;
  const { column } = entry;
  return (
    <View style={styles.column}>
      <View style={styles.columnHeader}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: column.color ?? theme.colors.border }} />
        <Text style={styles.columnName} numberOfLines={1}>
          {column.name}
        </Text>
        <Text style={entry.overLimit ? styles.countOver : styles.count}>{column.wipLimit ? `${entry.count}/${column.wipLimit}` : entry.count}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Add a task to ${column.name}`} onPress={() => shared.open({ kind: "new", column: column.id, workspaceId: shared.workspaceId })} style={{ padding: 4 }}>
          <Icon name="Plus" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <ScrollView>
        {entry.lanes.map((lane) => (
          <View key={lane.key}>
            {lane.title ? <Text style={styles.lane}>{lane.title}</Text> : null}
            <View style={styles.cards}>
              {lane.tasks.map((task) => (
                <CardView key={`${lane.key}:${task.id}`} task={task} document={shared.document} now={shared.now} styles={styles} theme={theme} compact={shared.compact || shared.layout.density === "compact"} onOpen={() => shared.open({ kind: "existing", taskId: task.id })} run={shared.run} />
              ))}
            </View>
          </View>
        ))}
        {entry.lanes.every((lane) => lane.tasks.length === 0) ? <Text style={styles.empty}>No cards</Text> : null}
      </ScrollView>
    </View>
  );
}

function TaskRow({ task, document, now, styles, theme, open, run, openChat }: { task: Task; document: TaskDocument; now: Date; styles: BoardStyles; theme: PluginTheme; open(): void; run(...operations: TaskOperation[]): Promise<boolean>; openChat: ((agentId: string) => void) | null }) {
  const done = document.columns.find((column) => column.done);
  const small = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${task.title}`} onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.listRow, { flexWrap: "wrap" }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${task.title}`} onPress={open} style={{ flex: 1, minWidth: 180, gap: 2 }}>
        <Text style={styles.listTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={task.reminder && isDue(task.reminder, now) ? styles.error : styles.muted}>
          {[task.reminder ? `⏰ ${formatDue(task.reminder, now)}` : null, task.due ? `due ${task.due}` : null, task.reminder?.note ?? null].filter(Boolean).join(" · ")}
        </Text>
      </Pressable>
      {done ? small("Done", () => void run({ kind: "moveTask", id: task.id, column: done.id })) : null}
      {task.reminder ? small("+15m", () => void run({ kind: "remindAgain", id: task.id, minutes: 15 })) : null}
      {task.reminder ? small("+1h", () => void run({ kind: "remindAgain", id: task.id, minutes: 60 })) : null}
      {task.links.agentId && openChat ? small("Open chat", () => openChat(task.links.agentId!)) : null}
    </View>
  );
}

interface BoardProps {
  deps: BoardDeps;
  theme: PluginTheme;
  compact: boolean;
  workspaceId: string | null;
  initialTab: Tab;
  openChat: ((agentId: string) => void) | null;
}

function TasksBoard({ deps, theme, compact, workspaceId, initialTab, openChat }: BoardProps) {
  const { document, now, run, problem } = useBoardState(deps);
  const styles = useMemo(() => boardStyles(theme, compact), [theme, compact]);
  const [tab, setTab] = useState<Tab>(initialTab);
  // The board shows the active saved view (shared by every app) plus changes made here and not
  // saved yet; those are dropped when the active view changes, here or elsewhere.
  const [edits, setEdits] = useState<{ viewId: string | null; layout: Layout } | null>(null);
  const layout = edits && edits.viewId === document.activeView ? edits.layout : layoutOf(document);
  const setLayout = (next: Layout) => setEdits({ viewId: document.activeView, layout: next });
  const clearEdits = () => setEdits(null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [customising, setCustomising] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const effective: Layout = workspaceId ? { ...layout, filter: { ...layout.filter, workspaceId } } : layout;
  const columns = boardColumns(document, effective, now);
  const today = todayGroups(document, now).map((group) => ({ ...group, tasks: workspaceId ? group.tasks.filter((task) => task.links.workspaceId === workspaceId) : group.tasks })).filter((group) => group.tasks.length);
  const archived = document.tasks.filter((task) => task.archivedAt !== null && (!workspaceId || task.links.workspaceId === workspaceId));
  const todayCount = today.reduce((sum, group) => sum + group.tasks.length, 0);
  const tabButton = (value: Tab, label: string) => (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === value }} accessibilityLabel={label} onPress={() => setTab(value)} style={[styles.tab, tab === value ? styles.tabOn : null]}>
      <Text style={tab === value ? styles.tabTextOn : styles.tabText}>{label}</Text>
    </Pressable>
  );
  const shared = { document, now, styles, theme, compact, layout: effective, open: setEditing, run, workspaceId };

  return (
    <View style={styles.screen}>
      {problem ? <Text style={[styles.error, { paddingHorizontal: 12, paddingTop: 8 }]}>{problem}</Text> : null}
      <View style={styles.toolbar}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <View style={styles.tabs}>
            {tabButton("board", "Board")}
            {tabButton("today", todayCount ? `Today (${todayCount})` : "Today")}
            {tabButton("archived", "Archived")}
          </View>
          <View style={styles.row}>
            {tab === "board" ? (
              <Pressable accessibilityRole="button" accessibilityLabel={showFilters ? "Hide filters" : "Show filters"} onPress={() => setShowFilters(!showFilters)} style={styles.button}>
                <Text style={styles.buttonText}>{showFilters ? "Hide filters" : "Filters"}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Customise board" onPress={() => setCustomising(true)} style={styles.button}>
              <Text style={styles.buttonText}>Customise</Text>
            </Pressable>
          </View>
        </View>
        <QuickAdd document={document} run={run} styles={styles} theme={theme} workspaceId={workspaceId} />
        {tab === "board" ? <ViewBar document={document} layout={layout} clearEdits={clearEdits} run={run} styles={styles} theme={theme} /> : null}
        {tab === "board" && showFilters ? <Filters layout={layout} setLayout={setLayout} document={document} styles={styles} theme={theme} /> : null}
      </View>
      {tab === "board" ? (
        <ScrollView horizontal contentContainerStyle={styles.board}>
          {columns.map((entry) => (
            <ColumnView key={entry.column.id} entry={entry} {...shared} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {tab === "today" ? (
            today.length ? (
              today.map((group) => (
                <View key={group.title} style={{ gap: 6 }}>
                  <Text style={styles.section}>{group.title}</Text>
                  {group.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} document={document} now={now} styles={styles} theme={theme} open={() => setEditing({ kind: "existing", taskId: task.id })} run={run} openChat={openChat} />
                  ))}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>Nothing is due today. Set reminders with "Remind me" in a chat, /remind 45m, or on a card.</Text>
            )
          ) : archived.length ? (
            archived.map((task) => (
              <View key={task.id} style={styles.listRow}>
                <Text style={styles.listTitle}>{task.title}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Restore ${task.title}`} onPress={() => void run({ kind: "restoreTask", id: task.id })} style={styles.button}>
                  <Text style={styles.buttonText}>Restore</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${task.title}`} onPress={() => setEditing({ kind: "existing", taskId: task.id })} style={styles.button}>
                  <Text style={styles.buttonText}>Open</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No archived tasks.</Text>
          )}
        </ScrollView>
      )}
      {editing ? <CardEditor deps={deps} target={editing} theme={theme} compact={compact} onClose={() => setEditing(null)} /> : null}
      {customising ? <CustomiseBoard deps={deps} theme={theme} compact={compact} onClose={() => setCustomising(false)} /> : null}
    </View>
  );
}

export function createTasksScreen(deps: BoardDeps) {
  return function TasksScreen({ theme, layout, params, navigation }: PluginScreenProps) {
    const tab: Tab = params.tab === "today" || params.tab === "archived" ? params.tab : "board";
    return (
      <TasksBoard
        key={tab}
        deps={deps}
        theme={theme}
        compact={layout.compact}
        workspaceId={null}
        initialTab={tab}
        openChat={navigation ? (agentId) => navigation.openAgent({ agentId }) : null}
      />
    );
  };
}

export function createWorkspaceTasksPanel(deps: BoardDeps) {
  return function WorkspaceTasksPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
    return (
      <TasksBoard
        deps={deps}
        theme={theme}
        compact={layout.compact}
        workspaceId={workspaceId}
        initialTab="board"
        openChat={navigation ? (agentId) => navigation.openAgent({ agentId }) : null}
      />
    );
  };
}
