import { describe, expect, it } from "vitest";
import type { ChatInfo } from "./chats";
import { modeChoices, modelChoices, modelsOf, projectsOf, providerStatus, splitPrompts, titleFromPrompt } from "./dispatch-options";
import type { WorkspaceInfo } from "./workspaces";

const workspace = (id: string, projectId: string | null, project: string, rootPath: string | null, kind = "git") => ({ id, projectId, project, projectRootPath: rootPath, projectKind: kind }) as unknown as WorkspaceInfo;
const chat = (model: string) => ({ title: "c", workspaceId: "w", indicator: "done", model }) as ChatInfo;

describe("dispatcher options", () => {
  it("lists each project once, by name, skipping workspaces without a project folder", () => {
    const list = new Map([
      ["a", workspace("a", "p2", "web", "/web")],
      ["b", workspace("b", "p1", "api", "/api")],
      ["c", workspace("c", "p1", "api", "/api")],
      ["d", workspace("d", null, "", null)],
    ]);
    expect(projectsOf(list)).toEqual([
      { id: "p1", name: "api", rootPath: "/api", kind: "git" },
      { id: "p2", name: "web", rootPath: "/web", kind: "git" },
    ]);
  });

  it("offers the agents open chats use, the most used first", () => {
    const chats = new Map([
      ["1", chat("claude/opus")],
      ["2", chat("codex/gpt")],
      ["3", chat("claude/opus")],
      ["4", chat("")],
      ["5", chat("codex")],
    ]);
    expect(modelsOf(chats)).toEqual(["claude/opus", "codex/gpt"]);
  });

  it("titles a workspace with its prompt's first line, shortened", () => {
    expect(titleFromPrompt("  Fix login\nmore detail")).toBe("Fix login");
    expect(titleFromPrompt("x".repeat(80))).toBe(`${"x".repeat(57)}...`);
  });
});

describe("dispatcher models, modes and pasted lists", () => {
  // Shaped like Paseo's provider snapshot entries (protocol ProviderSnapshotEntrySchema).
  const entries = [
    { provider: "claude", label: "Claude", status: "ready", enabled: true, defaultModeId: "default", modes: [{ id: "default", label: "Ask" }, { id: "auto", label: "Auto" }], models: [{ provider: "claude", id: "sonnet", label: "Sonnet", isDefault: true }, { provider: "claude", id: "opus", label: "Opus" }, { provider: "claude", id: "hidden", label: "Hidden", isSelectable: false }] },
    { provider: "codex", label: "Codex", status: "unavailable", enabled: true, models: [{ provider: "codex", id: "gpt", label: "GPT" }] },
    { provider: "off", status: "ready", enabled: false, models: [{ provider: "off", id: "m", label: "M" }] },
  ];

  it("offers every selectable model of ready providers, the ones chats use first, then defaults", () => {
    expect(modelChoices(entries, []).map((choice) => choice.value)).toEqual(["claude/sonnet", "claude/opus"]);
    expect(modelChoices(entries, ["claude/opus"]).map((choice) => choice.value)).toEqual(["claude/opus", "claude/sonnet"]);
    expect(modelChoices(entries, [])[0].label).toBe("Claude · Sonnet");
  });

  it("reads a provider's status, null when it is not listed", () => {
    expect(providerStatus(entries, "codex")).toBe("unavailable");
    expect(providerStatus(entries, "nope")).toBeNull();
  });

  it("offers a provider's modes and the one it starts in", () => {
    expect(modeChoices(entries, "claude")).toEqual({ modes: [{ id: "default", label: "Ask" }, { id: "auto", label: "Auto" }], defaultId: "default" });
    expect(modeChoices(entries, "codex")).toEqual({ modes: [], defaultId: null });
  });

  it("splits pasted paragraphs or bullet lists into prompts, and leaves one prompt alone", () => {
    expect(splitPrompts("Fix login\n\nAdd tests\n  \nWrite docs")).toEqual(["Fix login", "Add tests", "Write docs"]);
    expect(splitPrompts("- Fix login\n- Add tests\n2) Write docs")).toEqual(["Fix login", "Add tests", "Write docs"]);
    expect(splitPrompts("Fix login.\nThen add tests for it.")).toBeNull();
    expect(splitPrompts("One prompt")).toBeNull();
  });
});
