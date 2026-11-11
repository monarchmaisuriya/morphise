import type {
  PluginButton,
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
  PluginTimelineItemProps,
} from "@getpaseo/plugin/client";
import { useAgent } from "@getpaseo/plugin/client";
import { Icon, SettingsAction, SettingsCard, SettingsSection, SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { Profile } from "../shared/profile";
import { remindersArm } from "../shared/reminder-contracts";
import { isDue, parseDuration, presetTitle, readReminder, type Reminder } from "../shared/reminders";
import { formatDue } from "../shared/time-text";
import { type ValueStore, useValue } from "./profile-store";
import { useReminderClock } from "./reminder-clock";
import { clearReminder, type ReminderEntry, type Reminders, setReminder } from "./reminders";
import { notificationSupport, requestNotifications } from "./web";

export const REMINDERS_SCREEN_ID = "reminders";

export interface Announcement {
  seq: number;
  entries: readonly ReminderEntry[];
}

export interface ReminderDeps {
  client: PluginClientContext;
  reminders: ValueStore<Reminders>;
  announcements: ValueStore<Announcement>;
}

type Settings = Profile["reminders"];

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// Sets or clears a chat's reminder, then tells the daemon so it re-arms. Rejections surface as
// Paseo's error toast where the caller is a Paseo button or command.
export async function changeReminder(client: PluginClientContext, agentId: string, minutes: number | null, settings: Settings) {
  const chat = client.paseo.agents.ref(agentId);
  if (minutes === null) await clearReminder(chat);
  else {
    // Asking needs a user action; every caller here is one.
    if (settings.desktopNotification) void requestNotifications();
    await setReminder(chat, minutes);
  }
  await client.rpc(remindersArm, { agentId });
}

export function reminderMenu(client: PluginClientContext, agentId: string, settings: Settings): PluginButton {
  return {
    title: "Remind me",
    icon: "AlarmClock",
    label: "Remind me",
    behavior: {
      kind: "menu",
      items: [
        ...settings.presets.map((minutes) => ({
          kind: "item" as const,
          id: `in-${minutes}`,
          title: `In ${presetTitle(minutes)}`,
          behavior: { kind: "action" as const, onPress: () => changeReminder(client, agentId, minutes, settings) },
        })),
        {
          kind: "item" as const,
          id: "clear",
          title: "Clear reminder",
          icon: "BellOff",
          behavior: { kind: "action" as const, onPress: () => changeReminder(client, agentId, null, settings) },
        },
      ],
    },
  };
}

// `/remind 45m`, `/remind 2h`, `/remind clear`.
export async function runRemindCommand(client: PluginClientContext, agentId: string, args: string, settings: Settings) {
  if (args.trim().toLowerCase() === "clear") return changeReminder(client, agentId, null, settings);
  const parsed = parseDuration(args);
  if (!parsed.ok) throw new Error(parsed.error);
  return changeReminder(client, agentId, parsed.minutes, settings);
}

function dueCount(reminders: Reminders, now: Date) {
  let count = 0;
  for (const entry of reminders.values()) if (isDue(entry.reminder, now)) count++;
  return count;
}

// The "Reminders" row in Paseo's sidebar header, in every sidebar view. While mounted, it also
// shows the toast for each reminder that comes due.
export function createRemindersSidebarItem({ reminders: store, announcements }: ReminderDeps) {
  return function RemindersSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
    const reminders = useValue(store);
    const now = useReminderClock(reminders, false);
    const announcement = useValue(announcements);
    const toast = useToast();
    // A remount (drawer reopened, view switched) must not replay toasts already shown.
    const shownSeq = useRef(announcement.seq);
    useEffect(() => {
      if (announcement.seq <= shownSeq.current) return;
      shownSeq.current = announcement.seq;
      for (const entry of announcement.entries) toast.show(`Reminder: ${entry.title ?? "a chat"} is waiting for you`, { variant: "info", durationMs: 8000 });
    }, [announcement.seq]);
    const due = dueCount(reminders, now);
    return (
      <SidebarRow
        icon="AlarmClock"
        label={due > 0 ? `Reminders · ${due} due` : "Reminders"}
        active={currentScreen?.screenId === REMINDERS_SCREEN_ID}
        onPress={() => openScreen({ screenId: REMINDERS_SCREEN_ID })}
      />
    );
  };
}

