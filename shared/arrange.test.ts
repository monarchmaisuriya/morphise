import { describe, expect, it } from "vitest";
import {
  type ArrangeWorkspace,
  capRows,
  compareWorkspaces,
  groupKeys,
  isProtected,
  isVisible,
  matchesFilter,
  orderGroups,
} from "./arrange";
import { profileSchema } from "./profile";

type View = ReturnType<typeof profileSchema.parse>["sidebar"]["view"];

function view(overrides: Partial<View> = {}): View {
  return { ...profileSchema.parse({}).sidebar.view, ...overrides };
}

function workspace(overrides: Partial<ArrangeWorkspace> & { id: string }): ArrangeWorkspace {
  return {
    name: overrides.id,
    title: null,
    indicator: "done",
    pinnedAt: null,
    lastPromptAt: null,
    branch: null,
    labels: [],
    projectDisplayName: "app",
    project: { key: "project:app" },
    archivingAt: null,
    background: false,
    ...overrides,
  };
}

const sorted = (items: ArrangeWorkspace[], config: View) => [...items].sort(compareWorkspaces(config)).map((item) => item.id);

describe("isVisible", () => {
  it("hides archiving and background workspaces", () => {
    expect(isVisible(workspace({ id: "a" }))).toBe(true);
    expect(isVisible(workspace({ id: "b", archivingAt: "2026-11-11T10:00:00Z" }))).toBe(false);
    expect(isVisible(workspace({ id: "c", background: true }))).toBe(false);
  });
});

describe("compareWorkspaces", () => {
  const items = [
    workspace({ id: "done-new", indicator: "done", lastPromptAt: "2026-11-11T12:00:00Z" }),
    workspace({ id: "running", indicator: "running", lastPromptAt: "2026-11-11T09:00:00Z" }),
    workspace({ id: "needs", indicator: "needs_input", lastPromptAt: "2026-11-11T08:00:00Z" }),
    workspace({ id: "unread", indicator: "attention", lastPromptAt: "2026-11-11T11:00:00Z" }),
    workspace({ id: "failed", indicator: "failed", lastPromptAt: "2026-11-11T10:00:00Z" }),
  ];

  it("sorts by status in Paseo's priority order by default when sorting by status", () => {
    expect(sorted(items, view({ orderBy: "status" }))).toEqual(["needs", "failed", "running", "unread", "done-new"]);
  });

  it("follows an edited status order", () => {
    const statusOrder = ["running", "needs_input", "failed", "attention", "done"] as View["statusOrder"];
    expect(sorted(items, view({ orderBy: "status", statusOrder }))).toEqual(["running", "needs", "failed", "unread", "done-new"]);
  });

  it("sorts by newest prompt first, with never-prompted workspaces last", () => {
    const withSilent = [...items, workspace({ id: "silent" })];
    expect(sorted(withSilent, view({ orderBy: "activity" }))).toEqual(["done-new", "unread", "failed", "running", "needs", "silent"]);
  });

  it("sorts by name, using the title when a workspace has one", () => {
    const named = [workspace({ id: "b", name: "beta" }), workspace({ id: "a", name: "zeta", title: "Alpha" })];
    expect(sorted(named, view({ orderBy: "name" }))).toEqual(["a", "b"]);
  });

  it("breaks ties within a status by the chosen second order", () => {
    const tied = [
      workspace({ id: "old", name: "a", indicator: "running", lastPromptAt: "2026-11-11T08:00:00Z" }),
      workspace({ id: "new", name: "b", indicator: "running", lastPromptAt: "2026-11-11T09:00:00Z" }),
    ];
    expect(sorted(tied, view({ orderBy: "status", thenBy: "activity" }))).toEqual(["new", "old"]);
    expect(sorted(tied, view({ orderBy: "status", thenBy: "name" }))).toEqual(["old", "new"]);
  });

  it("puts pinned workspaces first when pinned-first is on, and ignores pins when it is off", () => {
    const pinned = [...items, workspace({ id: "pinned", indicator: "done", pinnedAt: "2026-11-01T00:00:00Z" })];
    expect(sorted(pinned, view({ orderBy: "status", pinnedFirst: true }))[0]).toBe("pinned");
    expect(sorted(pinned, view({ orderBy: "status", pinnedFirst: false })).at(-1)).toBe("pinned");
  });

  it("gives a stable order for workspaces that tie on everything", () => {
    const twins = [workspace({ id: "b", name: "same" }), workspace({ id: "a", name: "same" })];
    expect(sorted(twins, view({ orderBy: "name", thenBy: "name" }))).toEqual(["a", "b"]);
  });
});

