import { describe, expect, it } from "vitest";
import { RUN_KIND } from "./row";

// Paseo refuses a timeline renderer whose kind is not a contribution id (app/src/plugins/evaluate.ts,
// CONTRIBUTION_ID); the daemon still writes the rows, which then show as "Plugin timeline item unavailable".
const CONTRIBUTION_ID = /^[a-z][a-z0-9-]*$/;

describe("run rows", () => {
  it("use a kind Paseo accepts for a timeline renderer", () => {
    expect(RUN_KIND).toMatch(CONTRIBUTION_ID);
  });
});
