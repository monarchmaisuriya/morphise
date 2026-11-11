import { nextDueTime, presetTitle } from "../shared/reminders";
import type { ValueStore } from "./profile-store";
import type { ReminderEntry, Reminders } from "./reminders";

// Reminders whose due time passed while this app was open, not alerted yet. Reminders that were
// already due when the app opened are listed in the sidebar instead of ringing on every start.
export function dueSince(reminders: Reminders, started: Date, now: Date, alerted: Set<string>): ReminderEntry[] {
  const due: ReminderEntry[] = [];
  for (const entry of reminders.values()) {
    const at = Date.parse(entry.reminder.at);
    const key = `${entry.agentId}:${entry.reminder.setAt}`;
    if (at > started.getTime() && at <= now.getTime() && !alerted.has(key)) {
      alerted.add(key);
      due.push(entry);
    }
  }
  return due;
}

export interface AlertSinks {
  chime(): void;
  notify(entry: ReminderEntry): void;
  // Shown as toasts by the Reminders sidebar row while it is mounted.
  announce(entries: ReminderEntry[]): void;
}

// The app's own reminder clock, running in plugin scope so it needs no mounted component.
export function startReminderAlerts(store: ValueStore<Reminders>, sinks: AlertSinks, now = () => new Date()) {
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
      const due = dueSince(store.get(), started, now(), alerted);
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
    const next = nextDueTime([...store.get().values()].map((entry) => entry.reminder), now());
    // Timers far ahead drift after sleep; re-check at least every minute.
    timer = next ? setTimeout(check, Math.min(next.getTime() - now().getTime() + 50, 60_000)) : null;
  }

  // A change can bring a reminder that is already due (set on another device), so check, not
  // just reschedule.
  const stop = store.subscribe(check);
  check();
  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
}

export function reminderBody(entry: ReminderEntry, setMinutesAgo: number): string {
  return `${entry.title ?? "A chat"}: you asked to come back${setMinutesAgo > 0 ? ` (set ${presetTitle(setMinutesAgo)} ago)` : ""}`;
}