describe("matchesFilter", () => {
  const api = workspace({ id: "w", name: "API server", branch: "fix/login", projectDisplayName: "backend", indicator: "running" });

  it("lets everything through with no statuses chosen and no search", () => {
    expect(matchesFilter(api, { statuses: [], search: "" })).toBe(true);
  });

  it("keeps only the chosen statuses", () => {
    expect(matchesFilter(api, { statuses: ["running"], search: "" })).toBe(true);
    expect(matchesFilter(api, { statuses: ["needs_input", "failed"], search: "" })).toBe(false);
  });

  it("searches the name, branch and project, ignoring case and surrounding spaces", () => {
    expect(matchesFilter(api, { statuses: [], search: "  api " })).toBe(true);
    expect(matchesFilter(api, { statuses: [], search: "LOGIN" })).toBe(true);
    expect(matchesFilter(api, { statuses: [], search: "backend" })).toBe(true);
    expect(matchesFilter(api, { statuses: [], search: "frontend" })).toBe(false);
  });
});

describe("isProtected", () => {
  it("protects workspaces that need permission or failed, and nothing else", () => {
    expect(["needs_input", "failed", "running", "attention", "done"].map((indicator) => isProtected(workspace({ id: indicator, indicator: indicator as ArrangeWorkspace["indicator"] })))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("groupKeys", () => {
  it("groups by project, status title, or each label with a fallback group", () => {
    const item = workspace({ id: "w", indicator: "needs_input", labels: ["bug", "ui"] });
    expect(groupKeys(view({ groupBy: "project" }), item)).toEqual({ key: "project:project:app", title: "app" });
    expect(groupKeys(view({ groupBy: "status" }), item)).toEqual({ key: "status:needs_input", title: "Needs permission" });
    expect(groupKeys(view({ groupBy: "label" }), item)).toEqual([
      { key: "label:bug", title: "bug" },
      { key: "label:ui", title: "ui" },
    ]);
    expect(groupKeys(view({ groupBy: "label" }), workspace({ id: "x" }))).toEqual({ key: "label:", title: "Unlabelled" });
  });
});

describe("orderGroups", () => {
  const group = (key: string) => ({ key, title: key, color: null, items: [] });

  it("puts status groups in the status order, whatever order they arrived in", () => {
    const groups = [group("status:done"), group("status:running"), group("status:needs_input")];
    expect(orderGroups(groups, view({ groupBy: "status" })).map((item) => item.key)).toEqual([
      "status:needs_input",
      "status:running",
      "status:done",
    ]);
  });

  it("keeps project and label groups in the order they arrived", () => {
    const groups = [group("project:b"), group("project:a")];
    expect(orderGroups(groups, view({ groupBy: "project" })).map((item) => item.key)).toEqual(["project:b", "project:a"]);
  });
});

describe("capRows", () => {
  const refs = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"].map((key) => ({ key }));
  const limit = { enabled: true, rows: 5 };

  it("shows everything when the limit is off or the group is expanded", () => {
    expect(capRows(refs, new Set(), { enabled: false, rows: 5 }, false)).toEqual({ rows: refs, hidden: 0 });
    expect(capRows(refs, new Set(), limit, true)).toEqual({ rows: refs, hidden: 0 });
  });

  it("shows the first rows and counts the rest", () => {
    const result = capRows(refs, new Set(), limit, false);
    expect(result.rows.map((ref) => ref.key)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(result.hidden).toBe(4);
  });

  it("keeps protected rows within the limit, filling the rest in order", () => {
    const result = capRows(refs, new Set(["r7", "r9"]), limit, false);
    expect(result.rows.map((ref) => ref.key)).toEqual(["r1", "r2", "r3", "r7", "r9"]);
    expect(result.hidden).toBe(4);
  });

  it("shows every protected row even when there are more than the limit", () => {
    const result = capRows(refs, new Set(["r2", "r4", "r6", "r8", "r9", "r1"]), limit, false);
    expect(result.rows.map((ref) => ref.key)).toEqual(["r1", "r2", "r4", "r6", "r8", "r9"]);
    expect(result.hidden).toBe(3);
  });
});
