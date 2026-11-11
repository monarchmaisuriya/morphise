import { describe, expect, it } from "vitest";
import { activeProfile, documentSchema, EMPTY_DOCUMENT, migrateDocument } from "./document";
import { EMPTY_PROFILE, profileSchema } from "./profile";
import { STARTER_DOCUMENT } from "./starter-profile";

function issues(input: unknown): string[] {
  const result = documentSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

// A profile as Morphise 0.1.0 saved it: every 0.1 key present, nothing newer.
const savedByVersionOne = {
  theme: null,
  sidebar: {
    headerRows: [],
    footerRows: [{ id: "edit-layout", label: "Edit layout", icon: "Palette", action: { kind: "open-editor" } }],
    view: { enabled: true, groupBy: "status", orderBy: "name", density: "comfortable", showAgents: true },
  },
  header: { buttons: [] },
  composer: { pills: [], controls: [] },
  slashCommands: [],
  commandCenter: [],
  newWorkspace: { presets: [] },
  timeline: { hide: ["reasoning"] },
  style: { enabled: false, hideTestIds: [], css: "" },
};

describe("documentSchema", () => {
  it("parses an empty document to one default layout that changes nothing", () => {
    expect(EMPTY_DOCUMENT).toEqual({
      activeLayout: "default",
      layouts: [{ id: "default", name: "Default", profile: EMPTY_PROFILE }],
      prompts: [],
    });
  });

  it("refuses an active layout that names no layout", () => {
    expect(issues({ activeLayout: "focus" })).toEqual(['activeLayout: No layout has the id "focus"']);
  });

  it("refuses two layouts with the same id", () => {
    const layout = { id: "focus", name: "Focus" };
    expect(issues({ activeLayout: "focus", layouts: [layout, layout] })).toEqual([
      'layouts.1.id: Duplicate id "focus"; ids must be unique in this list',
    ]);
  });

  it("refuses a document with no layouts", () => {
    expect(issues({ layouts: [] }).length).toBeGreaterThan(0);
  });

  it("refuses more than ten layouts", () => {
    const layouts = Array.from({ length: 11 }, (_, index) => ({ id: `l${index}`, name: `L${index}` }));
    expect(issues({ activeLayout: "l0", layouts }).length).toBeGreaterThan(0);
  });

  it("gives a prompt a default star and refuses an empty prompt text", () => {
    const parsed = documentSchema.parse({ prompts: [{ id: "review", title: "Review", text: "Review this." }] });
    expect(parsed.prompts).toEqual([{ id: "review", title: "Review", text: "Review this.", starred: false }]);
    expect(issues({ prompts: [{ id: "x", title: "X", text: "" }] })).toEqual([
      "prompts.0.text: Write the prompt text",
    ]);
  });

  it("accepts the starter document", () => {
    expect(issues(STARTER_DOCUMENT)).toEqual([]);
  });
});

describe("activeProfile", () => {
  it("returns the profile of the active layout, so switching layouts changes what applies", () => {
    const focus = profileSchema.parse({ timeline: { hide: ["todo"] } });
    const document = documentSchema.parse({
      activeLayout: "focus",
      layouts: [
        { id: "default", name: "Default" },
        { id: "focus", name: "Focus", profile: focus },
      ],
    });
    expect(activeProfile(document)).toEqual(focus);
    expect(activeProfile({ ...document, activeLayout: "default" })).toEqual(EMPTY_PROFILE);
  });
});

describe("migrateDocument", () => {
  it("wraps a version 1 profile as the active layout Default and keeps every setting", () => {
    const migrated = documentSchema.parse(migrateDocument(savedByVersionOne, 1));
    expect(migrated.activeLayout).toBe("default");
    expect(migrated.prompts).toEqual([]);
    const [layout] = migrated.layouts;
    expect(layout.name).toBe("Default");
    expect(layout.profile.sidebar.footerRows).toEqual(savedByVersionOne.sidebar.footerRows);
    expect(layout.profile.sidebar.view).toMatchObject(savedByVersionOne.sidebar.view);
    expect(layout.profile.timeline.hide).toEqual(["reasoning"]);
  });

  it("keeps the branch on rows that version 1 showed it on (comfortable density)", () => {
    const migrated = documentSchema.parse(migrateDocument(savedByVersionOne, 1));
    expect(migrated.layouts[0].profile.sidebar.view.details.branch).toBe(true);
  });

  it("leaves the branch off for a compact version 1 profile", () => {
    const compact = { ...savedByVersionOne, sidebar: { ...savedByVersionOne.sidebar, view: { ...savedByVersionOne.sidebar.view, density: "compact" } } };
    const migrated = documentSchema.parse(migrateDocument(compact, 1));
    expect(migrated.layouts[0].profile.sidebar.view.details.branch).toBe(false);
  });

  it("migrates a version 1 profile that left out optional sections", () => {
    expect(documentSchema.parse(migrateDocument({}, 1)).layouts[0].profile).toEqual(EMPTY_PROFILE);
  });

  it("renames 0.1 items that use names 0.2 reserves, so the upgrade keeps them instead of failing", () => {
    const action = { kind: "open-editor" };
    const old = {
      ...savedByVersionOne,
      slashCommands: [
        { name: "remind", description: "Mine", argumentHint: "", action },
        { name: "remind-custom", description: "Taken", argumentHint: "", action },
      ],
      commandCenter: [{ id: "morphise-layout-x", title: "Mine", icon: "Box", action }],
      header: { buttons: [{ id: "morphise-tools", title: "Tools", icon: "Box", action }] },
      composer: { pills: [{ id: "morphise-remind", title: "Pill", icon: "Box", action }], controls: [{ kind: "action", id: "morphise-prompts", title: "C", icon: "Box", action }] },
    };
    const result = documentSchema.safeParse(migrateDocument(old, 1));
    expect(result.success).toBe(true);
    const profile = result.success ? result.data.layouts[0].profile : null;
    expect(profile?.slashCommands.map((command) => command.name)).toEqual(["remind-custom-2", "remind-custom"]);
    expect(profile?.commandCenter[0].id).toBe("custom-morphise-layout-x");
    expect(profile?.header.buttons[0].id).toBe("custom-morphise-tools");
    expect(profile?.composer.pills[0].id).toBe("custom-morphise-remind");
    expect(profile?.composer.controls[0].id).toBe("custom-morphise-prompts");
  });

  it("refuses a version it does not know, so the setting shows as invalid instead of guessing", () => {
    expect(() => migrateDocument({}, 7)).toThrow("Morphise cannot upgrade a profile saved as settings version 7");
  });
});
