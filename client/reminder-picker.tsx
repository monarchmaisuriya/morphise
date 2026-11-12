import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Text, View } from "react-native";
import type { Profile } from "../shared/profile";
import { MAX_NOTE_LENGTH, presetTitle, type Reminder, reminderAt } from "../shared/reminders";
import { followUpTask, workspaceTask, type TaskOperation } from "../shared/task-ops";
import type { TaskDocument } from "../shared/tasks";
import { formatDue } from "../shared/time-text";
import { parseWhen } from "../shared/when";
import { useValue } from "./profile-store";
import { type ApplyTaskOperations, type TaskStore, tasksOf } from "./task-store";
import { Button, Field, Icon, MenuItem, useTokens } from "./ui/kit";
import { requestNotifications } from "./web";

// What a reminder is about: one chat or one workspace (each through its follow-up task), or one task.
export type ReminderTarget =
  | { kind: "chat"; agentId: string; workspaceId: string | null; title: string }
  | { kind: "workspace"; workspaceId: string; title: string }
  | { kind: "task"; taskId: string };

// The task a chat or workspace reminder lives on, when it has one yet.
function followUpOf(document: TaskDocument, target: ReminderTarget) {
  if (target.kind === "chat") return followUpTask(document, target.agentId);
  if (target.kind === "workspace") return workspaceTask(document, target.workspaceId);
  return document.tasks.find((task) => task.id === target.taskId) ?? null;
}

export interface PickerDeps {
  tasks: TaskStore;
  apply: ApplyTaskOperations;
  reminderSettings(): Profile["reminders"];
}

export function currentReminder(document: TaskDocument, target: ReminderTarget): Reminder | null {
  return followUpOf(document, target)?.reminder ?? null;
}

// "Reminds you in 25m", "Reminds you on Thu 09:00", or "Reminder due 5m ago".
export function reminderPhrase(reminder: Reminder, now: Date): string {
  const due = formatDue(reminder, now);
  if (due.startsWith("due")) return `Reminder ${due}`;
  return due.startsWith("in ") ? `Reminds you ${due}` : `Reminds you on ${due}`;
}

function operationFor(target: ReminderTarget, reminder: Reminder | null): TaskOperation {
  if (target.kind === "chat") return { kind: "remindChat", agentId: target.agentId, workspaceId: target.workspaceId, title: target.title, reminder };
  if (target.kind === "workspace") return { kind: "remindWorkspace", workspaceId: target.workspaceId, title: target.title, reminder };
  return { kind: "setReminder", id: target.taskId, reminder };
}

function againOperation(document: TaskDocument, target: ReminderTarget, minutes: number): TaskOperation | null {
  const taskId = followUpOf(document, target)?.id;
  return taskId ? { kind: "remindAgain", id: taskId, minutes } : null;
}

