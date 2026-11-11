import type { Reminder } from "./reminders";

// Plain formatting without Intl, which React Native's engine supports only in part.

const MINUTE = 60_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (value: number) => String(value).padStart(2, "0");
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const localDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function formatElapsed(since: string | null, now: Date): string | null {
  if (since === null) return null;
  const minutes = Math.floor((now.getTime() - Date.parse(since)) / MINUTE);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

// "in 25m" today, "Thu 09:00" this week, "30 Nov 09:00" later; "due 10m ago" once due.
export function formatDue(reminder: Reminder, now: Date): string {
  const at = new Date(reminder.at);
  if (at.getTime() <= now.getTime()) {
    const elapsed = formatElapsed(reminder.at, now);
    return elapsed === "now" ? "due now" : `due ${elapsed} ago`;
  }
  const daysAhead = Math.round((localDay(at) - localDay(now)) / (24 * 60 * MINUTE));
  if (daysAhead === 0) {
    const minutes = Math.ceil((at.getTime() - now.getTime()) / MINUTE);
    return minutes < 60 ? `in ${minutes}m` : `in ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  }
  if (daysAhead < 7) return `${DAYS[at.getDay()]} ${clock(at)}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${clock(at)}`;
}
