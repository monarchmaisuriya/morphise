import { describe, expect, it } from "vitest";
import { sidebarLook, viewStateSettings } from "./view-state";

const defaults = viewStateSettings.schema.parse({});

describe("sidebarLook", () => {
  it("keeps today's sidebar with the defaults", () => {
    expect(sidebarLook(defaults, "compact", false)).toEqual({ height: 36, childHeight: 28, textSize: 13, groupGap: 14, rowPad: 8, boldGroups: false, projectIcons: true, branchLines: true, branchRadius: 6, branchMark: "dashed" });
    expect(sidebarLook(defaults, "comfortable", false)).toMatchObject({ height: 40, childHeight: 32, textSize: 14 });
    expect(sidebarLook(defaults, "compact", true)).toMatchObject({ height: 44, childHeight: 40 });
  });

  it("adds a spacious row height and lets this device pick text size, group spacing, indent, bold names and folder icons", () => {
    expect(sidebarLook(defaults, "spacious", false)).toMatchObject({ height: 44, textSize: 14 });
    const chosen = viewStateSettings.schema.parse({ textSize: 11, groupSpacing: "xlarge", indent: "wide", boldGroupNames: true, showProjectIcons: false });
    expect(sidebarLook(chosen, "compact", false)).toEqual({ height: 36, childHeight: 28, textSize: 11, groupGap: 28, rowPad: 16, boldGroups: true, projectIcons: false, branchLines: true, branchRadius: 6, branchMark: "dashed" });
    expect(sidebarLook(viewStateSettings.schema.parse({ groupSpacing: "none", indent: "narrow" }), "compact", false)).toMatchObject({ groupGap: 0, rowPad: 4 });
  });

  it("refuses a text size outside 11 to 15", () => {
    expect(viewStateSettings.schema.safeParse({ textSize: 10 }).success).toBe(false);
    expect(viewStateSettings.schema.safeParse({ textSize: 16 }).success).toBe(false);
  });
});

describe("the sidebar's branch lines", () => {
  it("are on, with rounded corners, for settings saved before these options existed", () => {
    const saved = viewStateSettings.schema.parse({ collapsed: [], textSize: null, groupSpacing: "medium", indent: "normal", boldGroupNames: false, showProjectIcons: true, viewShown: true });
    expect([saved.branchLines, saved.branchCorners]).toEqual([true, "rounded"]);
  });
  it("accept only on or off, and rounded or square", () => {
    expect(viewStateSettings.schema.safeParse({ branchLines: "yes" }).success).toBe(false);
    expect(viewStateSettings.schema.safeParse({ branchCorners: "curved" }).success).toBe(false);
  });
  it("turn into the look: shown or not, and a 6px or square last corner", () => {
    expect(sidebarLook(defaults, "compact", false)).toMatchObject({ branchLines: true, branchRadius: 6 });
    expect(sidebarLook(viewStateSettings.schema.parse({ branchLines: false, branchCorners: "square" }), "compact", false)).toMatchObject({ branchLines: false, branchRadius: 0 });
  });
});

describe("the mark on chat and sub-agent rows", () => {
  it("is a dashed circle unless this device picks the dot", () => {
    expect(sidebarLook(defaults, "compact", false).branchMark).toBe("dashed");
    expect(sidebarLook(viewStateSettings.schema.parse({ branchMark: "dot" }), "compact", false).branchMark).toBe("dot");
    expect(viewStateSettings.schema.safeParse({ branchMark: "ring" }).success).toBe(false);
  });
});
