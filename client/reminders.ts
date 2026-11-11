import type { PaseoAgentHandle } from "@getpaseo/client";
import { createReminder, readReminder, REMINDER_KEY, type Reminder } from "../shared/reminders";

// Which chats have a reminder, kept from the SDK's agent list subscription (where plugin
// clients see agent metadata).

export interface ReminderEntry {
  agentId: string;
  workspaceId: string | null;
  title: string | null;
  reminder: Reminder;
}

export type Reminders = ReadonlyMap<string, ReminderEntry>;

type Change = { snapshot: readonly { agent: unknown }[] } | { message: { type: string; payload?: unknown } };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function entryOf(value: unknown): { agentId: string; entry: ReminderEntry | null } | null {
  const agent = record(value);
  if (typeof agent?.id !== "string") return null;
  const reminder = agent.archivedAt ? null : readReminder(agent.metadata);
  if (!reminder) return { agentId: agent.id, entry: null };
  return {
    agentId: agent.id,
    entry: {
      agentId: agent.id,
      workspaceId: typeof agent.workspaceId === "string" ? agent.workspaceId : null,
      title: typeof agent.title === "string" ? agent.title : null,
      reminder,
    },
  };
}

export function reduceReminders(current: Reminders, change: Change): Reminders {
  if ("snapshot" in change) {
    const next = new Map<string, ReminderEntry>();
    for (const { agent } of change.snapshot) {
      const found = entryOf(agent);
      if (found?.entry) next.set(found.agentId, found.entry);
    }
    return next;
  }
  if (change.message.type !== "agent_update") return current;
  const payload = record(change.message.payload);
  if (payload?.kind === "upsert") {
    const found = entryOf(payload.agent);
    if (!found) return current;
    if (JSON.stringify(current.get(found.agentId) ?? null) === JSON.stringify(found.entry)) return current;
    const next = new Map(current);
    if (found.entry) next.set(found.agentId, found.entry);
    else next.delete(found.agentId);
    return next;
  }
  if (payload?.kind === "remove" && typeof payload.agentId === "string" && current.has(payload.agentId)) {
    const next = new Map(current);
    next.delete(payload.agentId);
    return next;
  }
  return current;
}

type MetadataWriter = Pick<PaseoAgentHandle, "setMetadata">;

export function setReminder(chat: MetadataWriter, minutes: number, now = new Date()) {
  return chat.setMetadata({ [REMINDER_KEY]: createReminder(minutes, now) });
}

export function clearReminder(chat: MetadataWriter) {
  return chat.setMetadata({ [REMINDER_KEY]: null });
}
