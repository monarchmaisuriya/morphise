import { TextInput } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Profile } from "../shared/profile";
import { MAX_NOTE_LENGTH, presetTitle, type Reminder, reminderAt } from "../shared/reminders";
import { followUpTask, type TaskOperation } from "../shared/task-ops";
import type { TaskDocument } from "../shared/tasks";
import { formatDue } from "../shared/time-text";
import { parseWhen } from "../shared/when";
import { useValue } from "./profile-store";
import { type TaskStore, tasksOf, type ApplyTaskOperations } from "./task-store";
import { requestNotifications } from "./web";

// What a reminder is about: one chat (its follow-up task) or one task.
export type ReminderTarget = { kind: "chat"; agentId: string; workspaceId: string | null; title: string } | { kind: "task"; taskId: string };

export interface PickerDeps {
  tasks: TaskStore;
  apply: ApplyTaskOperations;
  reminderSettings(): Profile["reminders"];
}

export function currentReminder(document: TaskDocument, target: ReminderTarget): Reminder | null {
  if (target.kind === "chat") return followUpTask(document, target.agentId)?.reminder ?? null;
  return document.tasks.find((task) => task.id === target.taskId)?.reminder ?? null;
}

// "Reminds you in 25m", "Reminds you on Thu 09:00", or "Reminder due 5m ago".
export function reminderPhrase(reminder: Reminder, now: Date): string {
  const due = formatDue(reminder, now);
  if (due.startsWith("due")) return `Reminder ${due}`;
  return due.startsWith("in ") ? `Reminds you ${due}` : `Reminds you on ${due}`;
}

function operationFor(target: ReminderTarget, reminder: Reminder | null): TaskOperation {
  return target.kind === "chat"
    ? { kind: "remindChat", agentId: target.agentId, workspaceId: target.workspaceId, title: target.title, reminder }
    : { kind: "setReminder", id: target.taskId, reminder };
}

function againOperation(document: TaskDocument, target: ReminderTarget, minutes: number): TaskOperation | null {
  const taskId = target.kind === "task" ? target.taskId : followUpTask(document, target.agentId)?.id;
  return taskId ? { kind: "remindAgain", id: taskId, minutes } : null;
}

// Times offered as one-tap choices besides the presets: this evening and tomorrow morning.
function dayChoices(now: Date): { label: string; at: Date }[] {
  const choices: { label: string; at: Date }[] = [];
  if (now.getHours() < 17) {
    const evening = new Date(now);
    evening.setHours(18, 0, 0, 0);
    choices.push({ label: "This evening", at: evening });
  }
  const morning = new Date(now);
  morning.setDate(morning.getDate() + 1);
  morning.setHours(9, 0, 0, 0);
  choices.push({ label: "Tomorrow morning", at: morning });
  return choices;
}

// `embedded` fits the picker inside a card or a sidebar row instead of a popover.
export function ReminderPicker({ deps, target, title, theme, onDone, embedded = false }: { deps: PickerDeps; target: ReminderTarget; title: string; theme: PluginTheme; onDone(): void; embedded?: boolean }) {
  const document = tasksOf(useValue(deps.tasks));
  const current = currentReminder(document, target);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState(current?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const settings = deps.reminderSettings();
  const styles = useMemo(() => pickerStyles(theme), [theme]);

  const preview = typed.trim() ? parseWhen(typed, now) : null;
  const previewText = !preview ? null : preview.ok ? reminderPhrase({ at: preview.at.toISOString(), setAt: now.toISOString() }, now) : preview.error;

  async function run(operation: TaskOperation | null) {
    if (!operation) return;
    setBusy(true);
    setError(null);
    try {
      await deps.apply(operation);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function setAt(at: Date) {
    let reminder: Reminder;
    try {
      reminder = reminderAt(at, new Date(), note);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // Browsers ask for notification permission only from a user action; this is one.
    if (settings.desktopNotification) void requestNotifications();
    void run(operationFor(target, reminder));
  }

  const chip = (label: string, onPress: () => void, key = label) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={embedded ? styles.embedded : styles.panel}>
      <Text style={styles.title} numberOfLines={2}>
        Remind me about {title}
      </Text>
      {current ? (
        <View style={styles.current}>
          <Text style={styles.currentText}>{reminderPhrase(current, now)}</Text>
          {current.note ? <Text style={styles.muted}>{current.note}</Text> : null}
          <View style={styles.row}>
            {chip("Done", () => void run(operationFor(target, null)))}
            {chip("+15m", () => void run(againOperation(document, target, 15)))}
            {chip("+1h", () => void run(againOperation(document, target, 60)))}
          </View>
        </View>
      ) : null}
      <Text style={styles.label}>{current ? "Change to" : "When"}</Text>
      <View style={styles.row}>
        {settings.presets.map((minutes) => chip(presetTitle(minutes), () => setAt(new Date(Date.now() + minutes * 60_000)), `m${minutes}`))}
        {dayChoices(now).map((choice) => chip(choice.label, () => setAt(choice.at)))}
      </View>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Other time"
          placeholder="Other time: 45m, 17:30, tomorrow 9am"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set reminder"
          disabled={busy || !preview?.ok}
          onPress={() => preview?.ok && setAt(preview.at)}
          style={[styles.primary, !preview?.ok ? styles.disabled : null]}
        >
          <Text style={styles.primaryText}>Set</Text>
        </Pressable>
      </View>
      {previewText ? <Text style={preview?.ok ? styles.muted : styles.error}>{previewText}</Text> : null}
      <TextInput
        accessibilityLabel="Note"
        placeholder="Note: what to do when you're back (optional)"
        placeholderTextColor={theme.colors.foregroundMuted}
        value={note}
        maxLength={MAX_NOTE_LENGTH}
        onChangeText={setNote}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function pickerStyles(theme: PluginTheme) {
  return {
    panel: { gap: 8, padding: 12, minWidth: 280, maxWidth: 380 },
    embedded: { gap: 8, padding: 8 },
    title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
    current: { gap: 4, padding: 8, borderRadius: 8, backgroundColor: theme.colors.surface2 },
    currentText: { color: theme.colors.foreground, fontSize: 12 },
    label: { color: theme.colors.foregroundMuted, fontSize: 11 },
    row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, alignItems: "center" as const },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
    chipText: { color: theme.colors.foreground, fontSize: 12 },
    input: {
      flex: 1,
      minWidth: 160,
      height: 30,
      paddingHorizontal: 8,
      fontSize: 12,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 6,
    },
    primary: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: theme.colors.accent },
    primaryText: { color: theme.colors.accentForeground, fontSize: 12, fontWeight: "600" as const },
    disabled: { opacity: 0.4 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 11 },
    error: { color: theme.colors.statusDanger, fontSize: 11 },
  };
}
