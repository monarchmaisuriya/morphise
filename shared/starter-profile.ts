import { type Profile, profileSchema } from "./profile";

// A working example of every section, offered in the editor. Provider-specific values (models,
// modes) are left out because they differ per provider; the style layer stays off.
export const STARTER_PROFILE: Profile = profileSchema.parse({
  theme: {
    name: "Morphise Dusk",
    appearance: "dark",
    colors: {
      background: "#16161e",
      foreground: "#d5d6e0",
      raised: "#20202b",
      control: "#2a2a38",
      border: "#33334a",
      accent: "#8f8cf2",
      mutedForeground: "#8b8ca3",
      ring: "#55557a",
    },
  },
  sidebar: {
    headerRows: [
      { id: "paseo-docs", label: "Paseo docs", icon: "BookOpen", action: { kind: "open-url", url: "https://paseo.sh/docs" } },
    ],
    footerRows: [{ id: "edit-layout", label: "Edit layout", icon: "Palette", action: { kind: "open-editor" } }],
    view: { enabled: true, groupBy: "project", orderBy: "activity", density: "compact", showAgents: true },
  },
  header: {
    buttons: [
      {
        id: "snippets",
        title: "Snippets",
        icon: "TextCursorInput",
        label: "Snippets",
        menu: [
          { id: "review", title: "Ask for a review", icon: "Scan", action: { kind: "insert-text", text: "Review the last change for bugs and missing tests." } },
          { id: "explain", title: "Ask for an explanation", icon: "Lightbulb", action: { kind: "insert-text", text: "Explain what you just did and why, in plain words." } },
        ],
      },
    ],
  },
  composer: {
    pills: [{ id: "tests", title: "Ask to run the tests", icon: "FlaskConical", label: "Tests", action: { kind: "insert-text", text: "Run the tests and report the result." } }],
    controls: [
      { kind: "action", id: "clear-prompt", title: "Clear prompt", icon: "Eraser", action: { kind: "set-prompt", text: "" } },
      { kind: "toggle", id: "needs-review", title: "Needs review", icon: "Flag", metadataKey: "morphise.needsReview" },
    ],
  },
  slashCommands: [{ name: "lgtm", description: "Insert a short approval", argumentHint: "", action: { kind: "insert-text", text: "Looks good, go ahead." } }],
  commandCenter: [{ id: "edit-layout", title: "Morphise: edit layout", icon: "Palette", keywords: ["customise", "layout"], action: { kind: "open-editor" } }],
  newWorkspace: { presets: [{ id: "spike", label: "Spike in a worktree", isolation: "worktree", metadata: { "morphise.kind": "spike" } }] },
  timeline: { hide: [] },
  style: { enabled: false, hideTestIds: ["sidebar-help"], css: "" },
});
