import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
import { sidebarStatusCss } from "./sidebar-status";

it("leaves host indicators untouched in Paseo mode", () => {
  expect(sidebarStatusCss({ style: "paseo" })).toBe("");
});

it("preserves native slot alignment even when legacy full-row alignment was saved", () => {
  const css = sidebarStatusCss({}, "sidebar", { alignment: "bottom", size: 24 });
  expect(css).not.toContain("align-self: stretch");
  expect(css).not.toContain("height: auto");
  expect(css).toContain("top: 50%");
});

it("scopes preview rules separately from sidebar rules", () => {
  expect(sidebarStatusCss({}, "preview")).toContain('[data-testid="morphise-status-preview-running"]');
  expect(sidebarStatusCss({}, "preview")).not.toContain("sidebar-workspace-row-");
  expect(sidebarStatusCss()).not.toContain("morphise-status-preview-");
  expect(sidebarStatusCss()).toContain('[data-testid^="sidebar-workspace-row-"] [data-testid="workspace-status-indicator-running"]');
  expect(sidebarStatusCss({ states: { running: { speed: "slow", color: "#123456" } } })).toContain("3200ms linear infinite");
  expect(sidebarStatusCss()).toContain("prefers-reduced-motion: reduce");
  expect(sidebarStatusCss()).not.toContain("pulse");
  expect(sidebarStatusCss()).toContain("width: 6px; height: 6px");
  expect(sidebarStatusCss()).toContain("width: 12px; height: 12px");
  expect(sidebarStatusCss()).toContain("transparent 4.5px, #000 4.5px");
  expect(sidebarStatusCss()).toContain("var(--colors-status-dot-running");
});

it("ignores old size and color choices and always hides Done's ring", () => {
  const css = sidebarStatusCss({ states: { done: { speed: "fast", color: "#123456" } } }, "sidebar", { size: 24 });
  expect(css).not.toContain("#123456");
  expect(css).not.toContain("24px");
  expect(css).toMatch(/morphise-sidebar-status-done.*::after[^\n]*display: none/);
});
