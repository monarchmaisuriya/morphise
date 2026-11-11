import { nextDueTime, type Reminder } from "../shared/reminders";
import type { TaskDocument } from "../shared/tasks";
import type { ValueStore } from "./profile-store";

// A task reminder this app may alert about.
export interface AlertEntry {
  taskId: string;
  title: string;
  agentId: string | null;
  reminder: Reminder;
}

// Reminders on open tasks: not archived, not in Done.
export function remindersOf(document: TaskDocument): AlertEntry[] {
  const done = document.columns.find((column) => column.done)?.id;
  return document.tasks
    .filter((task) => task.reminder !== null && task.archivedAt === null && task.column !== done)
    .map((task) => ({ taskId: task.id, title: task.title, agentId: task.links.agentId ?? null, reminder: task.reminder! }));
}

// Reminders whose time passed while this app was open, not alerted yet. Ones already due when
// the app opened are listed on the board instead of ringing on every start.
export function dueSince(entries: readonly AlertEntry[], started: Date, now: Date, alerted: Set<string>): AlertEntry[] {
  const due: AlertEntry[] = [];
  for (const entry of entries) {
    const at = Date.parse(entry.reminder.at);
    const key = `${entry.taskId}:${entry.reminder.setAt}`;
    if (at > started.getTime() && at <= now.getTime() && !alerted.has(key)) {
      alerted.add(key);
      due.push(entry);
    }
  }
  return due;
}

export interface AlertSinks {
  chime(): void;
  notify(entry: AlertEntry): void;
  // Shown as toasts by the Tasks sidebar row while it is mounted.
  announce(entries: AlertEntry[]): void;
}

// The app's own reminder clock, running in plugin scope so it needs no mounted component.
export function startReminderAlerts(source: Pick<ValueStore<AlertEntry[]>, "get" | "subscribe">, sinks: AlertSinks, now = () => new Date()) {
  const started = now();
  const alerted = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  // One failing way of alerting (a platform without notifications, say) must not stop the others
  // or the clock; each failure is logged.
  function attempt(what: string, run: () => void) {
    try {
      run();
    } catch (error) {
      console.error(`[morphise] Reminder ${what} failed`, error);
    }
  }

  function check() {
    try {
      const due = dueSince(source.get(), started, now(), alerted);
      if (due.length > 0) {
        attempt("chime", () => sinks.chime());
        due.forEach((entry) => attempt("notification", () => sinks.notify(entry)));
        attempt("toast", () => sinks.announce(due));
      }
    } finally {
      schedule();
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    const next = nextDueTime(source.get().map((entry) => entry.reminder), now());
    // Timers far ahead drift after sleep; re-check at least every minute.
    timer = next ? setTimeout(check, Math.min(next.getTime() - now().getTime() + 50, 60_000)) : null;
  }

  // A change can bring a reminder that is already due (set on another device), so check, not
  // just reschedule.
  const stop = source.subscribe(check);
  check();
  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
}
