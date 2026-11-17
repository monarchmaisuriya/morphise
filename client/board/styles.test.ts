import { describe, expect, it } from "vitest";
import { priorityOf } from "./styles";

describe("priorityOf", () => {
  it("gives a task with no priority its own mark, so every row has one in the same place", () => {
    expect(priorityOf(null)).toEqual({ name: "No priority", mark: "dashed" });
  });

  it("draws every priority as one dot: solid for Urgent, High and Medium, hollow for Low, dashed for none", () => {
    expect([1, 2, 3, 4, null].map((priority) => priorityOf(priority).mark)).toEqual(["solid", "solid", "solid", "hollow", "dashed"]);
    expect(priorityOf(1).name).toBe("Urgent");
  });
});
