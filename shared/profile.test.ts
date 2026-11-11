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
          groupBy: "project",
          orderBy: "activity",
          density: "compact",
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
    });
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

  it("refuses an id that Paseo would reject", () => {
    expect(issues({ commandCenter: [{ id: "Bad Id", title: "T", icon: "Box", action: { kind: "open-editor" } }] })).toEqual([
      "commandCenter.0.id: Expected lowercase letters, digits and hyphens, starting with a letter",
    ]);
  });
});