// The absolute time a choice resolves to, shown beside it: "21:47", "Thu 09:00".
function clock(at: Date, now: Date): string {
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return at.toDateString() === now.toDateString() ? time : `${at.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

function dayAt(now: Date, days: number, hour: number): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

// The choices: the user's presets, then this evening (before 17:00), tomorrow morning and next
// Monday morning. Each resolves from the time it is read: the hint when drawn, the reminder when
// tapped, so a picker left open does not set a stale time.
function choices(presets: readonly number[], now: Date): { label: string; at(from: Date): Date }[] {
  const list = presets.map((minutes) => ({ label: `In ${presetTitle(minutes)}`, at: (from: Date) => new Date(from.getTime() + minutes * 60_000) }));
  if (now.getHours() < 17) list.push({ label: "This evening", at: (from: Date) => dayAt(from, 0, 18) });
  list.push({ label: "Tomorrow morning", at: (from: Date) => dayAt(from, 1, 9) });
  list.push({ label: "Next week", at: (from: Date) => dayAt(from, ((8 - from.getDay()) % 7) || 7, 9) });
  return list;
}

// `embedded` fits the picker inside a card or a sidebar row instead of a popover.
export function ReminderPicker({ deps, target, title, theme, onDone, embedded = false, compact = false }: { deps: PickerDeps; target: ReminderTarget; title: string; theme: PluginTheme; onDone(): void; embedded?: boolean; compact?: boolean }) {
  const t = useTokens(theme, compact);
  const document = tasksOf(useValue(deps.tasks));
  const current = currentReminder(document, target);
  const [typed, setTyped] = useState("");
  const [custom, setCustom] = useState(false);
  const [note, setNote] = useState(current?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const settings = deps.reminderSettings();
  const preview = typed.trim() ? parseWhen(typed, now) : null;

  async function run(operation: TaskOperation | null) {
    if (!operation || busy) return;
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

  function setAt(when: Date) {
    let reminder: Reminder;
    try {
      reminder = reminderAt(when, new Date(), note);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // Browsers ask for notification permission only from a user action; this is one.
    if (settings.desktopNotification) void requestNotifications();
    void run(operationFor(target, reminder));
  }

  return (
    <View style={{ gap: 10, padding: embedded ? 8 : 12, width: embedded ? undefined : 320, maxWidth: "100%" }}>
      {embedded ? null : (
        <Text style={t.text.heading} numberOfLines={2}>
          Remind me about {title}
        </Text>
      )}
      {current ? (
        <View style={{ gap: 8, padding: 10, borderRadius: t.radius.row, backgroundColor: t.c.surface2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="AlarmClock" size={14} color={t.c.statusWarning} />
            <Text style={[t.text.body, { flex: 1 }]}>{reminderPhrase(current, now)}</Text>
          </View>
          {current.note ? <Text style={t.text.meta}>{current.note}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Button t={t} icon="Check" label="Done" accessibilityLabel="Clear this reminder" disabled={busy} onPress={() => void run(operationFor(target, null))} />
            <Button t={t} label="+15m" accessibilityLabel="15 minutes later" disabled={busy} onPress={() => void run(againOperation(document, target, 15))} />
            <Button t={t} label="+1h" accessibilityLabel="An hour later" disabled={busy} onPress={() => void run(againOperation(document, target, 60))} />
          </View>
        </View>
      ) : null}
      <View>
        <Text style={[t.text.label, { paddingHorizontal: 8, paddingBottom: 4 }]}>{current ? "Change to" : "Remind me"}</Text>
        {choices(settings.presets, now).map((choice) => (
          <MenuItem key={choice.label} t={t} icon="Clock" label={choice.label} hint={clock(choice.at(now), now)} onPress={() => setAt(choice.at(new Date()))} />
        ))}
        <MenuItem t={t} icon="PencilLine" label="Custom time…" role="checkbox" checked={custom} onPress={() => setCustom(!custom)} />
      </View>
      {custom ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <Field
            t={t}
            grow
            plain
            autoFocus
            value={typed}
            onChangeText={setTyped}
            onSubmit={() => preview?.ok && setAt(preview.at)}
            placeholder="45m, 17:30, tomorrow 9am, fri 10:00"
            accessibilityLabel="Other time"
            hint={preview?.ok ? reminderPhrase({ at: preview.at.toISOString(), setAt: now.toISOString() }, now) : null}
            error={preview && !preview.ok ? preview.error : null}
          />
          <Button t={t} variant="primary" label="Set" accessibilityLabel="Set reminder" disabled={busy || !preview?.ok} onPress={() => preview?.ok && setAt(preview.at)} />
        </View>
      ) : null}
      <Field t={t} icon="StickyNote" value={note} onChangeText={setNote} maxLength={MAX_NOTE_LENGTH} placeholder="Note for when you come back (optional)" accessibilityLabel="Note" />
      {error ? <Text style={t.text.danger}>{error}</Text> : null}
    </View>
  );
}
