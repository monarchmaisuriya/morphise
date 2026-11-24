import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
import { sidebarStatusCss } from "./sidebar-status";

it("leaves host indicators untouched in Paseo mode", () => {
  expect(sidebarStatusCss({ style: "paseo" })).toBe("");
});

it("scopes preview rules separately from sidebar rules", () => {
  expect(sidebarStatusCss({}, "preview")).toContain('[data-testid="morphise-status-preview-running"]');
  expect(sidebarStatusCss({}, "preview")).not.toContain("sidebar-workspace-row-");
  expect(sidebarStatusCss()).not.toContain("morphise-status-preview-");
  expect(sidebarStatusCss()).toContain('[data-testid^="sidebar-workspace-row-"] [data-testid="workspace-status-indicator-running"]');
  expect(sidebarStatusCss({ states: { running: { speed: "slow", color: "#123456" } } })).toContain("3200ms linear infinite");
  expect(sidebarStatusCss()).toContain("prefers-reduced-motion: reduce");
  expect(sidebarStatusCss()).not.toContain("pulse");
});
