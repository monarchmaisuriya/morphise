import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginWorkspacePanelProps, useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { Fragment, type ReactNode, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { ViewLayout } from "../../shared/agents-board";
import { type BoardColumn, boardColumns, dropMove, todayGroups } from "../../shared/board";
import { parseQuickAdd } from "../../shared/quick-add";
import { isDue, type Reminder, reminderAt } from "../../shared/reminders";
import { firstOpenColumn, type TaskOperation, workspaceTask } from "../../shared/task-ops";
import { DEFAULT_FILTER, type Task, type TaskDocument, type TaskFilter, type TaskView } from "../../shared/tasks";
import { formatDue } from "../../shared/time-text";
import { todayDate } from "../../shared/when";
import { useDeviceChoice, workbenchSettings } from "../device-choices";
import { useValue } from "../profile-store";
import { useTooltip } from "../web";
import { useReminderClock } from "../reminder-clock";
import { tasksOf } from "../task-store";
import { Button, Field, Icon, IconButton, MenuItem, Segmented, Tag, type Tokens, useTokens } from "../ui/kit";
import { CardEditor, type EditorTarget, newTaskId } from "./card-editor";
import { CustomiseBoard } from "./customise";
import { CARD_GAP, DragGhost, DragProvider, useBoardDrag, useCardDragHandlers, useDrag } from "./drag";
import type { BoardDeps } from "./deps";
import { useWorkspaceName } from "./workspace-picker";
import { PRIORITY, priorityColor } from "./styles";

type Layout = Pick<TaskView, "filter" | "sort" | "swimlanes" | "density">;
type Tab = "board" | "today" | "archived";
type Panel = "views" | "filter" | "display" | "attach" | null;
type Run = (...operations: TaskOperation[]) => Promise<boolean>;

const ALL_TASKS: Layout = { filter: DEFAULT_FILTER, sort: "manual", swimlanes: "none", density: "detailed" };
const DUE_FILTERS = { overdue: "Overdue", today: "Due today", week: "This week", none: "No date" } as const;

function layoutOf(document: TaskDocument): Layout {
  const view = document.views.find((item) => item.id === document.activeView);
  return view ? { filter: view.filter, sort: view.sort, swimlanes: view.swimlanes, density: view.density } : ALL_TASKS;
}

function useBoardState(deps: BoardDeps) {
  const state = useValue(deps.tasks);
  const document = tasksOf(state);
  const reminders = document.tasks.flatMap((task) => (task.reminder && task.archivedAt === null ? [task.reminder] : []));
  // Ticks every minute too: due dates turn overdue at midnight without any reminder.
  const now = useReminderClock(reminders, true);
  const toast = useToast();
  const run: Run = (...operations) =>
    deps.apply(...operations).then(
      () => true,
      (error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
        return false;
      },
    );
  // Without the stream the board would show an empty default list, which looks like lost data.
  const problem = state.connectionError ? `Tasks are not up to date: ${state.connectionError}` : state.event === null ? "Loading tasks…" : state.event.status === "invalid" ? `The saved task list is invalid: ${state.event.error}` : null;
  return { document, now, run, problem };
}

// "Due today", "Due Fri 13 Nov", "Overdue · 12 Nov".
function dueText(due: string, today: string): string {
  if (due === today) return "Today";
  const date = new Date(`${due}T12:00:00`);
  const label = date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return due < today ? `Overdue · ${label}` : label;
}

// ---------- Cards ----------

function MetaItem({ t, icon, text, tone }: { t: Tokens; icon: string; text?: string; tone?: string }) {
  return (
    // Never wider than the card: a long name is cut to one line with "…".
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      <Icon name={icon} size={12} color={tone ?? t.c.foregroundMuted} />
      {text ? (
        <Text style={{ flexShrink: 1, color: tone ?? t.c.foregroundMuted, fontSize: 11 }} numberOfLines={1}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

function WorkspaceMeta({ t, workspaces, workspaceId }: { t: Tokens; workspaces: BoardDeps["workspaces"]; workspaceId: string }) {
  const name = useWorkspaceName(workspaces, workspaceId);
  return <MetaItem t={t} icon="FolderGit2" text={name ?? "Closed workspace"} />;
}

function CardView({ t, task, document, now, compact, workspaces, onOpen, run, lifted = false, onLongPress }: { t: Tokens; task: Task; document: TaskDocument; now: Date; compact: boolean; workspaces: BoardDeps["workspaces"] | null; onOpen(): void; run: Run; lifted?: boolean; onLongPress?(): void }) {
  const [hovered, setHovered] = useState(false);
  const index = document.columns.findIndex((column) => column.id === task.column);
  const previous = document.columns[index - 1];
  const next = document.columns[index + 1];
  // Screen readers move a card a column at a time; everyone else drags it.
  const moves = [previous && { name: "previous", label: `Move to ${previous.name}`, column: previous.id }, next && { name: "next", label: `Move to ${next.name}`, column: next.id }].filter((item) => !!item);
  const today = todayDate(now);
  const checked = task.checklist.filter((item) => item.done).length;
  const inDone = document.columns[index]?.done === true;
  const priority = task.priority ? PRIORITY[task.priority as 1 | 2 | 3 | 4] : null;
  const dueTone = task.due && !inDone ? (task.due < today ? t.c.statusDanger : task.due === today ? t.c.statusWarning : undefined) : undefined;
  const reminderTone = task.reminder && !inDone && isDue(task.reminder, now) ? t.c.statusDanger : undefined;
  const labels = task.labels.flatMap((id) => document.labels.filter((label) => label.id === id));
  const hasMeta = !!((workspaces && task.links.workspaceId) || task.due || task.reminder || task.checklist.length || task.links.agentId || task.links.url || task.description);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      accessibilityHint="Drag to move it"
      accessibilityActions={moves.map(({ name, label }) => ({ name, label }))}
      onAccessibilityAction={(event) => {
        const move = moves.find((item) => item.name === event.nativeEvent.actionName);
        if (move) void run({ kind: "moveTask", id: task.id, column: move.column });
      }}
      onPress={onOpen}
      onLongPress={onLongPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{ padding: compact ? 10 : 12, gap: 8, borderRadius: t.radius.card, backgroundColor: t.c.surface0, borderWidth: 1, borderColor: lifted ? t.c.accent : hovered ? t.c.foregroundMuted : t.c.border, opacity: inDone && !lifted ? 0.75 : 1 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        {priority ? (
          <View style={{ paddingTop: 2 }} accessibilityLabel={`Priority ${priority.name}`}>
            <Icon name={priority.icon} size={13} color={priorityColor(t.c, task.priority)} />
          </View>
        ) : null}
        <Text style={[t.text.body, { flex: 1, fontWeight: "500", textDecorationLine: inDone ? "line-through" : "none" }]} numberOfLines={compact ? 2 : 4}>
          {task.title}
        </Text>
      </View>
      {labels.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {labels.map((label) => (
            <Tag key={label.id} t={t} label={label.name} color={label.color} />
          ))}
        </View>
      ) : null}
      {hasMeta ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, minHeight: 20 }}>
          {workspaces && task.links.workspaceId ? <WorkspaceMeta t={t} workspaces={workspaces} workspaceId={task.links.workspaceId} /> : null}
          {task.due ? <MetaItem t={t} icon="Calendar" text={dueText(task.due, today)} tone={dueTone} /> : null}
          {task.reminder ? <MetaItem t={t} icon="AlarmClock" text={inDone ? "Paused" : formatDue(task.reminder, now)} tone={reminderTone} /> : null}
          {task.checklist.length ? <MetaItem t={t} icon="SquareCheck" text={`${checked}/${task.checklist.length}`} tone={checked === task.checklist.length ? t.c.statusSuccess : undefined} /> : null}
          {task.links.agentId ? <MetaItem t={t} icon="MessageSquare" /> : null}
          {task.links.url ? <MetaItem t={t} icon="Link" /> : null}
          {task.description ? <MetaItem t={t} icon="AlignLeft" /> : null}
        </View>
      ) : null}
      {task.reminder?.note && !compact ? (
        <Text style={t.text.small} numberOfLines={2}>
          {task.reminder.note}
        </Text>
      ) : null}
    </Pressable>
  );
}

// A card on the board: it can be dragged (the mouse moves it on the web; a long press picks it up on a phone). While it
// is, its slot closes in manual order (a gap shows where it lands instead) and dims otherwise. It stays mounted, with no
// height, because it holds the gesture.
function BoardCard({ closes, ...props }: Parameters<typeof CardView>[0] & { closes: boolean }) {
  const drag = useDrag();
  const handlers = useCardDragHandlers(props.task.id);
  const lifted = drag.state?.taskId === props.task.id;
  const closed = lifted && closes && drag.state?.origin != null;
  return (
    <View ref={drag.card(props.task.id)} {...handlers} style={closed ? { height: 0, marginTop: -CARD_GAP, overflow: "hidden", opacity: 0 } : { opacity: lifted ? 0.35 : 1 }}>
      <CardView {...props} onLongPress={Platform.OS === "web" ? undefined : () => drag.arm(props.task.id)} />
    </View>
  );
}

// Where a dragged card will land: a gap the card's size.
function DropSlot({ t, height }: { t: Tokens; height: number }) {
  return <View style={{ height, borderRadius: t.radius.card, borderWidth: 1, borderStyle: "dashed", borderColor: t.c.accent, backgroundColor: t.c.surface0 }} />;
}

// ---------- Toolbar ----------

// The add field, with the board's buttons (`trailing`) in the same row. Enter (Return on a phone) adds the card.
function QuickAdd({ t, document, run, workspaceId, trailing }: { t: Tokens; document: TaskDocument; run: Run; workspaceId: string | null; trailing: ReactNode }) {
  const [text, setText] = useState("");
  // Read on every keystroke: relative times ("45m") count from when they were typed, not from the
  // board clock.
  const now = new Date();
  const parsed = text.trim() ? parseQuickAdd(text, document, now) : null;
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
  const column = parsed?.column ? document.columns.find((item) => item.id === parsed.column) : null;
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
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <Field t={t} grow plain icon="Plus" value={text} onChangeText={setText} onSubmit={() => void add()} accessibilityLabel="Quick add a task" placeholder="Add a task… try: Fix login p1 @bug #review due:fri tomorrow 9am" />
        {trailing}
      </View>
      {parsed ? (
        problems.length ? (
          <Text style={t.text.danger}>{problems.join(". ")}</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
            <Text style={t.text.small}>
              {t.compact ? "Return" : "Enter"} adds “{parsed.title}”
            </Text>
            {parsed.priority ? <Tag t={t} label={PRIORITY[parsed.priority as 1 | 2 | 3 | 4].name} color={priorityColor(t.c, parsed.priority)} /> : null}
            {parsed.labelNames.map((name) => (
              <Tag key={name} t={t} label={name} color={document.labels.find((label) => label.name.toLowerCase() === name.toLowerCase())?.color ?? t.c.foregroundMuted} />
            ))}
            <Tag t={t} label={column?.name ?? firstOpenColumn(document).name} color={column?.color} />
            {parsed.due ? <Tag t={t} label={`Due ${dueText(parsed.due, todayDate(now))}`} /> : null}
            {reminder ? <Tag t={t} label={`Reminder ${formatDue(reminder, now)}`} color={t.c.statusWarning} /> : null}
          </View>
        )
      ) : null}
    </View>
  );
}

function PanelBox({ t, children }: { t: Tokens; children: ReactNode }) {
  return <View style={{ gap: 12, padding: 12, borderRadius: t.radius.panel, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>{children}</View>;
}

function PanelRow({ t, label, children }: { t: Tokens; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: t.compact ? "column" : "row", alignItems: t.compact ? "flex-start" : "center", gap: 8 }}>
      <Text style={[t.text.label, { width: t.compact ? undefined : 72 }]}>{label}</Text>
      <View style={{ flex: t.compact ? undefined : 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{children}</View>
    </View>
  );
}

const toggle = <Value,>(list: readonly Value[], value: Value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

function activeFilterCount(filter: TaskFilter): number {
  return (filter.text ? 1 : 0) + filter.priorities.length + filter.labels.length + (filter.due !== "any" ? 1 : 0) + (filter.hasReminder !== null ? 1 : 0);
}

function FilterPanel({ t, layout, setLayout, document }: { t: Tokens; layout: Layout; setLayout(layout: Layout): void; document: TaskDocument }) {
  const filter = layout.filter;
  const setFilter = (patch: Partial<TaskFilter>) => setLayout({ ...layout, filter: { ...filter, ...patch } });
  return (
    <PanelBox t={t}>
      <Field t={t} plain icon="Search" value={filter.text} onChangeText={(text) => setFilter({ text })} placeholder="Search titles and descriptions" accessibilityLabel="Search tasks" />
      <PanelRow t={t} label="Priority">
        {([1, 2, 3, 4] as const).map((priority) => (
          <Tag key={priority} t={t} label={PRIORITY[priority].name} color={priorityColor(t.c, priority)} on={filter.priorities.includes(priority)} onPress={() => setFilter({ priorities: toggle(filter.priorities, priority) })} />
        ))}
      </PanelRow>
      {document.labels.length ? (
        <PanelRow t={t} label="Labels">
          {document.labels.map((label) => (
            <Tag key={label.id} t={t} label={label.name} color={label.color} on={filter.labels.includes(label.id)} onPress={() => setFilter({ labels: toggle(filter.labels, label.id) })} />
          ))}
        </PanelRow>
      ) : null}
      <PanelRow t={t} label="Due">
        {(Object.keys(DUE_FILTERS) as (keyof typeof DUE_FILTERS)[]).map((due) => (
          <Tag key={due} t={t} label={DUE_FILTERS[due]} on={filter.due === due} onPress={() => setFilter({ due: filter.due === due ? "any" : due })} />
        ))}
        <Tag t={t} label="Has reminder" color={t.c.statusWarning} on={filter.hasReminder === true} onPress={() => setFilter({ hasReminder: filter.hasReminder === true ? null : true })} />
      </PanelRow>
      {activeFilterCount(filter) ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button t={t} variant="ghost" icon="X" label="Clear filters" onPress={() => setFilter({ ...DEFAULT_FILTER, workspaceId: filter.workspaceId })} />
        </View>
      ) : null}
    </PanelBox>
  );
}

function DisplayPanel({ t, layout, setLayout }: { t: Tokens; layout: Layout; setLayout(layout: Layout): void }) {
  return (
    <PanelBox t={t}>
      <PanelRow t={t} label="Order">
        <Segmented
          t={t}
          label="Order cards by"
          value={layout.sort}
          onChange={(sort) => setLayout({ ...layout, sort })}
          options={[
            { value: "manual", label: "Manual" },
            { value: "priority", label: "Priority" },
            { value: "due", label: "Due date" },
            { value: "updated", label: "Updated" },
          ]}
        />
      </PanelRow>
      <PanelRow t={t} label="Rows">
        <Segmented
          t={t}
          label="Split columns into rows by"
          value={layout.swimlanes}
          onChange={(swimlanes) => setLayout({ ...layout, swimlanes })}
          options={[
            { value: "none", label: "None" },
            { value: "priority", label: "Priority" },
            { value: "label", label: "Label" },
            { value: "workspace", label: "Workspace" },
          ]}
        />
      </PanelRow>
      <PanelRow t={t} label="Cards">
        <Segmented
          t={t}
          label="Card size"
          value={layout.density}
          onChange={(density) => setLayout({ ...layout, density })}
          options={[
            { value: "detailed", label: "Detailed", icon: "Rows3" },
            { value: "compact", label: "Compact", icon: "Rows4" },
          ]}
        />
      </PanelRow>
    </PanelBox>
  );
}

function ViewsPanel({ t, document, layout, changed, clearEdits, run, close }: { t: Tokens; document: TaskDocument; layout: Layout; changed: boolean; clearEdits(): void; run: Run; close(): void }) {
  const [name, setName] = useState("");
  const active = document.views.find((view) => view.id === document.activeView) ?? null;
  const choose = (id: string | null) => {
    clearEdits();
    void run({ kind: "setActiveView", id }).then((ok) => ok && close());
  };
  const save = () => {
    const id = `view-${Date.now().toString(36)}`;
    void run({ kind: "saveView", view: { id, name: name.trim(), ...layout } }, { kind: "setActiveView", id }).then((ok) => {
      if (!ok) return;
      setName("");
      clearEdits();
    });
  };
  return (
    <PanelBox t={t}>
      <View>
        <MenuItem t={t} role="radio" icon="LayoutGrid" label="All tasks" checked={!active} onPress={() => choose(null)} />
        {document.views.map((view) => (
          <MenuItem key={view.id} t={t} role="radio" icon="ListFilter" label={view.name} checked={active?.id === view.id} onPress={() => choose(view.id)} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <Field t={t} grow value={name} onChangeText={setName} onSubmit={() => name.trim() && save()} placeholder="Save the current filters as…" accessibilityLabel="Name for a new view" />
        <Button t={t} label="Save view" disabled={!name.trim()} onPress={save} />
      </View>
      {active ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button t={t} icon="Save" label={`Update “${active.name}”`} accessibilityLabel={`Update view ${active.name}`} disabled={!changed} onPress={() => void run({ kind: "saveView", view: { ...active, ...layout } }).then((ok) => ok && clearEdits())} />
          <Button t={t} variant="danger" icon="Trash2" label="Delete view" accessibilityLabel={`Delete view ${active.name}`} onPress={() => void run({ kind: "deleteView", id: active.id }).then((ok) => ok && clearEdits())} />
        </View>
      ) : null}
    </PanelBox>
  );
}

function AttachRow({ t, task, workspaces, onAttach }: { t: Tokens; task: Task; workspaces: BoardDeps["workspaces"]; onAttach(): void }) {
  const from = useWorkspaceName(workspaces, task.links.workspaceId);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: t.row, paddingHorizontal: 8, borderRadius: t.radius.control }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={t.text.body} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={t.text.small} numberOfLines={1}>
          {task.links.workspaceId ? `In ${from ?? "a closed workspace"}; attaching moves it here` : "No workspace"}
        </Text>
      </View>
      <Button t={t} icon="Plus" label="Attach" accessibilityLabel={`Attach ${task.title} to this workspace`} onPress={onAttach} />
    </View>
  );
}

// From a workspace's board: open tasks that belong elsewhere or nowhere, to attach here.
function AttachPanel({ t, document, workspaceId, workspaces, run }: { t: Tokens; document: TaskDocument; workspaceId: string; workspaces: BoardDeps["workspaces"]; run: Run }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const done = document.columns.find((column) => column.done)?.id;
  // A workspace belongs to one task: once it has one, the panel says which instead of offering more.
  const holder = workspaceTask(document, workspaceId);
  const candidates = holder ? [] : document.tasks
    .filter((task) => task.archivedAt === null && task.column !== done && task.links.workspaceId !== workspaceId)
    .filter((task) => !query || task.title.toLowerCase().includes(query))
    // Unattached tasks first, then the most recently changed.
    .sort((left, right) => Number(Boolean(left.links.workspaceId)) - Number(Boolean(right.links.workspaceId)) || right.updatedAt.localeCompare(left.updatedAt));
  return (
    <PanelBox t={t}>
      <Field t={t} plain icon="Search" value={search} onChangeText={setSearch} placeholder="Find a task to attach to this workspace" accessibilityLabel="Find a task to attach" />
      <View>
        {candidates.slice(0, 40).map((task) => (
          <AttachRow key={task.id} t={t} task={task} workspaces={workspaces} onAttach={() => void run({ kind: "setLink", id: task.id, link: "workspaceId", value: workspaceId })} />
        ))}
        {candidates.length === 0 ? <Text style={[t.text.small, { padding: 8 }]}>{holder ? `This workspace already has a task: "${holder.title}". A workspace can belong to one task.` : query ? "No open task matches" : "No open task to attach"}</Text> : null}
        {candidates.length > 40 ? <Text style={[t.text.small, { padding: 8 }]}>Type to find more</Text> : null}
      </View>
    </PanelBox>
  );
}

// A toolbar button that opens a panel, with a count badge for active settings.
// The board's toolbar buttons, all one look. `iconOnly` shows the label as a tooltip instead.
function PanelButton({ t, icon, label, open = false, count, iconOnly = false, onPress }: { t: Tokens; icon: string; label: string; open?: boolean; count?: number; iconOnly?: boolean; onPress(): void }) {
  const [hovered, setHovered] = useState(false);
  const tooltip = useTooltip(iconOnly ? label : undefined, t.c);
  return (
    <Pressable
      ref={tooltip}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} active` : label}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{ height: t.control, minWidth: t.control, paddingHorizontal: iconOnly ? 0 : 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: t.radius.control, borderWidth: 1, borderColor: open ? t.c.accent : t.c.border, backgroundColor: open || hovered ? t.c.surface2 : t.c.surface1 }}
    >
      <Icon name={icon} size={14} color={count ? t.c.accent : hovered || open ? t.c.foreground : t.c.foregroundMuted} />
      {iconOnly ? null : (
        <Text style={{ color: t.c.foreground, fontSize: 13, maxWidth: 160 }} numberOfLines={1}>
          {label}
        </Text>
      )}
      {count ? (
        <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: t.c.accent }}>
          <Text style={{ color: t.c.accentForeground, fontSize: 11, fontWeight: "600" }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// The active filters as removable tags, so they stay visible with the panel closed.
function ActiveFilters({ t, layout, setLayout, document }: { t: Tokens; layout: Layout; setLayout(layout: Layout): void; document: TaskDocument }) {
  const filter = layout.filter;
  const setFilter = (patch: Partial<TaskFilter>) => setLayout({ ...layout, filter: { ...filter, ...patch } });
  const tags = [
    ...(filter.text ? [{ key: "text", label: `“${filter.text}”`, remove: () => setFilter({ text: "" }) }] : []),
    ...filter.priorities.map((priority) => ({ key: `p${priority}`, label: PRIORITY[priority as 1 | 2 | 3 | 4].name, color: priorityColor(t.c, priority), remove: () => setFilter({ priorities: toggle(filter.priorities, priority) }) })),
    ...filter.labels.flatMap((id) => document.labels.filter((label) => label.id === id).map((label) => ({ key: id, label: label.name, color: label.color, remove: () => setFilter({ labels: toggle(filter.labels, id) }) }))),
    ...(filter.due !== "any" ? [{ key: "due", label: DUE_FILTERS[filter.due], remove: () => setFilter({ due: "any" }) }] : []),
    ...(filter.hasReminder !== null ? [{ key: "reminder", label: "Has reminder", color: t.c.statusWarning, remove: () => setFilter({ hasReminder: null }) }] : []),
  ];
  if (tags.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <Text style={t.text.small}>Showing only</Text>
      {tags.map((tag) => (
        <Tag key={tag.key} t={t} label={tag.label} color={"color" in tag ? tag.color : undefined} onRemove={tag.remove} />
      ))}
    </View>
  );
}

// ---------- Board, Today, Archived ----------

// A swimlane heading: priority names instead of P1..P4, workspace names instead of ids.
function LaneTitle({ t, laneKey, title, workspaces }: { t: Tokens; laneKey: string; title: string; workspaces: BoardDeps["workspaces"] }) {
  const workspaceId = laneKey.startsWith("w:") ? laneKey.slice(2) : "";
  const workspace = useWorkspaceName(workspaces, workspaceId);
  const priority = /^p([1-4])$/.exec(laneKey)?.[1];
  const text = priority ? PRIORITY[Number(priority) as 1 | 2 | 3 | 4].name : laneKey.startsWith("w:") ? (workspaceId ? workspace ?? "Workspace" : "No workspace") : title;
  return <Text style={[t.text.small, { paddingHorizontal: 6, paddingTop: 4 }]}>{text}</Text>;
}

function ColumnView({ t, entry, document, now, layout, open, run, workspaceId, workspaceStore }: { t: Tokens; entry: BoardColumn; document: TaskDocument; now: Date; layout: Layout; open(target: EditorTarget): void; run: Run; workspaceId: string | null; workspaceStore: BoardDeps["workspaces"] }) {
  const { column } = entry;
  const drag = useDrag();
  const manual = layout.sort === "manual";
  // While a card is dragged over this column it lights up; in manual order a gap opens where the card lands.
  const target = drag.state?.target?.column === column.id ? drag.state.target : null;
  const slot = target && manual && drag.state?.origin ? drag.state.origin.height : null;
  const lastId = entry.lanes.at(-1)?.tasks.at(-1)?.id;
  const empty = entry.lanes.every((lane) => lane.tasks.length === 0);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const add = () => setAdding(true);
  // Adds a card to this column from one line (quick-add syntax works) and stays open for the next.
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => {
    const parsed = text.trim() ? parseQuickAdd(text, document, new Date()) : null;
    if (!parsed) return;
    if (parsed.problems.length) return setProblem(parsed.problems.join(". "));
    let reminder: Reminder | null = null;
    try {
      reminder = parsed.reminderAt ? reminderAt(parsed.reminderAt, new Date()) : null;
    } catch (error) {
      return setProblem(error instanceof Error ? error.message : String(error));
    }
    setProblem(null);
    void run({ kind: "addTask", task: { id: newTaskId(), title: parsed.title, column: column.id, priority: parsed.priority, due: parsed.due, reminder, links: workspaceId ? { workspaceId } : {} }, labelNames: parsed.labelNames }).then((ok) => ok && setText(""));
  };
  return (
    <View ref={drag.column(column.id)} style={{ width: t.compact ? 284 : 300, maxHeight: "100%", borderRadius: t.radius.panel, backgroundColor: target ? t.c.surface2 : t.c.surface1, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 14, paddingRight: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: column.color ?? (column.done ? t.c.statusSuccess : t.c.foregroundMuted) }} />
        <Text style={[t.text.heading, { fontSize: 13, flexShrink: 1 }]} numberOfLines={1}>
          {column.name}
        </Text>
        <Text style={{ color: entry.overLimit ? t.c.statusDanger : t.c.foregroundMuted, fontSize: 12, fontWeight: entry.overLimit ? "600" : "400" }} accessibilityLabel={column.wipLimit ? `${entry.count} of ${column.wipLimit} allowed` : `${entry.inScope} cards`}>
          {/* A card limit counts every card in the column; otherwise the count is this board's cards. */}
          {column.wipLimit ? `${entry.count} / ${column.wipLimit}` : entry.inScope}
        </Text>
        {entry.shown < entry.inScope ? <Text style={t.text.small}>· {entry.inScope - entry.shown} hidden by filters</Text> : null}
        <View style={{ flex: 1 }} />
        <IconButton t={t} size="sm" icon="Plus" label={`Add a task to ${column.name}`} onPress={add} />
      </View>
      <ScrollView {...drag.scroller(column.id, false)} contentContainerStyle={{ paddingHorizontal: 8, gap: CARD_GAP }}>
        {adding ? (
          <View style={{ gap: 6 }}>
            <Field t={t} autoFocus value={text} onChangeText={(next) => { setText(next); setProblem(null); }} onSubmit={submit} error={problem} placeholder="Card title, then Enter" accessibilityLabel={`New card in ${column.name}`} />
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Button t={t} variant="primary" label="Add" disabled={!text.trim()} onPress={submit} />
              <Button t={t} variant="ghost" label="Close" onPress={() => { setAdding(false); setText(""); setProblem(null); }} />
              <View style={{ flex: 1 }} />
              <Button t={t} variant="ghost" icon="Maximize2" accessibilityLabel="Open the full editor" onPress={() => open({ kind: "new", column: column.id, workspaceId })} />
            </View>
          </View>
        ) : null}
        {entry.lanes.map((lane) => (
          <View key={lane.key} style={{ gap: CARD_GAP }}>
            {lane.title ? <LaneTitle t={t} laneKey={lane.key} title={lane.title} workspaces={workspaceStore} /> : null}
            {lane.tasks.map((task) => (
              <Fragment key={`${lane.key}:${task.id}`}>
                {slot !== null && target?.before === task.id ? <DropSlot t={t} height={slot} /> : null}
                <BoardCard t={t} task={task} document={document} now={now} compact={t.compact || layout.density === "compact"} workspaces={workspaceId === null && layout.swimlanes !== "workspace" ? workspaceStore : null} onOpen={() => open({ kind: "existing", taskId: task.id })} run={run} closes={manual} />
                {slot !== null && target?.before === null && task.id === lastId ? <DropSlot t={t} height={slot} /> : null}
              </Fragment>
            ))}
          </View>
        ))}
        {empty && slot !== null ? <DropSlot t={t} height={slot} /> : null}
        {empty && !adding && slot === null ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Add a task to ${column.name}`} onPress={add} style={{ height: 64, alignItems: "center", justifyContent: "center", borderRadius: t.radius.card, borderWidth: 1, borderStyle: "dashed", borderColor: target ? t.c.accent : t.c.border }}>
            <Text style={t.text.small}>{column.done ? "Finished cards land here" : "No cards · Add one"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ---------- Tasks as a list ----------

// One card as a list row: priority, title, labels, and its facts on one line; a press opens the editor, the check
// moves it to the done column. Dragging stays on the board.
function TaskRow({ t, task, document, now, workspaces, onOpen, run }: { t: Tokens; task: Task; document: TaskDocument; now: Date; workspaces: BoardDeps["workspaces"] | null; onOpen(): void; run: Run }) {
  const column = document.columns.find((item) => item.id === task.column);
  const done = document.columns.find((item) => item.done);
  const inDone = column?.done === true;
  const today = todayDate(now);
  const checked = task.checklist.filter((item) => item.done).length;
  const priority = task.priority ? PRIORITY[task.priority as 1 | 2 | 3 | 4] : null;
  const dueTone = task.due && !inDone ? (task.due < today ? t.c.statusDanger : task.due === today ? t.c.statusWarning : undefined) : undefined;
  const reminderTone = task.reminder && !inDone && isDue(task.reminder, now) ? t.c.statusDanger : undefined;
  const labels = task.labels.flatMap((id) => document.labels.filter((label) => label.id === id));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={onOpen}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: t.compact ? 52 : 44, paddingVertical: 6, paddingHorizontal: 10, borderRadius: t.radius.row, backgroundColor: pressed || hovered ? t.c.surface1 : "transparent", opacity: inDone ? 0.75 : 1 })}
    >
      <View style={{ width: 14, alignItems: "center" }} accessibilityLabel={priority ? `Priority ${priority.name}` : undefined}>
        {priority ? <Icon name={priority.icon} size={13} color={priorityColor(t.c, task.priority)} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[t.text.body, { fontWeight: "500", textDecorationLine: inDone ? "line-through" : "none" }]} numberOfLines={1}>
          {task.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
          {workspaces && task.links.workspaceId ? <WorkspaceMeta t={t} workspaces={workspaces} workspaceId={task.links.workspaceId} /> : null}
          {task.due ? <MetaItem t={t} icon="Calendar" text={dueText(task.due, today)} tone={dueTone} /> : null}
          {task.reminder ? <MetaItem t={t} icon="AlarmClock" text={inDone ? "Paused" : formatDue(task.reminder, now)} tone={reminderTone} /> : null}
          {task.checklist.length ? <MetaItem t={t} icon="SquareCheck" text={`${checked}/${task.checklist.length}`} tone={checked === task.checklist.length ? t.c.statusSuccess : undefined} /> : null}
          {task.links.agentId ? <MetaItem t={t} icon="MessageSquare" /> : null}
          {task.description ? <MetaItem t={t} icon="AlignLeft" /> : null}
        </View>
      </View>
      {t.compact ? null : labels.slice(0, 3).map((label) => <Tag key={label.id} t={t} label={label.name} color={label.color} />)}
      {done && !inDone ? <IconButton t={t} size="sm" icon="Check" label={`Move ${task.title} to ${done.name}`} onPress={() => void run({ kind: "moveTask", id: task.id, column: done.id })} /> : null}
    </Pressable>
  );
}

// The board's columns as sections of rows: the same filters, order, rows (swimlanes) and saved views. An empty
// column starts folded.
function TaskList({ t, columns, document, now, open, run, workspaceId, workspaceStore, swimlanes }: { t: Tokens; columns: BoardColumn[]; document: TaskDocument; now: Date; open(target: EditorTarget): void; run: Run; workspaceId: string | null; workspaceStore: BoardDeps["workspaces"]; swimlanes: Layout["swimlanes"] }) {
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: t.compact ? 12 : 16, paddingBottom: 16, gap: 10 }}>
      {columns.map((entry) => {
        const { column } = entry;
        const empty = entry.lanes.every((lane) => lane.tasks.length === 0);
        const folded = folds[column.id] ?? empty;
        return (
          <View key={column.id} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !folded }}
                accessibilityLabel={`${column.name}, ${entry.inScope}. ${folded ? "Open" : "Fold"} the section`}
                onPress={() => setFolds({ ...folds, [column.id]: !folded })}
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 6, borderRadius: t.radius.control, backgroundColor: hovered ? t.c.surface1 : "transparent" })}
              >
                <Icon name={folded ? "ChevronRight" : "ChevronDown"} size={13} color={t.c.foregroundMuted} />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: column.color ?? (column.done ? t.c.statusSuccess : t.c.foregroundMuted) }} />
                <Text style={folded ? [t.text.heading, { fontSize: 13, flexShrink: 1, color: t.c.foregroundMuted, fontWeight: "500" }] : [t.text.heading, { fontSize: 13, flexShrink: 1 }]} numberOfLines={1}>
                  {column.name}
                </Text>
                <Text style={{ color: entry.overLimit ? t.c.statusDanger : t.c.foregroundMuted, fontSize: 12, fontWeight: entry.overLimit ? "600" : "400" }}>{column.wipLimit ? `${entry.count} / ${column.wipLimit}` : entry.inScope}</Text>
                {entry.shown < entry.inScope ? <Text style={t.text.small}>· {entry.inScope - entry.shown} hidden by filters</Text> : null}
              </Pressable>
              <IconButton t={t} size="sm" icon="Plus" label={`Add a task to ${column.name}`} onPress={() => open({ kind: "new", column: column.id, workspaceId })} />
            </View>
            {folded
              ? null
              : entry.lanes.map((lane) => (
                  <View key={lane.key} style={{ gap: 2 }}>
                    {lane.title ? <View style={{ paddingLeft: 18 }}><LaneTitle t={t} laneKey={lane.key} title={lane.title} workspaces={workspaceStore} /></View> : null}
                    {lane.tasks.map((task) => (
                      <TaskRow key={`${lane.key}:${task.id}`} t={t} task={task} document={document} now={now} workspaces={workspaceId === null && swimlanes !== "workspace" ? workspaceStore : null} onOpen={() => open({ kind: "existing", taskId: task.id })} run={run} />
                    ))}
                  </View>
                ))}
            {!folded && empty ? <Text style={[t.text.meta, { paddingHorizontal: 34, paddingVertical: 6 }]}>{column.done ? "Finished cards land here" : "No cards"}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function ListRow({ t, title, subtitle, subtitleTone, onOpen, actions }: { t: Tokens; title: string; subtitle: string; subtitleTone?: string; onOpen(): void; actions: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, minHeight: t.row + 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: t.radius.row, backgroundColor: t.c.surface1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onOpen} style={{ flex: 1, minWidth: 180, gap: 2 }}>
        <Text style={[t.text.body, { fontWeight: "500" }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[t.text.small, subtitleTone ? { color: subtitleTone } : null]}>{subtitle}</Text> : null}
      </Pressable>
      <View style={{ flexDirection: "row", gap: 4 }}>{actions}</View>
    </View>
  );
}

