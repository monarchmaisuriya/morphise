import { describe, expect, it } from "vitest";
import { priorityOf } from "./styles";

describe("priorityOf", () => {
  it("gives a task with no priority its own mark, so every row has one in the same place", () => {
    expect(priorityOf(null)).toEqual({ name: "No priority", icon: "Minus" });
  });

  it("gives each priority its name and icon", () => {
    expect(priorityOf(1)).toEqual({ name: "Urgent", icon: "CircleAlert" });
    expect(priorityOf(4)).toEqual({ name: "Low", icon: "SignalLow" });
  });
});
