import { describe, expect, it } from "vitest";
import { priorityOf } from "./styles";

describe("priorityOf", () => {
  it("gives a task with no priority its own mark, so every row has one in the same place", () => {
    expect(priorityOf(null)).toEqual({ name: "No priority", icon: "SignalZero" });
  });

  it("draws every priority from one family of signal bars, from none to full", () => {
    expect([null, 4, 3, 2, 1].map((priority) => priorityOf(priority).icon)).toEqual(["SignalZero", "SignalLow", "SignalMedium", "SignalHigh", "Signal"]);
    expect(priorityOf(1).name).toBe("Urgent");
  });
});
