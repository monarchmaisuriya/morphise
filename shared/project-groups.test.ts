import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createGroup,
  deleteGroup,
  dropGroup,
  dropProject,
  dropProjectWhileAutoOrdered,
  groupOrderSettings,
  DECOR_COLORS,
  DECOR_ICONS,
  EMPTY_PROJECT_GROUPS,
  moveGroup,
  moveProject,
  newGroupId,
  onSaved,
  parseHexColor,
  projectGroupMap,
  projectGroupsSchema,
  type ProjectGroups,
  renameGroup,
  setDecoration,
} from "./project-groups";

const named = (doc: ProjectGroups) => doc.groups.map((group) => [group.id, group.name, group.projects]);

function twoGroups(): ProjectGroups {
  return projectGroupsSchema.parse({
    groups: [
      { id: "gwork", name: "Work", projects: ["p1", "p2"] },
      { id: "gside", name: "Side", projects: ["p3"] },
    ],
  });
}

describe("project groups document", () => {
  it("starts with no groups, so every project is ungrouped", () => {
    expect(EMPTY_PROJECT_GROUPS.groups).toEqual([]);
    expect(projectGroupMap(EMPTY_PROJECT_GROUPS).size).toBe(0);
  });

  it("refuses more than 100 groups and a name over 60 characters", () => {
    const groups = Array.from({ length: 101 }, (_, index) => ({ id: `g${index}`, name: `G${index}`, projects: [] }));
    expect(projectGroupsSchema.safeParse({ groups }).success).toBe(false);
    expect(projectGroupsSchema.safeParse({ groups: [{ id: "ga", name: "x".repeat(61), projects: [] }] }).success).toBe(false);
  });

  it("keeps project keys it does not know, so a project list that is still loading loses nothing", () => {
    const doc = projectGroupsSchema.parse({ groups: [{ id: "gwork", name: "Work", projects: ["gone-project"] }] });
    expect(moveProject(doc, "p1", "gwork", 5).groups[0]?.projects).toEqual(["gone-project", "p1"]);
  });
});

describe("createGroup", () => {
  it("puts a new group first, named New group, then New group 2", () => {
    const one = createGroup(EMPTY_PROJECT_GROUPS, "ga");
    const two = createGroup(one, "gb");
    expect(named(two)).toEqual([
      ["gb", "New group 2", []],
      ["ga", "New group", []],
    ]);
  });

  it("refuses an id already in use", () => {
    expect(() => createGroup(twoGroups(), "gwork")).toThrow('A group with the id "gwork" already exists');
  });
});

describe("renameGroup", () => {
  it("trims the name", () => {
    expect(renameGroup(twoGroups(), "gwork", "  Clients  ").groups[0]?.name).toBe("Clients");
  });

  it("refuses an empty name, keeping the old one", () => {
    const doc = twoGroups();
    expect(() => renameGroup(doc, "gwork", "   ")).toThrow("A group needs a name");
    expect(doc.groups[0]?.name).toBe("Work");
  });

  it("fails loudly for a group that does not exist", () => {
    expect(() => renameGroup(twoGroups(), "g123", "X")).toThrow('No group has the id "g123"');
  });
});

describe("deleteGroup", () => {
  it("removes the group and its decoration; its projects become ungrouped", () => {
    const decorated = setDecoration(twoGroups(), "groups", "gwork", { color: "#E5484D", icon: null });
    const doc = deleteGroup(decorated, "gwork");
    expect(named(doc)).toEqual([["gside", "Side", ["p3"]]]);
    expect(doc.decorations.groups).toEqual({});
    expect(projectGroupMap(doc).has("p1")).toBe(false);
  });

  it("fails loudly for a group that does not exist", () => {
    expect(() => deleteGroup(twoGroups(), "g123")).toThrow('No group has the id "g123"');
  });
});

