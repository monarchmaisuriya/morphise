import { describe, expect, it } from "vitest";
import { sidebarLook, viewStateSettings } from "./view-state";

const defaults = viewStateSettings.schema.parse({});

describe("sidebarLook", () => {
  it("keeps today's sidebar with the defaults", () => {
    expect(sidebarLook(defaults, "compact", false)).toEqual({ height: 36, textSize: 13, groupGap: 14, rowPad: 8, boldGroups: false, projectIcons: true });
    expect(sidebarLook(defaults, "comfortable", false)).toMatchObject({ height: 40, textSize: 14 });
    expect(sidebarLook(defaults, "compact", true)).toMatchObject({ height: 44 });
  });

  it("adds a spacious row height and lets this device pick text size, group spacing, indent, bold names and folder icons", () => {
    expect(sidebarLook(defaults, "spacious", false)).toMatchObject({ height: 44, textSize: 14 });
    const chosen = viewStateSettings.schema.parse({ textSize: 11, groupSpacing: "xlarge", indent: "wide", boldGroupNames: true, showProjectIcons: false });
    expect(sidebarLook(chosen, "compact", false)).toEqual({ height: 36, textSize: 11, groupGap: 28, rowPad: 16, boldGroups: true, projectIcons: false });
    expect(sidebarLook(viewStateSettings.schema.parse({ groupSpacing: "none", indent: "narrow" }), "compact", false)).toMatchObject({ groupGap: 0, rowPad: 4 });
  });

  it("refuses a text size outside 11 to 15", () => {
    expect(viewStateSettings.schema.safeParse({ textSize: 10 }).success).toBe(false);
    expect(viewStateSettings.schema.safeParse({ textSize: 16 }).success).toBe(false);
  });
});
