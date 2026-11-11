import { useEffect, useState } from "react";
import { nextDueTime, type Reminder } from "../shared/reminders";

const MINUTE = 60_000;

// The current time for components that show reminder and status times. Redraws at the next due
// time, and every minute while anything shown counts down or up.
export function useReminderClock(reminders: readonly Reminder[], everyMinute: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  const key = reminders.map((reminder) => reminder.at).join(",");
  useEffect(() => {
    const due = nextDueTime(reminders, now);
    const ticking = everyMinute || reminders.length > 0;
    const delays = [due ? due.getTime() - now.getTime() + 50 : null, ticking ? MINUTE : null].filter((delay) => delay !== null);
    if (delays.length === 0) return;
    const timer = setTimeout(() => setNow(new Date()), Math.min(...delays));
    return () => clearTimeout(timer);
  }, [key, everyMinute, now]);
  return now;
}