function TodayRow({ t, task, document, now, open, run, openChat }: { t: Tokens; task: Task; document: TaskDocument; now: Date; open(): void; run: Run; openChat: ((agentId: string) => void) | null }) {
  const done = document.columns.find((column) => column.done);
  const today = todayDate(now);
  const subtitle = [task.reminder ? `Reminder ${formatDue(task.reminder, now)}` : null, task.due ? `Due ${dueText(task.due, today)}` : null, task.reminder?.note ?? null].filter(Boolean).join(" · ");
  const late = (task.reminder && isDue(task.reminder, now)) || (task.due !== null && task.due < today);
  return (
    <ListRow
      t={t}
      title={task.title}
      subtitle={subtitle}
      subtitleTone={late ? t.c.statusDanger : undefined}
      onOpen={open}
      actions={
        <>
          {task.links.agentId && openChat ? <IconButton t={t} icon="MessageSquare" label={`Open the chat for ${task.title}`} onPress={() => openChat(task.links.agentId!)} /> : null}
          {task.reminder ? <Button t={t} variant="ghost" label="+15m" accessibilityLabel={`Remind me about ${task.title} 15 minutes later`} onPress={() => void run({ kind: "remindAgain", id: task.id, minutes: 15 })} /> : null}
          {task.reminder ? <Button t={t} variant="ghost" label="+1h" accessibilityLabel={`Remind me about ${task.title} an hour later`} onPress={() => void run({ kind: "remindAgain", id: task.id, minutes: 60 })} /> : null}
          {done ? <Button t={t} icon="Check" label="Done" accessibilityLabel={`Move ${task.title} to ${done.name}`} onPress={() => void run({ kind: "moveTask", id: task.id, column: done.id })} /> : null}
        </>
      }
    />
  );
}

