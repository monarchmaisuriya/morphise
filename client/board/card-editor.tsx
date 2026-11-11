import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { slug, type TaskOperation } from "../../shared/task-ops";
import type { Task, TaskDocument } from "../../shared/tasks";
import { formatDue } from "../../shared/time-text";
import { parseDueDate, todayDate } from "../../shared/when";
import { useValue } from "../profile-store";
import { ReminderPicker } from "../reminder-picker";
import { tasksOf } from "../task-store";
import { Button, Field, IconButton, PropertyRow, Segmented, Select, Tag, type Tokens, useTokens } from "../ui/kit";
import type { BoardDeps } from "./deps";
import { PRIORITY, priorityColor } from "./styles";

export type EditorTarget = { kind: "existing"; taskId: string } | { kind: "new"; column: string; workspaceId: string | null };

interface Draft {
  title: string;
  description: string;
  column: string;
  priority: number | null;
  labels: string[];
  dueText: string;
  url: string;
}

function draftOf(task: Task | null, column: string): Draft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    column: task?.column ?? column,
    priority: task?.priority ?? null,
    labels: task?.labels ?? [],
    dueText: task?.due ?? "",
    url: task?.links.url ?? "",
  };
}

export function newTaskId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// The full editor for one card: every field, its reminder, checklist, links and actions.
export function CardEditor({ deps, target, theme, compact, onClose }: { deps: BoardDeps; target: EditorTarget; theme: PluginTheme; compact: boolean; onClose(): void }) {
  const document: TaskDocument = tasksOf(useValue(deps.tasks));
  const task = target.kind === "existing" ? document.tasks.find((item) => item.id === target.taskId) ?? null : null;
  // What the card held when the editor opened. Save sends only the fields changed since, so edits
  // made meanwhile elsewhere (a rule moving the card, another app) are kept.
  const [original] = useState<Draft>(() => draftOf(task, target.kind === "new" ? target.column : ""));
  const [draft, setDraft] = useState<Draft>(original);
  const [newItem, setNewItem] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const t = useTokens(theme, compact);
  const [reminderOpen, setReminderOpen] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const now = new Date();
  const due = draft.dueText.trim() === "" ? null : parseDueDate(draft.dueText, now);
  const dueProblem = draft.dueText.trim() !== "" && due === null ? "Expected a date such as fri, tomorrow or 2026-11-20" : null;
  const chats = useValue(deps.chats);
  const chat = task?.links.agentId ? chats.get(task.links.agentId) ?? null : null;
  const finished = task !== null && (task.archivedAt !== null || document.columns.find((column) => column.id === task.column)?.done === true);

  async function run(...operations: TaskOperation[]): Promise<boolean> {
    setError(null);
    try {
      await deps.apply(...operations);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  }

  // Labels deleted elsewhere while the editor is open are dropped rather than failing the save.
  const labels = draft.labels.filter((id) => document.labels.some((label) => label.id === id));

  async function save() {
    if (dueProblem) return setError(dueProblem);
    if (target.kind === "existing" && !task) return setError("This task was deleted in another app; nothing was saved");
    const url = draft.url.trim();
    if (!task) {
      const links = { ...(target.kind === "new" && target.workspaceId ? { workspaceId: target.workspaceId } : {}), ...(url ? { url } : {}) };
      if (await run({ kind: "addTask", task: { id: newTaskId(), column: draft.column, title: draft.title.trim(), description: draft.description, priority: draft.priority, labels, due, links } })) onClose();
      return;
    }
    const patch: Partial<Pick<Task, "title" | "description" | "priority" | "labels" | "due" | "links">> = {};
    if (draft.title !== original.title) patch.title = draft.title.trim();
    if (draft.description !== original.description) patch.description = draft.description;
    if (draft.priority !== original.priority) patch.priority = draft.priority;
    if (labels.join() !== original.labels.join()) patch.labels = labels;
    if (draft.dueText !== original.dueText) patch.due = due;
    if (draft.url !== original.url) {
      const { url: _old, ...rest } = task.links;
      patch.links = url ? { ...rest, url } : rest;
    }
    const operations: TaskOperation[] = [];
    if (Object.keys(patch).length) operations.push({ kind: "updateTask", id: task.id, patch });
    if (draft.column !== original.column) operations.push({ kind: "moveTask", id: task.id, column: draft.column });
    if (operations.length === 0 || (await run(...operations))) onClose();
  }

  function insertIntoChat() {
    if (!task?.links.agentId) return;
    const [composer] = deps.client.composers({ agentId: task.links.agentId });
    if (!composer) return toast.error("That chat's message box is not open");
    composer.insertText([task.title, task.description].filter(Boolean).join("\n\n"));
    void composer.focus();
    onClose();
  }

  const today = todayDate(now);
  const plusDays = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return todayDate(date);
  };
  const nextMonday = plusDays(((8 - now.getDay()) % 7) || 7);
  const addLabel = () => {
    const name = newLabel.trim();
    if (!name) return;
    const taken = document.labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
    if (taken) {
      setDraft((current) => (current.labels.includes(taken.id) ? current : { ...current, labels: [...current.labels, taken.id] }));
      return setNewLabel("");
    }
    const id = slug(name, "label");
    const unique = document.labels.some((label) => label.id === id) ? `${id}-${Date.now().toString(36)}` : id;
    void run({ kind: "saveLabel", label: { id: unique, name } }).then((ok) => {
      if (!ok) return;
      setNewLabel("");
      // From the draft as it is now: a label toggled while this saved is kept.
      setDraft((current) => ({ ...current, labels: [...current.labels, unique] }));
    });
  };
  const checked = task ? task.checklist.filter((item) => item.done).length : 0;

  return (
    <Modal title={task ? "Edit task" : "New task"} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
        <View style={{ gap: 4 }}>
          <Field t={t} bare value={draft.title} onChangeText={(title) => set({ title })} placeholder="Task title" accessibilityLabel="Title" autoFocus={!task} textStyle={{ fontSize: 20, fontWeight: "600" }} />
          <Field t={t} bare multiline value={draft.description} onChangeText={(description) => set({ description })} placeholder="Add a description…" accessibilityLabel="Description" />
        </View>

        <View style={{ gap: 2, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.c.border }}>
          <PropertyRow t={t} icon="Columns3" label="Status">
            <Select t={t} label="Status" value={draft.column} onChange={(column) => set({ column })} options={document.columns.map((column) => ({ value: column.id, label: column.name, dot: column.color ?? (column.done ? t.c.statusSuccess : t.c.foregroundMuted) }))} />
          </PropertyRow>
          <PropertyRow t={t} icon="Signal" label="Priority">
            <Segmented
              t={t}
              label="Priority"
              value={String(draft.priority ?? 0)}
              onChange={(value) => set({ priority: value === "0" ? null : Number(value) })}
              options={[{ value: "0", label: "None" }, ...([1, 2, 3, 4] as const).map((priority) => ({ value: String(priority), label: PRIORITY[priority].name, icon: PRIORITY[priority].icon, tone: priorityColor(t.c, priority) }))]}
            />
          </PropertyRow>
          <PropertyRow t={t} icon="Tag" label="Labels">
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              {document.labels.map((label) => (
                <Tag key={label.id} t={t} label={label.name} color={label.color} on={draft.labels.includes(label.id)} onPress={() => set({ labels: draft.labels.includes(label.id) ? draft.labels.filter((id) => id !== label.id) : [...draft.labels, label.id] })} />
              ))}
              <View style={{ width: 150 }}>
                <Field t={t} icon="Plus" value={newLabel} onChangeText={setNewLabel} onSubmit={addLabel} placeholder="New label" accessibilityLabel="New label" />
              </View>
            </View>
          </PropertyRow>
          <PropertyRow t={t} icon="Calendar" label="Due date">
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <Tag t={t} label="Today" on={due === today} onPress={() => set({ dueText: today })} />
              <Tag t={t} label="Tomorrow" on={due === plusDays(1)} onPress={() => set({ dueText: plusDays(1) })} />
              <Tag t={t} label="Next Monday" on={due === nextMonday} onPress={() => set({ dueText: nextMonday })} />
              <View style={{ width: 170 }}>
                <Field t={t} plain value={draft.dueText} onChangeText={(dueText) => set({ dueText })} placeholder="fri, 20 nov, 2026-11-20" accessibilityLabel="Due date" error={dueProblem} />
              </View>
              {draft.dueText ? <IconButton t={t} size="sm" icon="X" label="Clear the due date" onPress={() => set({ dueText: "" })} /> : null}
            </View>
            {due && !dueProblem ? <Text style={t.text.small}>{new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Text> : null}
          </PropertyRow>
          {task ? (
            <PropertyRow t={t} icon="AlarmClock" label="Reminder">
              {finished ? (
                <Text style={t.text.meta}>{task.reminder ? "Paused while the card is in Done or archived." : "Move the card out of Done to set a reminder."}</Text>
              ) : reminderOpen ? (
                <View style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.card, backgroundColor: t.c.surface1 }}>
                  <ReminderPicker deps={deps} target={{ kind: "task", taskId: task.id }} title={task.title} theme={theme} compact={compact} embedded onDone={() => setReminderOpen(false)} />
                </View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={task.reminder ? `Reminder ${formatDue(task.reminder, now)}. Change it` : "Set a reminder"} onPress={() => setReminderOpen(true)} style={{ alignSelf: "flex-start", height: t.control, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
                  <Text style={{ color: task.reminder ? t.c.foreground : t.c.foregroundMuted, fontSize: 13 }}>{task.reminder ? formatDue(task.reminder, now) : "Set a reminder"}</Text>
                  <Icon name="ChevronDown" size={14} color={t.c.foregroundMuted} />
                </Pressable>
              )}
            </PropertyRow>
          ) : null}
          <PropertyRow t={t} icon="Link" label="Link">
            <Field t={t} plain value={draft.url} onChangeText={(url) => set({ url })} placeholder="https://…" accessibilityLabel="Web address" />
          </PropertyRow>
          {task?.links.agentId ? (
            <PropertyRow t={t} icon="MessageSquare" label="Chat">
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <Text style={[t.text.body, { flexShrink: 1 }]} numberOfLines={1}>
                  {chat?.title ?? "Closed or not loaded"}
                </Text>
                <Button t={t} variant="ghost" icon="TextCursorInput" label="Insert into chat" accessibilityLabel="Insert this task into the chat" onPress={insertIntoChat} />
              </View>
            </PropertyRow>
          ) : null}
        </View>

        {task ? <Checklist t={t} task={task} checked={checked} newItem={newItem} setNewItem={setNewItem} run={run} /> : null}

        {error ? <Text style={t.text.danger}>{error}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {task ? <Button t={t} variant="ghost" icon={task.archivedAt ? "ArchiveRestore" : "Archive"} label={task.archivedAt ? "Restore" : "Archive"} onPress={() => void run({ kind: task.archivedAt ? "restoreTask" : "archiveTask", id: task.id }).then((ok) => ok && onClose())} /> : null}
            {task ? (
              <Button
                t={t}
                variant="danger"
                icon="Trash2"
                label={confirmDelete ? "Press again to delete" : "Delete"}
                accessibilityLabel={confirmDelete ? "Press again to delete for good" : "Delete"}
                onPress={() => (confirmDelete ? void run({ kind: "deleteTask", id: task.id }).then((ok) => ok && onClose()) : setConfirmDelete(true))}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button t={t} label="Cancel" onPress={onClose} />
            <Button t={t} variant="primary" label={task ? "Save" : "Add task"} accessibilityLabel="Save" disabled={!draft.title.trim() || !!dueProblem} onPress={() => void save()} />
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function Checklist({ t, task, checked, newItem, setNewItem, run }: { t: Tokens; task: Task; checked: number; newItem: string; setNewItem(text: string): void; run(...operations: TaskOperation[]): Promise<boolean> }) {
  const total = task.checklist.length;
  const add = () => {
    const text = newItem.trim();
    if (!text) return;
    void run({ kind: "addChecklistItem", id: task.id, item: { id: `i-${Date.now().toString(36)}`, text } }).then((ok) => ok && setNewItem(""));
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="ListChecks" size={14} color={t.c.foregroundMuted} />
        <Text style={t.text.label}>Checklist</Text>
        {total ? <Text style={t.text.small}>{checked} of {total}</Text> : null}
      </View>
      {total ? (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.c.surface2, overflow: "hidden" }}>
          <View style={{ width: `${Math.round((checked / total) * 100)}%`, height: 4, backgroundColor: checked === total ? t.c.statusSuccess : t.c.accent }} />
        </View>
      ) : null}
      {task.checklist.map((item) => (
        <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: t.compact ? 40 : 30 }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.text} onPress={() => void run({ kind: "toggleChecklistItem", id: task.id, itemId: item.id })} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name={item.done ? "SquareCheck" : "Square"} size={16} color={item.done ? t.c.statusSuccess : t.c.foregroundMuted} />
            <Text style={[t.text.body, { flex: 1, color: item.done ? t.c.foregroundMuted : t.c.foreground, textDecorationLine: item.done ? "line-through" : "none" }]}>{item.text}</Text>
          </Pressable>
          <IconButton t={t} size="sm" icon="X" label={`Remove ${item.text}`} onPress={() => void run({ kind: "removeChecklistItem", id: task.id, itemId: item.id })} />
        </View>
      ))}
      <Field t={t} icon="Plus" value={newItem} onChangeText={setNewItem} onSubmit={add} placeholder="Add an item and press Enter" accessibilityLabel="Add a checklist item" />
    </View>
  );
}
