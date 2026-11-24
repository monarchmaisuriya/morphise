import { expect, it } from "vitest";
import { sidebarStatusOptions, sidebarStatusSchema } from "./sidebar-status";
import { polishPrefs, polishSchema } from "./prefs";

it("loads saved sidebar choices through the real profile preference boundary", () => {
  const polish = polishSchema.parse({ sidebarStatus: { style: "paseo", states: { running: { color: "#123456", speed: "slow" } } } });
  expect((polishPrefs({ polish }) as unknown as { sidebarStatus: unknown }).sidebarStatus).toEqual({ style: "paseo", states: { running: { color: "#123456", speed: "slow" } } });
});

it("uses ring style and a separate recommended speed for every state", () => {
  expect(sidebarStatusOptions()).toEqual({ style: "ring", states: {
    loading: { color: undefined, speed: "medium" }, running: { color: undefined, speed: "fast" }, needs_input: { color: undefined, speed: "slow" },
    failed: { color: undefined, speed: "stopped" }, attention: { color: undefined, speed: "slow" }, done: { color: undefined, speed: "stopped" },
  } });
});

it("keeps host style and custom state values without modifying another state", () => {
  const options = sidebarStatusOptions({ style: "paseo", states: { running: { color: "#123abc", speed: "stopped" } } });
  expect(options.style).toBe("paseo");
  expect(options.states.running).toEqual({ color: "#123abc", speed: "stopped" });
  expect(options.states.failed).toEqual({ color: undefined, speed: "stopped" });
});

it.each([
  { states: { running: { color: "red; display:none" } } },
  { states: { running: { color: "#123" } } },
  { states: { running: { speed: "pulse" } } },
  { style: "unknown" },
])("rejects invalid saved sidebar configuration %j", (value) => {
  expect(sidebarStatusSchema.safeParse(value).success).toBe(false);
  expect(sidebarStatusOptions(value as never).style).toBe("ring");
});