function EmptyState({ t, icon, title, body }: { t: Tokens; icon: string; title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 48, paddingHorizontal: 24 }}>
      <Icon name={icon} size={28} color={t.c.foregroundMuted} />
      <Text style={t.text.heading}>{title}</Text>
      <Text style={[t.text.meta, { textAlign: "center", maxWidth: 360 }]}>{body}</Text>
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
  // Inside the Workbench, whose own list of views picks Board, Today or Archived: no tabs here.
  embedded?: boolean;
}

export type BoardTab = Tab;

export function TasksBoard({ deps, theme, compact, workspaceId, initialTab, openChat, embedded = false }: BoardProps) {
  const { document, now, run, problem } = useBoardState(deps);
  const t = useTokens(theme, compact);
  const [tab, setTab] = useState<Tab>(initialTab);
  // List or columns, on this device.
  const [shape, setShape, shapeLoading] = useDeviceChoice(useSettings(workbenchSettings), "tasksLayout");
  // The board shows the active saved view (shared by every app) plus changes made here and not
  // saved yet; those are dropped when the active view changes, here or elsewhere.
  const [edits, setEdits] = useState<{ viewId: string | null; layout: Layout } | null>(null);
  const changed = edits !== null && edits.viewId === document.activeView;
  const layout = changed ? edits.layout : layoutOf(document);
  const setLayout = (next: Layout) => setEdits({ viewId: document.activeView, layout: next });
  const clearEdits = () => setEdits(null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [customising, setCustomising] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const togglePanel = (next: Panel) => setPanel(panel === next ? null : next);
  const effective: Layout = workspaceId ? { ...layout, filter: { ...layout.filter, workspaceId } } : layout;
  const columns = boardColumns(document, effective, now);
  const today = todayGroups(document, now)
    .map((group) => ({ ...group, tasks: workspaceId ? group.tasks.filter((task) => task.links.workspaceId === workspaceId) : group.tasks }))
    .filter((group) => group.tasks.length);
  const archived = document.tasks.filter((task) => task.archivedAt !== null && (!workspaceId || task.links.workspaceId === workspaceId));
  const todayCount = today.reduce((sum, group) => sum + group.tasks.length, 0);
  const activeView = document.views.find((view) => view.id === document.activeView) ?? null;
  const filters = activeFilterCount(layout.filter);
  const pad = compact ? 12 : 16;
  const shownIn = (column: string) => columns.find((entry) => entry.column.id === column)?.lanes.flatMap((lane) => lane.tasks.map((task) => task.id)) ?? [];
  const manual = effective.sort === "manual";
  const drag = useBoardDrag(
    columns,
    (taskId, target) => {
      const operation = dropMove(document, taskId, target, shownIn(target.column), manual);
      if (operation) void run(operation);
    },
    manual,
  );

  return (
    <DragProvider value={drag.value}>
    <View ref={drag.root} style={{ flex: 1, backgroundColor: t.c.surface0 }}>
      {problem ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: pad, paddingVertical: 8, backgroundColor: t.c.surface1 }}>
          <Icon name="TriangleAlert" size={14} color={t.c.statusWarning} />
          <Text style={t.text.meta}>{problem}</Text>
        </View>
      ) : null}
      <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: 12, gap: 12 }}>
        {embedded ? null : (
          <Segmented
            t={t}
            label="Tasks view"
            value={tab}
            onChange={(next) => {
              setTab(next);
              setPanel(null);
            }}
            options={[
              { value: "board", label: "Board", icon: "Columns3" },
              { value: "today", label: todayCount ? `Today · ${todayCount}` : "Today", icon: "CalendarClock", tone: todayCount ? t.c.statusWarning : undefined },
              { value: "archived", label: archived.length ? `Archived · ${archived.length}` : "Archived", icon: "Archive" },
            ]}
          />
        )}
        <QuickAdd
          t={t}
          document={document}
          run={run}
          workspaceId={workspaceId}
          trailing={
            <>
            {tab === "board" ? (
              <>
                <Segmented<ViewLayout> t={t} label="Show tasks as" value={shape} onChange={setShape} options={[{ value: "list", label: "List", icon: "List" }, { value: "board", label: "Board", icon: "Columns3" }]} />
                <PanelButton t={t} icon="Layers" label={activeView ? activeView.name : "All tasks"} open={panel === "views"} onPress={() => togglePanel("views")} />
                <PanelButton t={t} icon="ListFilter" label="Filter" count={filters} open={panel === "filter"} onPress={() => togglePanel("filter")} />
                <PanelButton t={t} icon="SlidersHorizontal" label="Display" open={panel === "display"} onPress={() => togglePanel("display")} />
                {workspaceId ? <PanelButton t={t} icon="FolderInput" label="Attach tasks" open={panel === "attach"} onPress={() => togglePanel("attach")} /> : null}
              </>
            ) : null}
            <PanelButton t={t} icon="Settings2" label="Customise board" iconOnly onPress={() => setCustomising(true)} />
            </>
          }
        />
        {tab === "board" && panel === "views" ? <ViewsPanel t={t} document={document} layout={layout} changed={changed} clearEdits={clearEdits} run={run} close={() => setPanel(null)} /> : null}
        {tab === "board" && panel === "filter" ? <FilterPanel t={t} layout={layout} setLayout={setLayout} document={document} /> : null}
        {tab === "board" && panel === "display" ? <DisplayPanel t={t} layout={layout} setLayout={setLayout} /> : null}
        {tab === "board" && panel === "attach" && workspaceId ? <AttachPanel t={t} document={document} workspaceId={workspaceId} workspaces={deps.workspaces} run={run} /> : null}
        {tab === "board" && panel !== "filter" ? <ActiveFilters t={t} layout={layout} setLayout={setLayout} document={document} /> : null}
      </View>
      {tab === "board" && shapeLoading ? (
        // Neither layout until the device's pick loads, so a list never flashes as columns first.
        <View style={{ flex: 1 }} />
      ) : tab === "board" && shape === "list" ? (
        <TaskList t={t} columns={columns} document={document} now={now} open={setEditing} run={run} workspaceId={workspaceId} workspaceStore={deps.workspaces} swimlanes={effective.swimlanes} />
      ) : tab === "board" ? (
        <ScrollView horizontal {...drag.value.scroller("board", true)} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: pad, gap: 12, alignItems: "flex-start" }}>
          {columns.map((entry) => (
            <ColumnView key={entry.column.id} t={t} entry={entry} document={document} now={now} layout={effective} open={setEditing} run={run} workspaceId={workspaceId} workspaceStore={deps.workspaces} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: pad, gap: 6, maxWidth: 900, width: "100%" }}>
          {tab === "today" ? (
            today.length ? (
              today.map((group) => (
                <View key={group.title} style={{ gap: 6, paddingBottom: 12 }}>
                  <Text style={[t.text.label, { paddingHorizontal: 4 }]}>
                    {group.title} · {group.tasks.length}
                  </Text>
                  {group.tasks.map((task) => (
                    <TodayRow key={task.id} t={t} task={task} document={document} now={now} open={() => setEditing({ kind: "existing", taskId: task.id })} run={run} openChat={openChat} />
                  ))}
                </View>
              ))
            ) : (
              <EmptyState t={t} icon="CalendarClock" title="Nothing due today" body={"Set a reminder with /remind 45m in a chat, the alarm button in a workspace's header, or on any card. Due and overdue cards show here too."} />
            )
          ) : archived.length ? (
            archived.map((task) => (
              <ListRow
                key={task.id}
                t={t}
                title={task.title}
                subtitle={task.archivedAt ? `Archived ${new Date(task.archivedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                onOpen={() => setEditing({ kind: "existing", taskId: task.id })}
                actions={<Button t={t} icon="ArchiveRestore" label="Restore" accessibilityLabel={`Restore ${task.title}`} onPress={() => void run({ kind: "restoreTask", id: task.id })} />}
              />
            ))
          ) : (
            <EmptyState t={t} icon="Archive" title="No archived cards" body="Archive a card from its editor, or have Done cards archive themselves under Customise." />
          )}
        </ScrollView>
      )}
      <DragGhost>
        {(taskId) => {
          const task = document.tasks.find((item) => item.id === taskId);
          return task ? <CardView t={t} task={task} document={document} now={now} compact={t.compact || layout.density === "compact"} workspaces={workspaceId === null && layout.swimlanes !== "workspace" ? deps.workspaces : null} onOpen={() => undefined} run={run} lifted /> : null;
        }}
      </DragGhost>
      {editing ? <CardEditor deps={deps} target={editing} theme={theme} compact={compact} onClose={() => setEditing(null)} /> : null}
      {customising ? <CustomiseBoard deps={deps} theme={theme} compact={compact} onClose={() => setCustomising(false)} /> : null}
    </View>
    </DragProvider>
  );
}

export function createWorkspaceTasksPanel(deps: BoardDeps) {
  return function WorkspaceTasksPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
    return <TasksBoard deps={deps} theme={theme} compact={layout.compact} workspaceId={workspaceId} initialTab="board" openChat={navigation ? (agentId) => navigation.openAgent({ agentId }) : null} />;
  };
}
