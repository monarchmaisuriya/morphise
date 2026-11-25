import { expect, it } from "vitest";
import { RUNTIME_HOUR as H, runtimePoints, workspaceRuntime } from "./sidebar-runtime";
import type { WorkInterval } from "./work-calendar";

const base: WorkInterval = { id: "a", agentId: "a", workspaceId: "w", provider: "fake", title: "Task", turnId: "turn", startAt: 0, endAt: H, uncertain: false, outcome: "completed" };

it("clips runtime to rolling24h bins and sums parallel agents without counting uncertainty", () => {
  const values = workspaceRuntime([base, { ...base, id: "b", startAt: H / 2, endAt: H * 1.5 }, { ...base, id: "u", uncertain: true }, { ...base, id: "other", workspaceId: "other" }], H * 24);
  expect(values.get("w")?.bins.slice(0, 3)).toEqual([H * 1.5, H / 2, 0]);
  expect(values.get("w")?.total).toBe(H * 2);
  expect(values.get("w")?.uncertain).toBe(true);
  expect(values.get("other")?.total).toBe(H);
});

it("clips running and old observations without granting future runtime", () => {
  const values = workspaceRuntime([{ ...base, startAt: 0, endAt: H * 2 }, { ...base, id: "run", startAt: H * 24.5, endAt: null }, { ...base, id: "future", startAt: H * 26, endAt: H * 27 }], H * 25);
  expect(values.get("w")?.total).toBe(H * 1.5);
  expect(values.get("w")?.bins[0]).toBe(H);
  expect(values.get("w")?.bins[23]).toBe(H / 2);
});

it("normalizes the strip per workspace and leaves known-zero samples flat", () => {
  expect(runtimePoints([0, 10, 0], 64, 16)).toEqual([{ x: 0, y: 15 }, { x: 32, y: 1 }, { x: 64, y: 15 }]);
  expect(runtimePoints([0, 0], 64, 16)).toEqual([{ x: 0, y: 15 }, { x: 64, y: 15 }]);
});

it("keeps uncertain-only observations distinct from absent confirmed runtime", () => {
  const value = workspaceRuntime([{ ...base, uncertain: true, endAt: 0 }], H * 24).get("w");
  expect(value?.uncertain).toBe(true);
  expect(value?.total).toBe(0);
});
