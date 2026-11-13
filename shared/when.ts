// Plain-language times for reminders and due dates, in the device's local time.

export const WHEN_ERROR = "Expected a time such as 45m, 17:30 or tomorrow 9am";

const MINUTE = 60_000;
const DAY_START = { hours: 9, minutes: 0 };

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const DURATION = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/;
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;

type Clock = { hours: number; minutes: number };

function readClock(text: string): Clock | null {
  const match = CLOCK.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "pm" ? 12 : 0);
  } else if (match[2] === undefined || hours > 23) {
    // "5" alone is a number of minutes, not a clock time.
    return null;
  }
  return { hours, minutes };
}

function onDay(now: Date, daysAhead: number, clock: Clock): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + daysAhead);
  date.setHours(clock.hours, clock.minutes, 0, 0);
  return date;
}

// The day word ("today", "tomorrow", a weekday) as days ahead of today, or null.
function readDay(word: string, now: Date): number | null {
  if (word === "today") return 0;
  if (word === "tomorrow") return 1;
  const weekday = WEEKDAYS[word];
  if (weekday === undefined) return null;
  // The coming one; on the same weekday, a week ahead.
  return (weekday - now.getDay() + 7) % 7 || 7;
}

export function parseWhen(input: string, now: Date): { ok: true; at: Date } | { ok: false; error: string } {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/^in /, "");
  const fail = { ok: false as const, error: WHEN_ERROR };
  if (text === "") return fail;
  const result = (at: Date | null) => (at && at.getTime() > now.getTime() ? { ok: true as const, at } : fail);

  if (/^\d+$/.test(text)) return Number(text) > 0 ? result(new Date(now.getTime() + Number(text) * MINUTE)) : fail;
  const duration = DURATION.exec(text);
  if (duration && (duration[1] !== undefined || duration[2] !== undefined)) {
    const minutes = Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0);
    return minutes > 0 ? result(new Date(now.getTime() + minutes * MINUTE)) : fail;
  }

  const clock = readClock(text);
  if (clock) {
    const today = onDay(now, 0, clock);
    return result(today.getTime() > now.getTime() ? today : onDay(now, 1, clock));
  }

  const [first, ...rest] = text.split(" ");
  const days = readDay(first, now);
  if (days === null) return fail;
  if (rest.length === 0) return days === 0 ? fail : result(onDay(now, days, DAY_START));
  const time = readClock(rest.join(" "));
  if (!time) return fail;
  // Today's own weekday with a time still ahead is today; once that time has passed, next week.
  const today = onDay(now, 0, time);
  return result(WEEKDAYS[first] === now.getDay() && today.getTime() > now.getTime() ? today : onDay(now, days, time));
}

const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// A due date as "YYYY-MM-DD" in local time: today, tomorrow, a weekday, or an ISO date.
export function parseDueDate(input: string, now: Date): string | null {
  const text = input.trim().toLowerCase();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isoDate(date) === text ? text : null;
  }
  const days = readDay(text, now);
  if (days === null) return null;
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function todayDate(now: Date): string {
  return isoDate(now);
}
