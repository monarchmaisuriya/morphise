import { describe, expect, it } from "vitest";
import { buildStyleSheet } from "./style-sheet";

describe("buildStyleSheet", () => {
  it("produces nothing while the style layer is off", () => {
    expect(buildStyleSheet({ enabled: false, hideTestIds: ["sidebar-help"], css: "body{}" })).toBe("");
  });

  it("hides each listed test id and appends the user's CSS", () => {
    expect(buildStyleSheet({ enabled: true, hideTestIds: ["sidebar-help", "sidebar-schedules"], css: "body { opacity: 1 }" })).toBe(
      [
        '[data-testid="sidebar-help"] { display: none !important; }',
        '[data-testid="sidebar-schedules"] { display: none !important; }',
        "body { opacity: 1 }",
      ].join("\n"),
    );
  });

  it("produces nothing when enabled with nothing to apply", () => {
    expect(buildStyleSheet({ enabled: true, hideTestIds: [], css: "  " })).toBe("");
  });
});
