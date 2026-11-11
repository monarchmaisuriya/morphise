import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile";

function issues(input: unknown): string[] {
  const result = profileSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("profileSchema", () => {
  it("parses an empty document to a profile that changes nothing", () => {
    expect(profileSchema.parse({})).toEqual({
      theme: null,
      sidebar: {
        headerRows: [],
        footerRows: [],
        view: {
          enabled: false,
          list: "workspaces",
          groupBy: "project",
          orderBy: "activity",
          thenBy: "activity",
          statusOrder: ["needs_input", "failed", "running", "attention", "done"],
          pinnedFirst: true,
          counts: true,
          rowLimit: { enabled: false, rows: 8 },
          density: "compact",
          details: { branch: false, diff: false, timeInStatus: false, project: false },
          rowActions: ["pin"],
          filterBar: true,
          showAgents: false,
        },
      },
      header: { buttons: [] },
      composer: { pills: [], controls: [] },
      slashCommands: [],
      commandCenter: [],
      newWorkspace: { presets: [] },
      timeline: { hide: [] },
      style: { enabled: false, hideTestIds: [], css: "" },
      reminders: { presets: [15, 30, 60, 180], sound: true, desktopNotification: true },
    });
  });

  it("refuses a status order that leaves out or repeats a status", () => {
    const message = "sidebar.view.statusOrder: Expected each of the five statuses exactly once";
    expect(issues({ sidebar: { view: { statusOrder: ["running", "done"] } } })).toEqual([message]);
    expect(issues({ sidebar: { view: { statusOrder: ["running", "running", "failed", "attention", "done"] } } })).toEqual([message]);
    expect(issues({ sidebar: { view: { statusOrder: ["running", "needs_input", "failed", "attention", "done"] } } })).toEqual([]);
  });

  it("keeps the row limit between 3 and 100 rows, so a zero cannot mean off", () => {
    expect(issues({ sidebar: { view: { rowLimit: { enabled: true, rows: 0 } } } })).toHaveLength(1);
    expect(issues({ sidebar: { view: { rowLimit: { enabled: true, rows: 101 } } } })).toHaveLength(1);
    expect(issues({ sidebar: { view: { rowLimit: { enabled: true, rows: 3 } } } })).toEqual([]);
  });

  it("refuses a repeated row action", () => {
    expect(issues({ sidebar: { view: { rowActions: ["pin", "pin"] } } })).toEqual([
      "sidebar.view.rowActions: Expected each row action at most once",
    ]);
  });

  it("needs at least one reminder preset, each between 1 minute and 7 days, without repeats", () => {
    expect(issues({ reminders: { presets: [] } })).toHaveLength(1);
    expect(issues({ reminders: { presets: [0] } })).toHaveLength(1);
    expect(issues({ reminders: { presets: [10081] } })).toHaveLength(1);
    expect(issues({ reminders: { presets: [15, 15] } })).toEqual(["reminders.presets: Expected each preset at most once"]);
    expect(issues({ reminders: { presets: [1, 10080] } })).toEqual([]);
  });

  it("accepts a profile that fills every section", () => {
    const profile = {
      theme: {
        name: "Night",
        appearance: "dark",
        colors: {
          background: "#101010",
          foreground: "#eeeeee",
          raised: "#202020",
          control: "#303030",
          border: "#404040",
          mutedForeground: "#999999",
          ring: "#555555",
        },
      },
      sidebar: {
        headerRows: [{ id: "docs", label: "Docs", icon: "Book", action: { kind: "open-url", url: "https://paseo.sh/docs" } }],
        footerRows: [{ id: "edit", label: "Edit layout", icon: "Settings", action: { kind: "open-editor" } }],
        view: { enabled: true, groupBy: "label", orderBy: "name", density: "comfortable", showAgents: true },
      },
      header: {
        buttons: [
          {
            id: "tools",
            title: "Tools",
            icon: "Wrench",
            menu: [{ id: "plan", title: "Plan mode", action: { kind: "set-mode", mode: "plan" } }],
          },
        ],
      },
      composer: {
        pills: [{ id: "review", title: "Review", icon: "Scan", action: { kind: "insert-text", text: "Review this." } }],
        controls: [
          { kind: "toggle", id: "flag", title: "Needs review", icon: "Flag", metadataKey: "review.needed" },
          { kind: "select", id: "model", title: "Model", icon: "Cpu", target: "model", options: [{ label: "Fast", value: "haiku" }] },
          { kind: "action", id: "clear", title: "Clear", icon: "Eraser", action: { kind: "set-prompt", text: "" } },
        ],
      },
      slashCommands: [{ name: "lgtm", description: "Insert LGTM", argumentHint: "", action: { kind: "insert-text", text: "LGTM" } }],
      commandCenter: [{ id: "thinking", title: "Think hard", icon: "Brain", action: { kind: "set-thinking", thinking: "high" } }],
      newWorkspace: { presets: [{ id: "spike", label: "Spike", isolation: "worktree", metadata: { kind: "spike" } }] },
      timeline: { hide: ["reasoning", "todo"] },
      style: { enabled: true, hideTestIds: ["sidebar-help"], css: "body { letter-spacing: 0.01em; }" },
    };
    expect(issues(profile)).toEqual([]);
  });

  it("refuses a URL action that is not http or https", () => {
    expect(
      issues({
        sidebar: { headerRows: [{ id: "x", label: "X", icon: "Link", action: { kind: "open-url", url: "javascript:alert(1)" } }] },
      }),
    ).toEqual(["sidebar.headerRows.0.action.url: Expected an http or https URL"]);
  });

  it("refuses two items with the same id in one list and names the id", () => {
    const row = { id: "docs", label: "Docs", icon: "Book", action: { kind: "open-editor" } };
    expect(issues({ sidebar: { footerRows: [row, row] } })).toEqual([
      'sidebar.footerRows.1.id: Duplicate id "docs"; ids must be unique in this list',
    ]);
  });

  it("refuses two slash commands with the same name", () => {
    const command = { name: "lgtm", description: "d", argumentHint: "", action: { kind: "open-editor" } };
    expect(issues({ slashCommands: [command, command] })).toEqual([
      'slashCommands.1.name: Duplicate name "lgtm"; names must be unique in this list',
    ]);
  });

  it("refuses a hidden test id that could break out of the CSS selector", () => {
    expect(issues({ style: { hideTestIds: ['x"] , body { display:none } [x="'] } })).toEqual([
      "style.hideTestIds.0: Expected letters, digits, hyphens or underscores",
    ]);
  });

  it("refuses a theme colour that is not hex", () => {
    const colors = {
      background: "black",
      foreground: "#eeeeee",
      raised: "#202020",
      control: "#303030",
      border: "#404040",
      mutedForeground: "#999999",
      ring: "#555555",
    };
    expect(issues({ theme: { name: "T", appearance: "dark", colors } })).toEqual([
      "theme.colors.background: Expected a hex colour such as #1e1e2e",
    ]);
  });

  it("refuses a timeline type Paseo does not have", () => {
    expect(issues({ timeline: { hide: ["thinking"] } })).toHaveLength(1);
  });

  it("refuses a button with both an action and a menu", () => {
    const button = {
      id: "b",
      title: "B",
      icon: "Box",
      action: { kind: "open-editor" },
      menu: [{ id: "m", title: "M", action: { kind: "open-editor" } }],
    };
    expect(issues({ header: { buttons: [button] } }).length).toBeGreaterThan(0);
  });

  it("reserves Command Center ids that start with morphise- for Morphise's own commands", () => {
    expect(issues({ commandCenter: [{ id: "morphise-remind-15", title: "T", icon: "Box", action: { kind: "open-editor" } }] })).toEqual([
      'commandCenter.0.id: Ids starting with "morphise-" are reserved for Morphise\'s own items',
    ]);
  });

  it("reserves the pill ids and the slash command that reminders use", () => {
    const pill = { id: "morphise-remind", title: "R", icon: "Box", action: { kind: "open-editor" } };
    expect(issues({ composer: { pills: [pill] } })).toHaveLength(1);
    expect(issues({ slashCommands: [{ name: "remind", description: "d", argumentHint: "", action: { kind: "open-editor" } }] })).toEqual([
      'slashCommands.0.name: "/remind" is Morphise\'s own reminder command',
    ]);
  });

  it("refuses an id that Paseo would reject", () => {
    expect(issues({ commandCenter: [{ id: "Bad Id", title: "T", icon: "Box", action: { kind: "open-editor" } }] })).toEqual([
      "commandCenter.0.id: Expected lowercase letters, digits and hyphens, starting with a letter",
    ]);
  });
});