describe("moveProject", () => {
  it("puts a project at the index given", () => {
    expect(moveProject(twoGroups(), "p9", "gwork", 1).groups[0]?.projects).toEqual(["p1", "p9", "p2"]);
  });

  it("moves a project out of its old group, so it is never in two", () => {
    const doc = moveProject(twoGroups(), "p3", "gwork", 0);
    expect(named(doc)).toEqual([
      ["gwork", "Work", ["p3", "p1", "p2"]],
      ["gside", "Side", []],
    ]);
  });

  it("reorders within the same group", () => {
    expect(moveProject(twoGroups(), "p1", "gwork", 2).groups[0]?.projects).toEqual(["p2", "p1"]);
  });

  it("takes a project out of every group when moved to Ungrouped", () => {
    const doc = moveProject(twoGroups(), "p2", null, 0);
    expect(doc.groups[0]?.projects).toEqual(["p1"]);
    expect(projectGroupMap(doc).has("p2")).toBe(false);
  });

  it("appends past the end and puts a negative index first", () => {
    expect(moveProject(twoGroups(), "p9", "gwork", 99).groups[0]?.projects).toEqual(["p1", "p2", "p9"]);
    expect(moveProject(twoGroups(), "p9", "gwork", -4).groups[0]?.projects).toEqual(["p9", "p1", "p2"]);
  });

  it("fails loudly for a group that does not exist, changing nothing", () => {
    expect(() => moveProject(twoGroups(), "p1", "g123", 0)).toThrow('No group has the id "g123"');
  });
});

describe("moveGroup", () => {
  it("puts a group at the index given", () => {
    expect(moveGroup(twoGroups(), "gside", 0).groups.map((group) => group.id)).toEqual(["gside", "gwork"]);
    expect(moveGroup(twoGroups(), "gwork", 9).groups.map((group) => group.id)).toEqual(["gside", "gwork"]);
  });
});

describe("setDecoration", () => {
  it("stores a colour and a Lucide or emoji icon", () => {
    const doc = setDecoration(setDecoration(twoGroups(), "projects", "p1", { color: "#30A46C", icon: "lucide:Rocket" }), "workspaces", "w1", { color: null, icon: "emoji:🚀" });
    expect(doc.decorations.projects.p1).toEqual({ color: "#30A46C", icon: "lucide:Rocket" });
    expect(doc.decorations.workspaces.w1).toEqual({ color: null, icon: "emoji:🚀" });
  });

  it("refuses a colour that is not #RRGGBB and an icon without lucide: or emoji:", () => {
    expect(() => setDecoration(twoGroups(), "projects", "p1", { color: "red", icon: null })).toThrow();
    expect(() => setDecoration(twoGroups(), "projects", "p1", { color: null, icon: "Rocket" })).toThrow();
  });

  it("removes the entry when both are cleared", () => {
    const set = setDecoration(twoGroups(), "projects", "p1", { color: "#30A46C", icon: null });
    expect(setDecoration(set, "projects", "p1", { color: null, icon: null }).decorations.projects).toEqual({});
  });
});

describe("projectGroupMap", () => {
  it("maps each grouped project to its group's id and name", () => {
    const map = projectGroupMap(twoGroups());
    expect(map.get("p2")).toEqual({ id: "gwork", name: "Work" });
    expect(map.get("p3")).toEqual({ id: "gside", name: "Side" });
  });
});

describe("newGroupId", () => {
  it("makes ids the document accepts, different each time", () => {
    const ids = [newGroupId(), newGroupId(), newGroupId()];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(() => createGroup(EMPTY_PROJECT_GROUPS, id)).not.toThrow();
  });
});

describe("onSaved", () => {
  it("applies an operation to the document as saved, filling defaults for anything missing", () => {
    expect(named(onSaved((doc) => createGroup(doc, "ga"))({}))).toEqual([["ga", "New group", []]]);
  });
});

describe("dropProject", () => {
  it("puts the dragged project before the one it was dropped on", () => {
    expect(dropProject(twoGroups(), "p9", { group: "gwork", before: "p2" }).groups[0]?.projects).toEqual(["p1", "p9", "p2"]);
  });

  it("moves it out of its old group when dropped into another", () => {
    expect(named(dropProject(twoGroups(), "p3", { group: "gwork", before: "p1" }))).toEqual([
      ["gwork", "Work", ["p3", "p1", "p2"]],
      ["gside", "Side", []],
    ]);
  });

  it("reorders within a group, counting places without the dragged project", () => {
    expect(dropProject(twoGroups(), "p2", { group: "gwork", before: "p1" }).groups[0]?.projects).toEqual(["p2", "p1"]);
  });

  it("takes it out of every group when dropped into Ungrouped", () => {
    expect(projectGroupMap(dropProject(twoGroups(), "p1", { group: null, before: null })).has("p1")).toBe(false);
  });

  it("appends it when dropped at the end, or before a project not saved in that group", () => {
    expect(dropProject(twoGroups(), "p9", { group: "gwork", before: null }).groups[0]?.projects).toEqual(["p1", "p2", "p9"]);
    expect(dropProject(twoGroups(), "p9", { group: "gwork", before: "empty-project" }).groups[0]?.projects).toEqual(["p1", "p2", "p9"]);
  });
});

