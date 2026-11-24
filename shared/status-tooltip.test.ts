import { expect, it } from "vitest";
import { statusTooltip } from "./status-tooltip";

it("explains known state timing and never substitutes an activity timestamp", () => {
  expect(statusTooltip("running", "Tests running", "2026-11-24T00:00:00Z", Date.parse("2026-11-24T00:02:00Z"))).toContain("Tests running · Time in state: 2 min");
  expect(statusTooltip("done", null, null, 1000)).toContain("Time in state: unavailable");
  expect(statusTooltip("failed", null, "invalid", 1000)).toContain("Time in state: unavailable");
});
