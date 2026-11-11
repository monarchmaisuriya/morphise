import { describe, expect, it } from "vitest";
import { reduceWorkspaceInfo, workspaceChoices } from "./workspaces";

const descriptor = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `${id}-branch`, projectDisplayName: "Demo", archivingAt: null, lastUserMessageAt: null, ...extra });
const upsert = (workspace: unknown) => ({ message: { type: "workspace_update", payload: { kind: "upsert", workspace } } });

describe("workspace info", () => {
  it("keeps each workspace's name (its title when set), project and whether it is open", () => {
    const list = reduceWorkspaceInfo(new Map(), { snapshot: [descriptor("w1", { title: "Login fix" }), descriptor("w2", { archivingAt: "2026-11-11T10:00:00Z" })] });
    expect(list.get("w1")).toEqual({ id: "w1", name: "Login fix", project: "Demo", open: true, lastUsed: null });
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

  it("offers open workspaces matching a search, most recently used first", () => {
    const list = reduceWorkspaceInfo(new Map(), {
      snapshot: [descriptor("old", { lastUserMessageAt: "2026-11-01T00:00:00Z" }), descriptor("new", { lastUserMessageAt: "2026-11-10T00:00:00Z" }), descriptor("gone", { archivingAt: "x" })],
    });
    expect(workspaceChoices(list, "").map((item) => item.id)).toEqual(["new", "old"]);
    expect(workspaceChoices(list, "OLD-br").map((item) => item.id)).toEqual(["old"]);
  });
});
