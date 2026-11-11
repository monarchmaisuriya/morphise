import { isDue, readReminder, readReminderRow, type Reminder, REMINDER_ROW_KEY, reminderRowId, rowIsWritten } from "../shared/reminders";

// Writes one row into a chat when its reminder comes due. The daemon gets a Paseo connection
// only inside handlers, so every app holds the `reminders.keeper` subscription open: while one
// is open, its connection writes the rows; when none is, due rows wait for the next app.

// Paseo's JSON value type is not part of the plugin SDK, so it is declared here.
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface AgentEntry {
  id: string;
  metadata?: unknown;
  archivedAt?: string | null;
}

export interface KeeperPaseo {
  agents: {
    list(): Promise<{ entries: readonly { agent: AgentEntry }[] }>;
    ref(agentId: string): {
      refresh(): Promise<{ agent: { metadata?: unknown } } | null>;
      setMetadata(patch: Record<string, JsonValue>): Promise<void>;
      timeline: { append(item: { type: "plugin"; id: string; kind: string; version: number; data: JsonValue }): Promise<unknown> };
    };
  };
}

interface Clock {
  now(): Date;
  setTimer(run: () => void, delay: number): unknown;
  clearTimer(id: unknown): void;
}

const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
  setTimer: (run, delay) => setTimeout(run, delay),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createReminderKeeper(clock: Clock = SYSTEM_CLOCK) {
  const connections = new Set<KeeperPaseo>();
  const timers = new Map<string, { setAt: string; id: unknown }>();

  const report = (agentId: string) => (error: unknown) => console.error(`[morphise] Reminder row for chat ${agentId} failed`, error);

  function cancel(agentId: string) {
    const timer = timers.get(agentId);
    if (timer) clock.clearTimer(timer.id);
    timers.delete(agentId);
  }

  // Arms, re-arms or drops the timer for one chat, given its current metadata.
  function track(agentId: string, metadata: unknown) {
    const reminder = readReminder(metadata);
    if (!reminder || rowIsWritten(reminder, readReminderRow(metadata))) return cancel(agentId);
    if (timers.get(agentId)?.setAt === reminder.setAt) return;
    cancel(agentId);
    const delay = Math.max(0, Date.parse(reminder.at) - clock.now().getTime());
    const id = clock.setTimer(() => {
      timers.delete(agentId);
      void fire(agentId, reminder).catch(report(agentId));
    }, delay);
    timers.set(agentId, { setAt: reminder.setAt, id });
  }

  async function fire(agentId: string, armed: Reminder) {
    const [paseo] = connections;
    if (!paseo) return; // The next app to connect catches up.
    const chat = paseo.agents.ref(agentId);
    const metadata = (await chat.refresh())?.agent.metadata;
    const reminder = readReminder(metadata);
    // Done, or replaced by a newer reminder, since the timer was armed.
    if (!reminder || reminder.setAt !== armed.setAt || !isDue(reminder, clock.now())) return track(agentId, metadata);
    if (rowIsWritten(reminder, readReminderRow(metadata))) return;
    await chat.timeline.append({ type: "plugin", id: reminderRowId(reminder), kind: "reminder", version: 1, data: reminder });
    await chat.setMetadata({ [REMINDER_ROW_KEY]: reminder.setAt });
  }

  async function sync(paseo: KeeperPaseo) {
    const { entries } = await paseo.agents.list();
    for (const { agent } of entries) {
      if (agent.archivedAt) cancel(agent.id);
      else track(agent.id, agent.metadata);
    }
  }

  return {
    // The `reminders.keeper` subscription: open while an app is connected.
    watch(_input: unknown, { paseo, signal }: { paseo: KeeperPaseo; signal: AbortSignal; push(event: unknown): Promise<void> }) {
      connections.add(paseo);
      signal.addEventListener("abort", () => connections.delete(paseo), { once: true });
      void sync(paseo).catch((error: unknown) => console.error("[morphise] Could not read chat reminders", error));
    },
    // Called by an app right after it sets or clears a reminder.
    async arm({ agentId }: { agentId: string }, { paseo }: { paseo: KeeperPaseo }) {
      const current = await paseo.agents.ref(agentId).refresh();
      track(agentId, current?.agent.metadata);
      return {};
    },
    dispose() {
      for (const agentId of [...timers.keys()]) cancel(agentId);
      connections.clear();
    },
  };
}
