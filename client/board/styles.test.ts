import { describe, expect, it } from "vitest";
import { priorityOf } from "./styles";

describe("priorityOf", () => {
  it("gives a task with no priority its own mark, so every row has one in the same place", () => {
    expect(priorityOf(null)).toEqual({ name: "No priority", mark: "outline" });
  });

  it("draws every priority as a short bar in its colour, and no priority as the same bar outlined", () => {
    expect([1, 2, 3, 4, null].map((priority) => priorityOf(priority).mark)).toEqual(["bar", "bar", "bar", "bar", "outline"]);
    expect(priorityOf(1).name).toBe("Urgent");
  });
});
