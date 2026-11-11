import { describe, expect, it } from "vitest";
import { presetChange } from "./preset-change";

const spike = { id: "spike", label: "Spike", isolation: "worktree" as const, metadata: { kind: "spike", owner: "me" } };
const docs = { id: "docs", label: "Docs", metadata: { kind: "docs" } };

describe("presetChange", () => {
  it("applies the first preset's isolation and metadata", () => {
    expect(presetChange(null, spike, "local")).toEqual({ isolation: "worktree", metadata: { kind: "spike", owner: "me" } });
  });

  it("removes keys only the previous preset set, and restores the original isolation", () => {
    expect(presetChange(spike, docs, "local")).toEqual({ isolation: "local", metadata: { owner: null, kind: "docs" } });
  });

  it("undoes everything when switching back to no preset", () => {
    expect(presetChange(spike, null, "local")).toEqual({ isolation: "local", metadata: { kind: null, owner: null } });
  });
});
