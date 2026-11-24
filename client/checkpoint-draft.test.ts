import { expect, it } from "vitest";
import { createCheckpointDrafts } from "./checkpoint-draft";
import { EMPTY_CHECKPOINT } from "../shared/work-checkpoints";

it("retains the original revision with a dirty session draft until explicitly cleared", () => {
  const drafts = createCheckpointDrafts();
  drafts.set("workspace", { baseline: { workspaceId: "workspace", revision: 2, fields: EMPTY_CHECKPOINT, author: "user", updatedAt: null }, fields: { ...EMPTY_CHECKPOINT, goal: "Draft" } });
  expect(drafts.get("workspace")).toMatchObject({ baseline: { revision: 2 }, fields: { goal: "Draft" } });
  expect(drafts.get("other")).toBeUndefined();
  drafts.clear("workspace");
  expect(drafts.get("workspace")).toBeUndefined();
});

it("does not let an older save clear a newer navigation draft", () => {
  const drafts = createCheckpointDrafts();
  const baseline = { workspaceId: "workspace", revision: 2, fields: EMPTY_CHECKPOINT, author: "user", updatedAt: null };
  const submitted = { baseline, fields: { ...EMPTY_CHECKPOINT, goal: "Submitted" } };
  drafts.set("workspace", submitted);
  drafts.set("workspace", { baseline, fields: { ...EMPTY_CHECKPOINT, goal: "Newer edit" } });
  drafts.saved("workspace", submitted, { ...baseline, revision: 3, fields: submitted.fields });
  expect(drafts.get("workspace")).toMatchObject({ baseline: { revision: 3 }, fields: { goal: "Newer edit" } });
});
