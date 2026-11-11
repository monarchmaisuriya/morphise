import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDue, formatElapsed } from "./time-text";

const zone = process.env.TZ;
beforeAll(() => void (process.env.TZ = "Europe/London"));
afterAll(() => void (process.env.TZ = zone));

const now = new Date("2026-11-11T14:30:00Z"); // Wednesday 14:30 in London

describe("formatElapsed", () => {
  it("shows how long a workspace has been in its status, in the largest whole unit", () => {
    expect(formatElapsed("2026-11-11T14:29:40Z", now)).toBe("now");
    expect(formatElapsed("2026-11-11T14:05:00Z", now)).toBe("25m");
    expect(formatElapsed("2026-11-11T11:30:00Z", now)).toBe("3h");
    expect(formatElapsed("2026-11-08T14:30:00Z", now)).toBe("3d");
  });

  it("shows nothing without a start time", () => {
    expect(formatElapsed(null, now)).toBeNull();
  });
});

describe("formatDue", () => {
  const due = (at: string) => ({ at, setAt: "2026-11-11T14:00:00.000Z" });

  it("counts down to a reminder today, then names the day or date", () => {
    expect(formatDue(due("2026-11-11T14:55:00Z"), now)).toBe("in 25m");
    expect(formatDue(due("2026-11-11T17:05:00Z"), now)).toBe("in 2h 35m");
    expect(formatDue(due("2026-11-12T09:00:00Z"), now)).toBe("Thu 09:00");
    expect(formatDue(due("2026-11-30T09:00:00Z"), now)).toBe("30 Nov 09:00");
  });

  it("says how long ago a reminder became due", () => {
    expect(formatDue(due("2026-11-11T14:30:00Z"), now)).toBe("due now");
    expect(formatDue(due("2026-11-11T14:20:00Z"), now)).toBe("due 10m ago");
    expect(formatDue(due("2026-11-11T11:30:00Z"), now)).toBe("due 3h ago");
  });
});
