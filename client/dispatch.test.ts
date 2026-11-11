import { describe, expect, it } from "vitest";
import type { ChatInfo } from "./chats";
import { modelsOf, projectsOf, titleFromPrompt } from "./dispatch-options";
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
