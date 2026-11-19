import { describe, expect, it } from "vitest";
import { guideText } from "./guide";

describe("report authoring guidance", () => {
  it.each(["charts", "tables"])("gives %s a shared section rhythm and keeps table filters grouped", (topic) => {
    const guide = guideText(topic);
    expect(guide.known).toBe(true);
    expect(guide.text).toContain('class="report"');
    expect(guide.text).toContain('class="report-heading"');
    expect(guide.text).toContain('class="report-data"');
    expect(guide.text).toContain("24px between sections");
    expect(guide.text).toContain("plain div around each supporting table");
  });
});
