import { describe, expect, it } from "vitest";
import { profileSchema } from "../../shared/profile";
import { VIEW_SECTIONS } from "./view-sections";

describe("VIEW_SECTIONS", () => {
  it("puts every sidebar view setting in exactly one settings section", () => {
    const placed = Object.values(VIEW_SECTIONS).flat();
    const keys = Object.keys(profileSchema.shape.sidebar.unwrap().shape.view.unwrap().shape);
    expect([...placed].sort()).toEqual([...keys].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });
});
