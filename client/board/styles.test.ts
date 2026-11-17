import { describe, expect, it } from "vitest";
import { priorityOf } from "./styles";

describe("priorityOf", () => {
  it("gives a task with no priority its own mark, so every row has one in the same place", () => {
    expect(priorityOf(null)).toEqual({ name: "No priority", icon: "FlagOff" });
  });

  it("draws every priority as the same flag, its colour telling them apart, and no priority as a struck-out flag", () => {
    expect([null, 4, 3, 2, 1].map((priority) => priorityOf(priority).icon)).toEqual(["FlagOff", "Flag", "Flag", "Flag", "Flag"]);
    expect(priorityOf(1).name).toBe("Urgent");
  });
});
