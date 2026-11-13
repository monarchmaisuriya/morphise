import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDueDate, parseWhen } from "./when";

const zone = process.env.TZ;
beforeAll(() => void (process.env.TZ = "Europe/London"));
afterAll(() => void (process.env.TZ = zone));

const now = new Date("2026-11-11T14:30:00Z"); // Wednesday 14:30 in London
const at = (text: string) => {
  const result = parseWhen(text, now);
  return result.ok ? result.at.toISOString() : result.error;
};

describe("parseWhen", () => {
  it("reads lengths of time", () => {
    expect(at("45m")).toBe("2026-11-11T15:15:00.000Z");
    expect(at("2h")).toBe("2026-11-11T16:30:00.000Z");
    expect(at("1h30m")).toBe("2026-11-11T16:00:00.000Z");
    expect(at("in 20 min")).toBe("2026-11-11T14:50:00.000Z");
  });

  it("reads clock times today, or tomorrow when already past", () => {
    expect(at("17:30")).toBe("2026-11-11T17:30:00.000Z");
    expect(at("5pm")).toBe("2026-11-11T17:00:00.000Z");
    expect(at("5:15pm")).toBe("2026-11-11T17:15:00.000Z");
    expect(at("9am")).toBe("2026-11-12T09:00:00.000Z");
    expect(at("today 18:00")).toBe("2026-11-11T18:00:00.000Z");
  });

  it("reads tomorrow and weekdays, at 9:00 unless a time is given", () => {
    expect(at("tomorrow")).toBe("2026-11-12T09:00:00.000Z");
    expect(at("Tomorrow 17:30")).toBe("2026-11-12T17:30:00.000Z");
    expect(at("fri")).toBe("2026-11-13T09:00:00.000Z");
    expect(at("monday 2pm")).toBe("2026-11-16T14:00:00.000Z");
    expect(at("wed")).toBe("2026-11-18T09:00:00.000Z");
  });

  it("reads today's weekday as today while its time is ahead, and as next week once it has passed or without a time", () => {
    const monday = new Date("2026-11-16T10:00:00Z"); // Monday 10:00 in London
    const on = (text: string) => {
      const result = parseWhen(text, monday);
      return result.ok ? result.at.toISOString() : result.error;
    };
    expect(on("mon 5pm")).toBe("2026-11-16T17:00:00.000Z");
    expect(on("Monday 10:01")).toBe("2026-11-16T10:01:00.000Z");
    expect(on("mon 10:00")).toBe("2026-11-23T10:00:00.000Z");
    expect(on("mon 9am")).toBe("2026-11-23T09:00:00.000Z");
    expect(on("mon")).toBe("2026-11-23T09:00:00.000Z");
    expect(at("wed 5pm")).toBe("2026-11-11T17:00:00.000Z");
    expect(parseDueDate("mon", monday)).toBe("2026-11-23");
  });

  it("refuses anything it does not understand or that is not in the future", () => {
    const error = "Expected a time such as 45m, 17:30 or tomorrow 9am";
    for (const text of ["", "soon", "0m", "25:00", "13pm", "today 9am"]) expect(at(text)).toBe(error);
  });
});

describe("parseDueDate", () => {
  it("reads day names, relative days and ISO dates as a local date", () => {
    expect(parseDueDate("today", now)).toBe("2026-11-11");
    expect(parseDueDate("tomorrow", now)).toBe("2026-11-12");
    expect(parseDueDate("fri", now)).toBe("2026-11-13");
    expect(parseDueDate("2026-12-01", now)).toBe("2026-12-01");
    expect(parseDueDate("someday", now)).toBeNull();
    expect(parseDueDate("2026-02-30", now)).toBeNull();
  });
});
