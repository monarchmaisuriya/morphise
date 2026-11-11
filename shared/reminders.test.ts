import { describe, expect, it } from "vitest";
import {
  createReminder,
  isDue,
  nextDueTime,
  parseDuration,
  presetTitle,
  readReminder,
  readReminderRow,
  REMINDER_KEY,
  REMINDER_ROW_KEY,
  reminderRowId,
  reminderSchema,
  rowIsWritten,
} from "./reminders";

const now = new Date("2026-11-11T14:30:00Z");

describe("parseDuration", () => {
  it("reads minutes, hours and both, ignoring case and spaces", () => {
    expect(parseDuration("45m")).toEqual({ ok: true, minutes: 45 });
    expect(parseDuration(" 2H ")).toEqual({ ok: true, minutes: 120 });
    expect(parseDuration("1h30m")).toEqual({ ok: true, minutes: 90 });
    expect(parseDuration("90")).toEqual({ ok: true, minutes: 90 });
  });

  it("refuses zero, more than 7 days, and anything that is not a time", () => {
    const refusal = { ok: false, error: "Expected a time such as 45m or 2h, at most 7 days" };
    for (const text of ["0", "0m", "", "soon", "-5m", "10081", "169h", "1.5h"]) expect(parseDuration(text)).toEqual(refusal);
    expect(parseDuration("168h")).toEqual({ ok: true, minutes: 10080 });
  });
});

describe("createReminder", () => {
  it("sets a reminder that many minutes from now", () => {
    expect(createReminder(15, now)).toEqual({ at: "2026-11-11T14:45:00.000Z", setAt: "2026-11-11T14:30:00.000Z" });
  });

  it("refuses a length outside 1 minute to 7 days", () => {
    expect(() => createReminder(0, now)).toThrow("A reminder must be 1 minute to 7 days away");
    expect(() => createReminder(10081, now)).toThrow("A reminder must be 1 minute to 7 days away");
  });
});

describe("reminderSchema", () => {
  it("refuses a reminder due before it was set, or more than 7 days after", () => {
    expect(reminderSchema.safeParse({ at: "2026-11-11T14:00:00.000Z", setAt: "2026-11-11T14:30:00.000Z" }).success).toBe(false);
    expect(reminderSchema.safeParse({ at: "2026-11-19T14:30:00.000Z", setAt: "2026-11-11T14:30:00.000Z" }).success).toBe(false);
    expect(reminderSchema.safeParse(createReminder(60, now)).success).toBe(true);
  });
});

describe("readReminder and readReminderRow", () => {
  it("read their own keys and treat anything malformed as absent", () => {
    const reminder = createReminder(30, now);
    const metadata = { [REMINDER_KEY]: reminder, [REMINDER_ROW_KEY]: reminder.setAt };
    expect(readReminder(metadata)).toEqual(reminder);
    expect(readReminderRow(metadata)).toBe(reminder.setAt);
    expect(readReminder({ [REMINDER_KEY]: { at: "soon" } })).toBeNull();
    expect(readReminder(null)).toBeNull();
    expect(readReminderRow({ [REMINDER_ROW_KEY]: 3 })).toBeNull();
  });
});

describe("isDue and nextDueTime", () => {
  const soon = createReminder(15, now);
  const later = createReminder(60, now);

  it("is due from its time onwards", () => {
    expect(isDue(soon, now)).toBe(false);
    expect(isDue(soon, new Date("2026-11-11T14:45:00Z"))).toBe(true);
  });

  it("gives the earliest time still to come", () => {
    expect(nextDueTime([later, soon], now)).toEqual(new Date(soon.at));
    expect(nextDueTime([soon], new Date("2026-11-11T15:00:00Z"))).toBeNull();
  });
});

describe("rowIsWritten and reminderRowId", () => {
  it("knows a row was written only for this exact reminder", () => {
    const reminder = createReminder(15, now);
    expect(rowIsWritten(reminder, reminder.setAt)).toBe(true);
    expect(rowIsWritten(reminder, "2026-11-10T10:00:00.000Z")).toBe(false);
    expect(rowIsWritten(reminder, null)).toBe(false);
  });

  it("gives each reminder its own row id using only id-safe characters", () => {
    expect(reminderRowId(createReminder(15, now))).toBe(`reminder-${now.getTime()}`);
  });
});

describe("presetTitle", () => {
  it("names a preset in days, hours and minutes", () => {
    expect([1, 15, 60, 90, 180, 1440, 10080].map(presetTitle)).toEqual([
      "1 minute",
      "15 minutes",
      "1 hour",
      "1 hour 30 minutes",
      "3 hours",
      "1 day",
      "7 days",
    ]);
  });
});
