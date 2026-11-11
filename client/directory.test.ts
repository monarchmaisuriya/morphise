import { describe, expect, it } from "vitest";
import { EMPTY_DIRECTORY, reduceAgents, reduceWorkspaces } from "./directory";

describe("directory", () => {
  it("replaces workspaces from a snapshot and follows upserts and removals", () => {
    let workspaces = reduceWorkspaces(EMPTY_DIRECTORY.workspaces, { snapshot: [{ id: "w1" }, { id: "w2" }] });
    workspaces = reduceWorkspaces(workspaces, { message: { type: "workspace_update", payload: { kind: "upsert", workspace: { id: "w3" } } } });
    workspaces = reduceWorkspaces(workspaces, { message: { type: "workspace_update", payload: { kind: "remove", id: "w1" } } });
    expect(workspaces).toEqual(["w2", "w3"]);
  });

  it("keeps the same list when an upsert changes nothing it tracks", () => {
    const workspaces = reduceWorkspaces(EMPTY_DIRECTORY.workspaces, { snapshot: [{ id: "w1" }] });
    const next = reduceWorkspaces(workspaces, { message: { type: "workspace_update", payload: { kind: "upsert", workspace: { id: "w1" } } } });
    expect(next).toBe(workspaces);
  });

  it("ignores messages about other things", () => {
    const workspaces = reduceWorkspaces(EMPTY_DIRECTORY.workspaces, { snapshot: [{ id: "w1" }] });
    expect(reduceWorkspaces(workspaces, { message: { type: "agent_update", payload: {} } })).toBe(workspaces);
  });

  it("tracks agents with their workspace and drops agents without one", () => {
    let agents = reduceAgents(EMPTY_DIRECTORY.agents, {
      snapshot: [{ agent: { id: "a1", workspaceId: "w1" } }, { agent: { id: "a2" } }],
    });
    agents = reduceAgents(agents, { message: { type: "agent_update", payload: { kind: "upsert", agent: { id: "a3", workspaceId: "w2" } } } });
    agents = reduceAgents(agents, { message: { type: "agent_update", payload: { kind: "remove", agentId: "a1" } } });
    expect(agents).toEqual([{ id: "a3", workspaceId: "w2" }]);
  });

  it("moves an agent whose workspace changed", () => {
    const agents = reduceAgents(EMPTY_DIRECTORY.agents, { snapshot: [{ agent: { id: "a1", workspaceId: "w1" } }] });
    expect(
      reduceAgents(agents, { message: { type: "agent_update", payload: { kind: "upsert", agent: { id: "a1", workspaceId: "w9" } } } }),
    ).toEqual([{ id: "a1", workspaceId: "w9" }]);
  });
});
