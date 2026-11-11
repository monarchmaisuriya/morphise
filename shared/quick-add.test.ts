import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quick-add";
import { EMPTY_TASKS } from "./tasks";

const zone = process.env.TZ;
beforeAll(() => void (process.env.TZ = "Europe/London"));
afterAll(() => void (process.env.TZ = zone));
const now = new Date("2026-11-11T14:30:00.000Z");

describe("parseQuickAdd", () => {
  it("reads priority, labels, column, due date and a reminder time from the end", () => {
    expect(parseQuickAdd("Fix login p1 @bug @ui #review due:fri tomorrow 9am", EMPTY_TASKS, now)).toEqual({
      title: "Fix login",
      priority: 1,
      labelNames: ["bug", "ui"],
      column: "review",
      due: "2026-11-13",
      reminderAt: new Date("2026-11-12T09:00:00.000Z"),
      problems: [],
    });
  });

  it("keeps ordinary words and numbers in the title", () => {
    expect(parseQuickAdd("Fix 2 bugs in p1 parser", EMPTY_TASKS, now)).toMatchObject({ title: "Fix 2 bugs in parser", priority: 1, reminderAt: null });
  });

  it("reports what it could not use instead of guessing", () => {
    expect(parseQuickAdd("Ship #nowhere due:someday", EMPTY_TASKS, now)).toMatchObject({
      title: "Ship",
      column: null,
      due: null,
      problems: ['No column named "nowhere"', 'Could not read the due date "someday"'],
    });
  });

  it("needs a title", () => {
    expect(parseQuickAdd("p2 tomorrow", EMPTY_TASKS, now).problems).toContain("A task needs a title");
  });
});
