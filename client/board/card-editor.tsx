import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { slug, type TaskOperation } from "../../shared/task-ops";
import type { Task, TaskDocument } from "../../shared/tasks";
import { parseDueDate } from "../../shared/when";
import { useValue } from "../profile-store";
import { ReminderPicker } from "../reminder-picker";
import { tasksOf } from "../task-store";
import type { BoardDeps } from "./deps";
import { boardStyles, PRIORITY_COLOR } from "./styles";

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

function Chip({ label, on, onPress, theme, color }: { label: string; on: boolean; onPress(): void; theme: PluginTheme; color?: string }) {
  const styles = boardStyles(theme, false);
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} style={[styles.chip, on ? { backgroundColor: color ?? theme.colors.accent, borderColor: color ?? theme.colors.accent } : null]}>
      <Text style={on ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </Pressable>
  );
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
  const styles = useMemo(() => boardStyles(theme, compact), [theme, compact]);
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

  const field = (label: string, child: ReactNode) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {child}
    </View>
  );

  return (
    <Modal title={task ? "Edit task" : "New task"} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        {field(
          "Title",
          <TextInput accessibilityLabel="Title" value={draft.title} onChangeText={(title) => set({ title })} style={styles.input} placeholderTextColor={theme.colors.foregroundMuted} placeholder="What needs doing" />,
        )}
        {field(
          "Description",
          <TextInput accessibilityLabel="Description" multiline value={draft.description} onChangeText={(description) => set({ description })} style={styles.multiline} />,
        )}
        {field(
          "Column",
          <View style={styles.row}>
            {document.columns.map((column) => (
              <Chip key={column.id} label={column.name} on={draft.column === column.id} onPress={() => set({ column: column.id })} theme={theme} color={column.color} />
            ))}
          </View>,
        )}
        {field(
          "Priority",
          <View style={styles.row}>
            <Chip label="None" on={draft.priority === null} onPress={() => set({ priority: null })} theme={theme} />
            {[1, 2, 3, 4].map((priority) => (
              <Chip key={priority} label={`P${priority}`} on={draft.priority === priority} onPress={() => set({ priority })} theme={theme} color={PRIORITY_COLOR(theme, priority)} />
            ))}
          </View>,
        )}
        {field(
          "Labels",
          <View style={styles.row}>
            {document.labels.map((label) => (
              <Chip
                key={label.id}
                label={label.name}
                color={label.color}
                on={draft.labels.includes(label.id)}
                onPress={() => set({ labels: draft.labels.includes(label.id) ? draft.labels.filter((id) => id !== label.id) : [...draft.labels, label.id] })}
                theme={theme}
              />
            ))}
            <TextInput
              accessibilityLabel="New label"
              placeholder="New label"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={newLabel}
              onChangeText={setNewLabel}
              onSubmitEditing={() => {
                const name = newLabel.trim();
                if (!name) return;
                const id = slug(name, "label");
                void run({ kind: "saveLabel", label: { id: document.labels.some((label) => label.id === id) ? `${id}-${Date.now().toString(36)}` : id, name } }).then((ok) => {
                  if (ok) setNewLabel("");
                });
              }}
              style={styles.smallInput}
            />
          </View>,
        )}
        {field(
          "Due date",
          <>
            <TextInput accessibilityLabel="Due date" placeholder="fri, tomorrow, 2026-11-20" placeholderTextColor={theme.colors.foregroundMuted} value={draft.dueText} onChangeText={(dueText) => set({ dueText })} style={styles.input} />
            {dueProblem ? <Text style={styles.error}>{dueProblem}</Text> : due ? <Text style={styles.muted}>Due {due}</Text> : null}
          </>,
        )}
        {task
          ? field(
              "Reminder",
              // Reminders do not fire on Done or archived cards, so they are not offered there.
              finished ? (
                <Text style={styles.muted}>{task.reminder ? "Paused while the card is in Done or archived." : "Move the card out of Done to set a reminder."}</Text>
              ) : (
                <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8 }}>
                  <ReminderPicker deps={deps} target={{ kind: "task", taskId: task.id }} title={task.title} theme={theme} embedded onDone={() => {}} />
                </View>
              ),
            )
          : null}
        {task
          ? field(
              `Checklist ${task.checklist.filter((item) => item.done).length}/${task.checklist.length}`,
              <View style={{ gap: 4 }}>
                {task.checklist.map((item) => (
                  <View key={item.id} style={styles.row}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.text} onPress={() => void run({ kind: "toggleChecklistItem", id: task.id, itemId: item.id })}>
                      <Icon name={item.done ? "SquareCheck" : "Square"} size={16} color={theme.colors.foregroundMuted} />
                    </Pressable>
                    <Text style={[styles.muted, { flex: 1, textDecorationLine: item.done ? "line-through" : "none" }]}>{item.text}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.text}`} onPress={() => void run({ kind: "removeChecklistItem", id: task.id, itemId: item.id })}>
                      <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
                    </Pressable>
                  </View>
                ))}
                <TextInput
                  accessibilityLabel="Add a checklist item"
                  placeholder="Add an item and press Enter"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  value={newItem}
                  onChangeText={setNewItem}
                  onSubmitEditing={() => {
                    const text = newItem.trim();
                    if (!text) return;
                    void run({ kind: "addChecklistItem", id: task.id, item: { id: `i-${Date.now().toString(36)}`, text } }).then((ok) => ok && setNewItem(""));
                  }}
                  style={styles.input}
                />
              </View>,
            )
          : null}
        {field(
          "Link",
          <TextInput accessibilityLabel="Web address" placeholder="https://…" placeholderTextColor={theme.colors.foregroundMuted} value={draft.url} onChangeText={(url) => set({ url })} autoCapitalize="none" style={styles.input} />,
        )}
        {task?.links.agentId ? (
          <View style={styles.row}>
            <Text style={styles.muted}>Chat: {chat?.title ?? "closed or not loaded"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Insert this task into the chat" onPress={insertIntoChat} style={styles.button}>
              <Text style={styles.buttonText}>Insert into chat</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <View style={styles.row}>
            {task ? (
              <Pressable accessibilityRole="button" accessibilityLabel={task.archivedAt ? "Restore" : "Archive"} onPress={() => void run({ kind: task.archivedAt ? "restoreTask" : "archiveTask", id: task.id }).then((ok) => ok && onClose())} style={styles.button}>
                <Text style={styles.buttonText}>{task.archivedAt ? "Restore" : "Archive"}</Text>
              </Pressable>
            ) : null}
            {task ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmDelete ? "Press again to delete for good" : "Delete"}
                onPress={() => (confirmDelete ? void run({ kind: "deleteTask", id: task.id }).then((ok) => ok && onClose()) : setConfirmDelete(true))}
                style={styles.danger}
              >
                <Text style={styles.dangerText}>{confirmDelete ? "Press again to delete" : "Delete"}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={styles.button}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Save" disabled={!draft.title.trim() || !!dueProblem} onPress={() => void save()} style={[styles.primary, !draft.title.trim() || dueProblem ? styles.disabled : null]}>
              <Text style={styles.primaryText}>{task ? "Save" : "Add task"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
