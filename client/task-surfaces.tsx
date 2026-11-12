import type { PluginButtonContentProps, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import type { z } from "zod";
import type { AttentionList } from "./attention";
import type { ApplyBookmark, BookmarkStore } from "./bookmark-store";
import type { Profile } from "../shared/profile";
import { parseQuickAdd } from "../shared/quick-add";
import { reminderAt } from "../shared/reminders";
import type { reminderRowSchema } from "../shared/reminder-contracts";
import { firstOpenColumn } from "../shared/task-ops";
import { formatDue } from "../shared/time-text";
import { parseWhen } from "../shared/when";
import { newTaskId } from "./board/card-editor";
import type { BoardDeps } from "./board/deps";
import { chatForWorkspace } from "./chats";
import { type ValueStore, useValue } from "./profile-store";
import type { AlertEntry } from "./reminder-alerts";
import { ReminderPicker } from "./reminder-picker";
import { tasksOf } from "./task-store";
import { Button, Icon, MenuItem, useTokens } from "./ui/kit";
import { requestNotifications } from "./web";

export interface Announcement {
  seq: number;
  entries: readonly AlertEntry[];
}

export interface SurfaceDeps extends BoardDeps {
  announcements: ValueStore<Announcement>;
  updateView(patch: Partial<Profile["sidebar"]["view"]>): Promise<void>;
  // Changes the active layout's chat settings in place (see index.client.tsx).
  updateChat(change: (chat: Record<string, unknown>) => void): Promise<void>;
  // False until the first workspace list arrives.
  workspacesReady: ValueStore<boolean>;
  // Chats and sub-agents waiting on the user.
  attention: ValueStore<AttentionList>;
  // True once the first agent snapshot arrived (or the agent watch failed).
  attentionReady: ValueStore<boolean>;
  bookmarks: BookmarkStore;
  applyBookmark: ApplyBookmark;
  bookmarkLastAnswer(agentId: string, workspaceId: string | null, note: string): Promise<void>;
  // Opens Settings, Sidebar, editing the layout in use (the one the sidebar shows).
  openSidebarSettings(): void;
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

// The popover behind a chat's "Remind me" pill: the reminder picker, and adding the chat as a task.
export function createChatPopover(deps: BoardDeps) {
  return function ChatReminderPopover(props: PluginButtonContentProps) {
    const { workspaceId, theme, layout, close } = props;
    const t = useTokens(theme, layout.compact);
    const toast = useToast();
    const chats = useValue(deps.chats);
    // A pill belongs to one chat; a header button to a workspace, so it uses that workspace's chat.
    const chatId = props.context === "agent" ? props.agentId : chatForWorkspace(chats, workspaceId, null);
    if (!chatId) {
      return (
        <View style={{ padding: 16, width: 300, maxWidth: "100%", alignItems: "center", gap: 8 }}>
          <Icon name="AlarmClockOff" size={20} color={t.c.foregroundMuted} />
          <Text style={[t.text.meta, { textAlign: "center" }]}>This workspace has no open chat to remind you about.</Text>
        </View>
      );
    }
    const title = chats.get(chatId)?.title ?? "this chat";
    const addTask = () =>
      void runTaskCommand(deps, chatId, workspaceId, "").then(
        () => {
          toast.show(`Added “${title}” to your tasks`, { variant: "success" });
          close();
        },
        (error: unknown) => toast.error(`Could not add the task: ${message(error)}`),
      );
    return (
      <View style={{ width: 340, maxWidth: "100%" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 14 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface2 }}>
            <Icon name="AlarmClock" size={15} color={t.c.statusWarning} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={t.text.heading}>Remind me</Text>
            <Text style={t.text.small} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>
        <ReminderPicker deps={deps} target={{ kind: "chat", agentId: chatId, workspaceId, title }} title={title} theme={theme} compact={layout.compact} embedded onDone={close} />
        <View style={{ borderTopWidth: 1, borderTopColor: t.c.border, padding: 6 }}>
          <MenuItem t={t} icon="ListPlus" label="Add this chat to your tasks" onPress={addTask} />
        </View>
      </View>
    );
  };
}

type ReminderRowData = z.infer<typeof reminderRowSchema>;

// The row the daemon writes into a chat when a task's reminder comes due: a small card that stays
// actionable while that reminder is still the task's current one.
export function createReminderRow(deps: BoardDeps) {
  return function ReminderTimelineRow({ item, theme, layout }: PluginTimelineItemProps<ReminderRowData>) {
    const t = useTokens(theme, layout.compact);
    const document = tasksOf(useValue(deps.tasks));
    const toast = useToast();
    const task = item.data.taskId ? document.tasks.find((entry) => entry.id === item.data.taskId) ?? null : null;
    const done = document.columns.find((column) => column.done);
    const finished = task === null || task.archivedAt !== null || task.column === done?.id;
    const open = !finished && task.reminder?.setAt === item.data.setAt;
    // Snoozed or changed since this row was written: it points at the newer time, not "done".
    const status = open ? "Due now" : !finished && task.reminder ? `Moved to ${formatDue(task.reminder, new Date())}` : "Done";
    const run = (...operations: Parameters<typeof deps.apply>) => void deps.apply(...operations).catch((error: unknown) => toast.error(`Could not change the reminder: ${message(error)}`));
    return (
      <View style={{ marginVertical: 6, padding: 12, gap: 8, maxWidth: 640, borderRadius: t.radius.card, borderWidth: 1, borderColor: open ? t.c.statusWarning : t.c.border, backgroundColor: t.c.surface1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name={open ? "AlarmClock" : "AlarmClockCheck"} size={16} color={open ? t.c.statusWarning : t.c.foregroundMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.text.body, { fontWeight: "600" }]} numberOfLines={2}>
              {item.data.title ?? "You asked to come back to this chat"}
            </Text>
            <Text style={[t.text.small, open ? { color: t.c.statusWarning } : null]}>Reminder · {status}</Text>
          </View>
        </View>
        {item.data.note ? <Text style={[t.text.meta, { marginLeft: 26 }]}>{item.data.note}</Text> : null}
        {open && task ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginLeft: 26 }}>
            <Button t={t} icon="Check" label="Done" accessibilityLabel="Clear this reminder" onPress={() => run({ kind: "setReminder", id: task.id, reminder: null })} />
            <Button t={t} label="+15m" accessibilityLabel="Remind me again in 15 minutes" onPress={() => run({ kind: "remindAgain", id: task.id, minutes: 15 })} />
            <Button t={t} label="+1h" accessibilityLabel="Remind me again in an hour" onPress={() => run({ kind: "remindAgain", id: task.id, minutes: 60 })} />
            {done ? <Button t={t} variant="ghost" icon="CircleCheck" label={`Move to ${done.name}`} onPress={() => run({ kind: "moveTask", id: task.id, column: done.id })} /> : null}
          </View>
        ) : null}
      </View>
    );
  };
}
