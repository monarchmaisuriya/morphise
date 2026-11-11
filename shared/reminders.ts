import { z } from "zod";
import { MAX_REMINDER_MINUTES } from "./profile";

// Morphise 0.2 kept a chat's reminder on the chat (agent metadata `REMINDER_KEY`) and marked the
// one whose chat row it wrote in `REMINDER_ROW_KEY` (its setAt). 0.3 keeps reminders on tasks; the
// daemon marks rows it wrote in `REMINDER_ROWS_KEY`, task id to setAt, and only it writes that key.
// Top-level metadata keys replace independently, so writers of different keys cannot undo each other.
export const REMINDER_KEY = "morphise.reminder";
export const REMINDER_ROW_KEY = "morphise.reminderRow";
export const REMINDER_ROWS_KEY = "morphise.reminderRows";

const MINUTE = 60_000;

export const MAX_NOTE_LENGTH = 200;

export const reminderSchema = z
  .strictObject({
    at: z.iso.datetime(),
    setAt: z.iso.datetime(),
    // What to do when it is due, shown with the reminder.
    note: z.string().max(MAX_NOTE_LENGTH, `A note can be at most ${MAX_NOTE_LENGTH} characters`).optional(),
  })
  .refine(({ at, setAt }) => Date.parse(at) > Date.parse(setAt), { message: "A reminder must be due after it was set" })
  .refine(({ at, setAt }) => Date.parse(at) - Date.parse(setAt) <= MAX_REMINDER_MINUTES * MINUTE, {
    message: "A reminder can be at most 7 days away",
  });

export type Reminder = z.infer<typeof reminderSchema>;

// A reminder at a chosen time, 1 minute to 7 days from now, with an optional note.
export function reminderAt(at: Date, now: Date, note?: string): Reminder {
  const minutes = (at.getTime() - now.getTime()) / MINUTE;
  if (!(minutes >= 1) || minutes > MAX_REMINDER_MINUTES) throw new Error("A reminder must be 1 minute to 7 days away");
  const text = note?.trim();
  if (text && text.length > MAX_NOTE_LENGTH) throw new Error(`A note can be at most ${MAX_NOTE_LENGTH} characters`);
  return { at: at.toISOString(), setAt: now.toISOString(), ...(text ? { note: text } : {}) };
}

export function createReminder(minutes: number, now: Date): Reminder {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_REMINDER_MINUTES) {
    throw new Error("A reminder must be 1 minute to 7 days away");
  }
  return { at: new Date(now.getTime() + minutes * MINUTE).toISOString(), setAt: now.toISOString() };
}

const DURATION_ERROR = "Expected a time such as 45m or 2h, at most 7 days";

// "45m", "2h", "1h30m" or a bare number of minutes.
export function parseDuration(text: string): { ok: true; minutes: number } | { ok: false; error: string } {
  const match = /^(?:(\d+)h)?(?:(\d+)m?)?$/i.exec(text.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return { ok: false, error: DURATION_ERROR };
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  if (minutes < 1 || minutes > MAX_REMINDER_MINUTES) return { ok: false, error: DURATION_ERROR };
  return { ok: true, minutes };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// Metadata is shared with other plugins and versions; a value this version cannot read is
// treated as no reminder rather than trusted.
export function readReminder(metadata: unknown): Reminder | null {
  const result = reminderSchema.safeParse(record(metadata)?.[REMINDER_KEY]);
  return result.success ? result.data : null;
}

export function readReminderRow(metadata: unknown): string | null {
  const value = record(metadata)?.[REMINDER_ROW_KEY];
  return typeof value === "string" ? value : null;
}

// Task id to the setAt of the reminder whose row was written; entries this version cannot read
// are dropped.
export function readReminderRows(metadata: unknown): Record<string, string> {
  const value = record(record(metadata)?.[REMINDER_ROWS_KEY]);
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function isDue(reminder: Reminder, now: Date): boolean {
  return Date.parse(reminder.at) <= now.getTime();
}

export function nextDueTime(reminders: Iterable<Reminder>, now: Date): Date | null {
  let next: number | null = null;
  for (const reminder of reminders) {
    const time = Date.parse(reminder.at);
    if (time > now.getTime() && (next === null || time < next)) next = time;
  }
  return next === null ? null : new Date(next);
}

export function rowIsWritten(reminder: Reminder, row: string | null): boolean {
  return row === reminder.setAt;
}

// One chat row per reminder; appending the same id again replaces that row in place.
export function reminderRowId(reminder: Reminder): string {
  return `reminder-${Date.parse(reminder.setAt)}`;
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

export function presetTitle(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days ? plural(days, "day") : "", hours ? plural(hours, "hour") : "", rest ? plural(rest, "minute") : ""]
    .filter(Boolean)
    .join(" ");
}