describe("dropGroup", () => {
  it("puts a group before the one it was dropped on, or last at the end or before Ungrouped", () => {
    const three = createGroup(twoGroups(), "gnew");
    expect(dropGroup(three, "gnew", "gside").groups.map((group) => group.id)).toEqual(["gwork", "gnew", "gside"]);
    expect(dropGroup(three, "gnew", null).groups.map((group) => group.id)).toEqual(["gwork", "gside", "gnew"]);
  });
});

describe("the colour and icon choices", () => {
  it("offers 11 colours and 36 icons, every one of which the document accepts", () => {
    expect(DECOR_COLORS).toHaveLength(11);
    expect(DECOR_ICONS).toHaveLength(36);
    for (const color of DECOR_COLORS) expect(() => setDecoration(twoGroups(), "groups", "gwork", { color: color.value, icon: null })).not.toThrow();
    for (const icon of DECOR_ICONS) expect(() => setDecoration(twoGroups(), "groups", "gwork", { color: null, icon: `lucide:${icon}` })).not.toThrow();
  });
});

describe("custom colours", () => {
  it("accepts six-digit hex with or without # and any case, stored upper case with #", () => {
    expect(parseHexColor("#8e4ec6")).toBe("#8E4EC6");
    expect(parseHexColor("8E4EC6")).toBe("#8E4EC6");
    expect(parseHexColor("  #12a594 ")).toBe("#12A594");
  });

  it("refuses anything else, so a typo never reaches the shared document", () => {
    for (const text of ["", "#", "#fff", "#12345", "#1234567", "#GGGGGG", "purple", "rgb(1,2,3)"]) expect(parseHexColor(text)).toBeNull();
  });

  it("produces colours the stored decoration accepts", () => {
    const color = parseHexColor("abcdef");
    expect(color).not.toBeNull();
    expect(() => setDecoration(twoGroups(), "projects", "prj_1", { color, icon: null })).not.toThrow();
  });
});

describe("group order settings", () => {
  it("leaves projects in their saved order unless asked, and keeps groups by last use", () => {
    expect(groupOrderSettings.schema.parse({})).toEqual({ lastUsedFirst: true, projectsLastUsedFirst: false });
  });

  it("reads under an older Morphise, which knows only lastUsedFirst and drops the newer field", () => {
    const older = z.object({ lastUsedFirst: z.boolean().default(true) });
    expect(older.parse({ lastUsedFirst: false, projectsLastUsedFirst: true })).toEqual({ lastUsedFirst: false });
  });
});

describe("dropProjectWhileAutoOrdered", () => {
  it("changes nothing when a project is dropped in the group it is already in", () => {
    const doc = twoGroups();
    expect(dropProjectWhileAutoOrdered(doc, "p2", "gwork")).toBe(doc);
  });

  it("changes nothing when an ungrouped project is dropped in Ungrouped", () => {
    const doc = twoGroups();
    expect(dropProjectWhileAutoOrdered(doc, "p7", null)).toBe(doc);
  });

  it("moves a project dropped in another group to the end of that group", () => {
    expect(named(dropProjectWhileAutoOrdered(twoGroups(), "p1", "gside"))).toEqual([
      ["gwork", "Work", ["p2"]],
      ["gside", "Side", ["p3", "p1"]],
    ]);
  });

  it("takes a project out of its group when dropped in Ungrouped", () => {
    expect(projectGroupMap(dropProjectWhileAutoOrdered(twoGroups(), "p3", null)).has("p3")).toBe(false);
  });
});
