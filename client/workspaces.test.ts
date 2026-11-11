import { describe, expect, it } from "vitest";
import { reduceWorkspaceInfo, workspaceChoices } from "./workspaces";

const descriptor = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `${id}-branch`, projectDisplayName: "Demo", archivingAt: null, lastUserMessageAt: null, ...extra });
const upsert = (workspace: unknown) => ({ message: { type: "workspace_update", payload: { kind: "upsert", workspace } } });

describe("workspace info", () => {
  it("keeps each workspace's name (its title when set), project and whether it is open", () => {
    const list = reduceWorkspaceInfo(new Map(), { snapshot: [descriptor("w1", { title: "Login fix" }), descriptor("w2", { archivingAt: "2026-11-11T10:00:00Z" })] });
    expect(list.get("w1")).toMatchObject({ id: "w1", name: "Login fix", project: "Demo", open: true, lastUsed: null });
    expect(list.get("w2")?.open).toBe(false);
  });

  it("applies upserts and removals, and returns the same map when nothing changed", () => {
    const start = reduceWorkspaceInfo(new Map(), { snapshot: [descriptor("w1")] });
    expect(reduceWorkspaceInfo(start, upsert(descriptor("w1")))).toBe(start);
    const renamed = reduceWorkspaceInfo(start, upsert(descriptor("w1", { title: "Renamed" })));
    expect(renamed.get("w1")?.name).toBe("Renamed");
    const removed = reduceWorkspaceInfo(renamed, { message: { type: "workspace_update", payload: { kind: "remove", id: "w1" } } });
    expect(removed.size).toBe(0);
  });

  it("keeps git, pull request and service status, as Paseo's own rows show them", () => {
    const list = reduceWorkspaceInfo(new Map(), {
      snapshot: [
        descriptor("w1", {
          workspaceDirectory: "/repo/w1",
          labels: ["urgent"],
          diffStat: { additions: 4, deletions: 1 },
          gitRuntime: { currentBranch: "fix/login", isDirty: true, aheadBehind: { ahead: 2, behind: 1 } },
          githubRuntime: { pullRequest: { number: 12, url: "https://github.com/a/b/pull/12", title: "Fix login", state: "OPEN", isMerged: false, isDraft: true, checksStatus: "failure", reviewDecision: "approved", baseRefName: "main", headRefName: "fix/login" } },
          scripts: [{ scriptName: "web", type: "service", hostname: "localhost", port: 3000, lifecycle: "running", health: "unhealthy" }, { scriptName: "lint", type: "script", hostname: "", port: null, lifecycle: "stopped", health: null }],
        }),
      ],
    });
    expect(list.get("w1")).toMatchObject({
      directory: "/repo/w1",
      branch: "fix/login",
      dirty: true,
      ahead: 2,
      behind: 1,
      diff: { additions: 4, deletions: 1 },
      labels: ["urgent"],
      pullRequest: { number: 12, url: "https://github.com/a/b/pull/12", state: "draft", checks: "failure", review: "approved" },
      services: [{ name: "web", port: 3000, running: true, healthy: false }],
    });
  });

  it("offers open workspaces matching a search, most recently used first", () => {
    const list = reduceWorkspaceInfo(new Map(), {
      snapshot: [descriptor("old", { lastUserMessageAt: "2026-11-01T00:00:00Z" }), descriptor("new", { lastUserMessageAt: "2026-11-10T00:00:00Z" }), descriptor("gone", { archivingAt: "x" })],
    });
    expect(workspaceChoices(list, "").map((item) => item.id)).toEqual(["new", "old"]);
    expect(workspaceChoices(list, "OLD-br").map((item) => item.id)).toEqual(["old"]);
  });
});
