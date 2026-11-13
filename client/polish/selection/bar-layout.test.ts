import { describe, expect, it } from "vitest";
import { polishPrefs } from "../../../shared/polish/prefs";
import { barItems, barTop } from "./bar-layout";

const prefs = (polish: NonNullable<NonNullable<Parameters<typeof polishPrefs>[0]>["polish"]>) => polishPrefs({ polish });
const shape = (items: ReturnType<typeof barItems>) => items.map((item) => (item.kind === "button" ? `${item.action}:${item.icon ?? ""}:${item.word ?? ""}` : "|"));

describe("selection bar buttons", () => {
  it("draws 0.16's bar by default: icons with words, words only for the copy formats, Bookmark as an icon", () => {
    expect(shape(barItems(prefs({})))).toEqual(["quote:quote:quote", "reply:reply:reply", "side:side:side", "|", "copy-text:copy:text", "copy-markdown:copy:markdown", "|", "bookmark:bookmark:"]);
  });

  it("drops every word for icons only, giving each copy format its own icon and every button an accessible name", () => {
    const items = barItems(prefs({ barButtons: "icons" }));
    expect(shape(items)).toEqual(["quote:quote:", "reply:reply:", "side:side:", "|", "copy-text:text:", "copy-markdown:markdown:", "|", "bookmark:bookmark:"]);
    for (const item of items) if (item.kind === "button") expect(item.label).toBeTruthy();
  });

  it("puts a divider only between two groups that both show, and nothing when the bar is off", () => {
    expect(shape(barItems(prefs({ selectionActions: ["copy", "bookmark"] })))).toEqual(["copy-text:copy:text", "copy-markdown:copy:markdown", "|", "bookmark:bookmark:"]);
    expect(shape(barItems(prefs({ selectionActions: ["reply"] })))).toEqual(["reply:reply:reply"]);
    expect(barItems(prefs({ selection: false }))).toEqual([]);
  });
});

describe("selection bar placement", () => {
  const line = { top: 300, bottom: 320 };
  it("sits on the chosen side of the line when it fits", () => {
    expect(barTop(line, 40, 800, "above", 8)).toBe(252);
    expect(barTop(line, 40, 800, "below", 8)).toBe(328);
  });

  it("flips to the other side when only that one fits, and stays inside the viewport when neither does", () => {
    expect(barTop({ top: 20, bottom: 40 }, 40, 800, "above", 8)).toBe(48);
    expect(barTop({ top: 760, bottom: 780 }, 40, 800, "below", 8)).toBe(712);
    expect(barTop({ top: 10, bottom: 790 }, 40, 800, "below", 8)).toBe(752);
  });
});
