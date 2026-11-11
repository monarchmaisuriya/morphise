import type { PluginButtonContentProps, PluginSidebarItemProps, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon, SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { z } from "zod";
import { dueCount } from "../shared/board";
import { parseQuickAdd } from "../shared/quick-add";
import { reminderAt } from "../shared/reminders";
import type { reminderRowSchema } from "../shared/reminder-contracts";
import { firstOpenColumn, followUpTask } from "../shared/task-ops";
import { formatDue } from "../shared/time-text";
import { parseWhen } from "../shared/when";
import { newTaskId } from "./board/card-editor";
import { type BoardDeps, TASKS_SCREEN_ID } from "./board/deps";
import { chatForWorkspace } from "./chats";
import { type ValueStore, useValue } from "./profile-store";
import type { AlertEntry } from "./reminder-alerts";
import { useReminderClock } from "./reminder-clock";
import { ReminderPicker } from "./reminder-picker";
import { tasksOf } from "./task-store";
import { requestNotifications } from "./web";

export interface Announcement {
  seq: number;
  entries: readonly AlertEntry[];
}

export interface SurfaceDeps extends BoardDeps {
  announcements: ValueStore<Announcement>;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function chatTitle(deps: BoardDeps, agentId: string) {
  return deps.chats.get().get(agentId)?.title ?? "Chat";
}

// `/remind 45m`, `/remind tomorrow 9am`, `/remind clear`: the chat's follow-up task reminder.
export async function runRemindCommand(deps: BoardDeps, agentId: string, workspaceId: string, args: string) {
  const title = chatTitle(deps, agentId);
  if (args.trim().toLowerCase() === "clear") return void (await deps.apply({ kind: "remindChat", agentId, workspaceId, title, reminder: null }));
  const now = new Date();
  const when = parseWhen(args, now);
  if (!when.ok) throw new Error(when.error);
  if (deps.reminderSettings().desktopNotification) void requestNotifications();
  await deps.apply({ kind: "remindChat", agentId, workspaceId, title, reminder: reminderAt(when.at, now) });
}

// `/task Fix login p1 @bug tomorrow 9am`: a task linked to this chat, in quick-add syntax.
export async function runTaskCommand(deps: BoardDeps, agentId: string, workspaceId: string, args: string) {
  const now = new Date();
  const document = tasksOf(deps.tasks.get());
  const parsed = parseQuickAdd(args.trim() || chatTitle(deps, agentId), document, now);
  if (parsed.problems.length) throw new Error(parsed.problems.join(". "));
  const reminder = parsed.reminderAt ? reminderAt(parsed.reminderAt, now) : null;
  await deps.apply({
    kind: "addTask",
    task: { id: newTaskId(), title: parsed.title, column: parsed.column ?? firstOpenColumn(document).id, priority: parsed.priority, due: parsed.due, reminder, links: { agentId, workspaceId } },
    labelNames: parsed.labelNames,
  });
}

// The "Tasks" row in Paseo's sidebar header, in every sidebar view. While mounted, it also shows
// the toast for each reminder that comes due.
export function createTasksSidebarItem(deps: SurfaceDeps) {
  return function TasksSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
    const document = tasksOf(useValue(deps.tasks));
    const now = useReminderClock(document.tasks.flatMap((task) => (task.reminder ? [task.reminder] : [])), true);
    const announcement = useValue(deps.announcements);
    const toast = useToast();
    // A remount (drawer reopened, view switched) must not replay toasts already shown.
    const shownSeq = useRef(announcement.seq);
    useEffect(() => {
      if (announcement.seq <= shownSeq.current) return;
      shownSeq.current = announcement.seq;
      for (const entry of announcement.entries) toast.show(`Reminder: ${entry.title}${entry.reminder.note ? `. ${entry.reminder.note}` : ""}`, { variant: "info", durationMs: 8000 });
    }, [announcement.seq]);
    const due = dueCount(document, now);
    return (
      <SidebarRow
        icon="ListTodo"
        label={due > 0 ? `Tasks · ${due} due` : "Tasks"}
        active={currentScreen?.screenId === TASKS_SCREEN_ID}
        onPress={() => openScreen({ screenId: TASKS_SCREEN_ID, params: due > 0 ? { tab: "today" } : {} })}
      />
    );
  };
}

// The popover behind a chat's "Remind me" pill: the reminder picker, and adding the chat as a task.
export function createChatPopover(deps: BoardDeps) {
  return function ChatReminderPopover(props: PluginButtonContentProps) {
    const { workspaceId, theme, close } = props;
    const toast = useToast();
    const chats = useValue(deps.chats);
    // A pill belongs to one chat; a header button to a workspace, so it uses that workspace's chat.
    const chatId = props.context === "agent" ? props.agentId : chatForWorkspace(chats, workspaceId, null);
    if (!chatId) {
      return (
        <View style={{ padding: 12, maxWidth: 300 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>This workspace has no open chat to remind you about.</Text>
        </View>
      );
    }
    const title = chats.get(chatId)?.title ?? "this chat";
    const addTask = () =>
      void runTaskCommand(deps, chatId, workspaceId, "").then(
        () => {
          toast.show(`Added "${title}" to your tasks`, { variant: "success" });
          close();
        },
        (error: unknown) => toast.error(`Could not add the task: ${message(error)}`),
      );
    return (
      <View>
        <ReminderPicker deps={deps} target={{ kind: "chat", agentId: chatId, workspaceId, title }} title={title} theme={theme} onDone={close} />
        <Pressable accessibilityRole="button" accessibilityLabel="Add this chat to your tasks" onPress={addTask} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 12 }}>
          <Icon name="ListPlus" size={14} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.accent, fontSize: 12 }}>Add this chat to your tasks</Text>
        </Pressable>
      </View>
    );
  };
}

