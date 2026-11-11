import { readReminder, type Reminder } from "../shared/reminders";

// Morphise 0.2 kept a chat's reminder on the chat itself (agent metadata). 0.3 keeps reminders
// on tasks; this finds the old ones so each app can move them onto the board once.

export interface LegacyReminder {
  agentId: string;
  workspaceId: string | null;
  title: string;
  reminder: Reminder;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function legacyReminders(entries: readonly { agent: unknown }[]): LegacyReminder[] {
  return entries.flatMap(({ agent: value }) => {
    const agent = record(value);
    const reminder = readReminder(agent?.metadata);
    if (!agent || typeof agent.id !== "string" || !reminder) return [];
    const title = typeof agent.title === "string" ? agent.title : typeof agent.provider === "string" ? agent.provider : "Chat";
    return [{ agentId: agent.id, workspaceId: typeof agent.workspaceId === "string" ? agent.workspaceId : null, title, reminder }];
  });
}
