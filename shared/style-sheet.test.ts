import { describe, expect, it } from "vitest";
import { buildChatWebCss, buildStyleSheet } from "./style-sheet";

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

describe("buildChatWebCss", () => {
  it("is empty with nothing chosen", () => {
    expect(buildChatWebCss(undefined)).toBe("");
    expect(buildChatWebCss({ replySize: 100 })).toBe("");
  });

  it("styles replies and prompts by Paseo's test ids", () => {
    const css = buildChatWebCss({ replySize: 120, boldColor: "#e64980", linkStyle: "dashed", clampPrompts: 6, codeFont: "Iosevka" });
    expect(css).toContain('[data-testid="assistant-message"] { zoom: 1.2; }');
    expect(css).toContain("color: #e64980 !important");
    expect(css).toContain("underline dashed");
    expect(css).toContain("-webkit-line-clamp: 6");
    expect(css).toContain('font-family: "Iosevka", ui-monospace, monospace');
  });
});