type ReminderRowData = z.infer<typeof reminderRowSchema>;

// The row the daemon writes into a chat when a task's reminder comes due. It stays actionable
// while that reminder is still the task's current one.
export function createReminderRow(deps: BoardDeps) {
  return function ReminderTimelineRow({ item, theme }: PluginTimelineItemProps<ReminderRowData>) {
    const document = tasksOf(useValue(deps.tasks));
    const toast = useToast();
    const task = item.data.taskId ? document.tasks.find((entry) => entry.id === item.data.taskId) ?? null : null;
    const done = document.columns.find((column) => column.done);
    const finished = task === null || task.archivedAt !== null || task.column === done?.id;
    const open = !finished && task.reminder?.setAt === item.data.setAt;
    // Snoozed or changed since this row was written: it points at the newer time, not "done".
    const later = !finished && !open && task.reminder ? ` (moved to ${formatDue(task.reminder, new Date())})` : "";
    const run = (...operations: Parameters<typeof deps.apply>) => void deps.apply(...operations).catch((error: unknown) => toast.error(`Could not change the reminder: ${message(error)}`));
    const button = (label: string, onPress: () => void) => (
      <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
    return (
      <View style={{ gap: 4, paddingVertical: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Icon name="AlarmClock" size={14} color={open ? theme.colors.statusWarning : theme.colors.foregroundMuted} />
          <Text style={{ color: theme.colors.foreground, fontSize: 13, flexShrink: 1 }}>
            Reminder: {item.data.title ?? "you asked to come back to this chat"}
            {open ? "" : later || " (done)"}
          </Text>
          {open && task
            ? [
                button("Done", () => run({ kind: "setReminder", id: task.id, reminder: null })),
                button("+15m", () => run({ kind: "remindAgain", id: task.id, minutes: 15 })),
                button("+1h", () => run({ kind: "remindAgain", id: task.id, minutes: 60 })),
                done ? button(`Move to ${done.name}`, () => run({ kind: "moveTask", id: task.id, column: done.id })) : null,
              ]
            : null}
        </View>
        {item.data.note ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginLeft: 22 }}>{item.data.note}</Text> : null}
      </View>
    );
  };
}

// The follow-up task of a chat, for pill labels.
export function chatReminder(deps: BoardDeps, agentId: string) {
  return followUpTask(tasksOf(deps.tasks.get()), agentId)?.reminder ?? null;
}
