import { useEffect, useState } from "react";
import { nextDueTime } from "../shared/reminders";
import type { Reminders } from "./reminders";

const MINUTE = 60_000;

// The current time for components that show reminder and status times. Redraws at the next due
// time, and every minute while anything shown counts down or up.
export function useReminderClock(reminders: Reminders, everyMinute: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const due = nextDueTime([...reminders.values()].map((entry) => entry.reminder), now);
    const ticking = everyMinute || reminders.size > 0;
    const delays = [due ? due.getTime() - now.getTime() + 50 : null, ticking ? MINUTE : null].filter((delay) => delay !== null);
    if (delays.length === 0) return;
    const timer = setTimeout(() => setNow(new Date()), Math.min(...delays));
    return () => clearTimeout(timer);
  }, [reminders, everyMinute, now]);
  return now;
}
