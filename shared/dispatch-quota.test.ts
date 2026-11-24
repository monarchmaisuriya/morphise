import { expect, it } from "vitest";
import { dispatchQuota } from "./dispatch-quota";

it("uses fresh exact-provider windows and not other provider data", () => {
  expect(dispatchQuota({ fetchedAt: "2026-11-24T00:00:00Z", providers: [{ providerId: "claude", displayName: "Claude", status: "available", fetchedAt: "2026-11-24T00:00:00Z", windows: [{ label: "5h", remainingPct: 15 }] }] }, "claude", Date.parse("2026-11-24T00:01:00Z"))).toMatchObject({ kind: "available", used: 85 });
});

it.each([
  { fetchedAt: "2026-11-23T00:00:00Z", windows: [{ label: "5h", usedPct: 90 }] },
  { fetchedAt: "2026-11-24T00:00:00Z", windows: [{ label: "5h", usedPct: 90, remainingPct: 30 }] },
  { fetchedAt: "2026-11-24T00:00:00Z", windows: [{ label: "5h", usedPct: 101 }] },
])("does not trust stale, inconsistent or invalid usage %j", (value) => {
  expect(dispatchQuota({ fetchedAt: "2026-11-24T00:00:00Z", providers: [{ providerId: "claude", displayName: "Claude", status: "available", ...value }] }, "claude", Date.parse("2026-11-24T00:01:00Z"))).toMatchObject({ kind: "unavailable" });
});
it("does not let a fresh envelope make undated provider usage current", () => {
  expect(dispatchQuota({ fetchedAt: "2026-11-24T00:00:00Z", providers: [{ providerId: "claude", displayName: "Claude", status: "available", windows: [{ label: "5h", usedPct: 90 }] }] }, "claude", Date.parse("2026-11-24T00:01:00Z"))).toMatchObject({ kind: "unavailable" });
});
