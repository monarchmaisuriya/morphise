import { isDue, readReminderRow, readReminderRows, REMINDER_ROWS_KEY, rowIsWritten } from "../shared/reminders";
import type { Task, TaskDocument } from "../shared/tasks";
import type { WatchableSettings } from "./settings-watch";

// Writes one row into a chat when a task linked to it comes due. The daemon watches the task
// settings itself, but it gets a Paseo connection only inside handlers, so every app holds the
// `reminders.keeper` subscription open: while one is open, its connection writes the rows; due
// rows wait for the next app otherwise. The daemon writes only the chat's `morphise.reminderRows`
// key (task id to setAt, one entry per task so several tasks of one chat each get one row), never
// the task document.

// Paseo's JSON value type is not part of the plugin SDK, so it is declared here.
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface KeeperPaseo {
  agents: {
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

// Tasks whose reminder should write a chat row: linked to a chat, open, not done.
function remindable(document: TaskDocument): Task[] {
  const done = document.columns.find((column) => column.done)?.id;
  return document.tasks.filter((task) => task.reminder !== null && task.links.agentId && task.archivedAt === null && task.column !== done);
}

export function createTaskKeeper(settings: WatchableSettings<TaskDocument>, clock: Clock = SYSTEM_CLOCK) {
  const connections = new Set<KeeperPaseo>();
  const timers = new Map<string, { setAt: string; id: unknown }>();
  let stopped = false;
  // Row writes run one at a time: each reads and rewrites the chat's marker map, and two at once
  // would drop one another's entry.
  let writes: Promise<void> = Promise.resolve();

  const report = (what: string) => (error: unknown) => console.error(`[morphise] ${what}`, error);

  function cancel(taskId: string) {
    const timer = timers.get(taskId);
    if (timer) clock.clearTimer(timer.id);
    timers.delete(taskId);
  }

  function sync(document: TaskDocument) {
    if (stopped) return;
    const tasks = remindable(document);
    const ids = new Set(tasks.map((task) => task.id));
    for (const taskId of [...timers.keys()]) if (!ids.has(taskId)) cancel(taskId);
    for (const task of tasks) {
      const reminder = task.reminder!;
      if (timers.get(task.id)?.setAt === reminder.setAt) continue;
      cancel(task.id);
      const delay = Math.max(0, Date.parse(reminder.at) - clock.now().getTime());
      const id = clock.setTimer(() => {
        timers.delete(task.id);
        writes = writes.then(() => fire(task.id, reminder.setAt).catch(report(`Reminder row for task ${task.id} failed`)));
      }, delay);
      timers.set(task.id, { setAt: reminder.setAt, id });
    }
  }

  async function latest(): Promise<TaskDocument | null> {
    const state = await settings.read();
    return state.status === "ready" ? state.values : null;
  }

  async function fire(taskId: string, armedSetAt: string) {
    const [paseo] = connections;
    if (!paseo) return; // The next app to connect re-syncs, and this fires then.
    const document = await latest();
    if (!document) return;
    const task = remindable(document).find((item) => item.id === taskId);
    // Done, archived, unlinked, or given another reminder since the timer was armed.
    if (!task || task.reminder!.setAt !== armedSetAt) return sync(document);
    if (!isDue(task.reminder!, clock.now())) return sync(document);
    const agentId = task.links.agentId!;
    const chat = paseo.agents.ref(agentId);
    const metadata = (await chat.refresh())?.agent.metadata;
    const rows = readReminderRows(metadata);
    if (rows[task.id] === task.reminder!.setAt) return;
    // A reminder moved from 0.2 keeps its setAt, so 0.2's marker says its row is already there.
    if (rowIsWritten(task.reminder!, readReminderRow(metadata))) return;
    const { at, setAt, note } = task.reminder!;
    await chat.timeline.append({
      type: "plugin",
      id: `reminder-${task.id}-${Date.parse(setAt)}`,
      kind: "reminder",
      version: 1,
      data: { taskId: task.id, title: task.title, at, setAt, ...(note ? { note } : {}) },
    });
    // Entries for tasks no longer linked to this chat are dropped, so the key stays small.
    const linked = new Set(document.tasks.filter((item) => item.links.agentId === agentId).map((item) => item.id));
    const kept = Object.fromEntries(Object.entries(rows).filter(([taskId]) => linked.has(taskId)));
    await chat.setMetadata({ [REMINDER_ROWS_KEY]: { ...kept, [task.id]: setAt } });
  }

  const resync = () => void latest().then((document) => document && sync(document), report("Could not read tasks"));
  const stopWatching = settings.subscribe((state) => {
    if (state.status === "ready") sync(state.values);
  });
  resync();

  return {
    // The `reminders.keeper` subscription: open while an app is connected.
    watch(_input: unknown, { paseo, signal }: { paseo: KeeperPaseo; signal: AbortSignal }) {
      connections.add(paseo);
      signal.addEventListener("abort", () => connections.delete(paseo), { once: true });
      // Rows that came due while no app was connected fire now.
      for (const taskId of [...timers.keys()]) cancel(taskId);
      resync();
    },
    dispose() {
      stopped = true;
      stopWatching();
      for (const taskId of [...timers.keys()]) cancel(taskId);
      connections.clear();
    },
  };
}