function sorted(reminders: Reminders) {
  return [...reminders.values()].sort((left, right) => left.reminder.at.localeCompare(right.reminder.at));
}

export function createRemindersScreen({ client, reminders: store }: ReminderDeps, settingsOf: () => Settings) {
  return function RemindersScreen({ theme, layout, navigation }: PluginScreenProps) {
    const reminders = useValue(store);
    const now = useReminderClock(reminders, false);
    const toast = useToast();
    const styles = useMemo(
      () => ({
        screen: { padding: layout.compact ? 16 : 24, gap: 16 },
        muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      }),
      [theme, layout.compact],
    );
    const entries = sorted(reminders);
    const due = entries.filter((entry) => isDue(entry.reminder, now));
    const upcoming = entries.filter((entry) => !isDue(entry.reminder, now));
    const support = notificationSupport();
    const done = (agentId: string) =>
      void changeReminder(client, agentId, null, settingsOf()).catch((error: unknown) => toast.error(`Could not mark it done: ${message(error)}`));

    const row = (entry: ReminderEntry) => (
      <SettingsAction
        key={entry.agentId}
        label={entry.title ?? "Untitled chat"}
        hint={formatDue(entry.reminder, now)}
        actionLabel="Done"
        onPress={() => done(entry.agentId)}
      />
    );
    const openRow = (entry: ReminderEntry) =>
      navigation ? (
        <SettingsAction key={`${entry.agentId}-open`} label={`Open ${entry.title ?? "the chat"}`} actionLabel="Open" onPress={() => navigation.openAgent({ agentId: entry.agentId })} />
      ) : null;

    return (
      <View style={styles.screen}>
        <SettingsSection title={due.length ? `Due (${due.length})` : "Due"}>
          {due.length ? <SettingsCard>{due.flatMap((entry) => [row(entry), openRow(entry)])}</SettingsCard> : <Text style={styles.muted}>Nothing is due.</Text>}
        </SettingsSection>
        <SettingsSection title="Coming up">
          {upcoming.length ? (
            <SettingsCard>{upcoming.flatMap((entry) => [row(entry), openRow(entry)])}</SettingsCard>
          ) : (
            <Text style={styles.muted}>Use "Remind me" in a chat's message box, or type /remind 45m.</Text>
          )}
        </SettingsSection>
        {support === "default" && settingsOf().desktopNotification ? (
          <SettingsCard>
            <SettingsAction
              label="Desktop notifications"
              hint="Show reminders even when Paseo is in the background"
              actionLabel="Turn on"
              onPress={() => void requestNotifications()}
            />
          </SettingsCard>
        ) : null}
        {support === "denied" && settingsOf().desktopNotification ? (
          <Text style={styles.muted}>Desktop notifications are blocked for Paseo, so reminders show as toasts and a chime only.</Text>
        ) : null}
      </View>
    );
  };
}

// The row the daemon writes into a chat when its reminder comes due.
export function createReminderRow(client: PluginClientContext, settingsOf: () => Settings) {
  return function ReminderTimelineRow({ agentId, item, theme }: PluginTimelineItemProps<Reminder>) {
    const current = useAgent(agentId, (agent) => readReminder(agent.metadata)?.setAt ?? null);
    const toast = useToast();
    const open = current === item.data.setAt;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
        <Icon name="AlarmClock" size={14} color={open ? theme.colors.statusWarning : theme.colors.foregroundMuted} />
        <Text style={{ color: theme.colors.foreground, fontSize: 13, flexShrink: 1 }}>
          Reminder: you asked to come back to this chat{open ? "" : " (done)"}
        </Text>
        {open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark this reminder done"
            onPress={() => void changeReminder(client, agentId, null, settingsOf()).catch((error: unknown) => toast.error(`Could not mark it done: ${message(error)}`))}
            style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>Done</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };
}
