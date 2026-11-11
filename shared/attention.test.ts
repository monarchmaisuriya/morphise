import { describe, expect, it } from "vitest";
import { attentionOrder, NEEDS_ME, needsMeOn, nextAttention } from "./attention";

const refs = ["a", "b", "c"].map((key) => ({ key }));

describe("nextAttention", () => {
  it("opens the first one when none of them is open", () => {
    expect(nextAttention(refs, null)?.key).toBe("a");
    expect(nextAttention(refs, "elsewhere")?.key).toBe("a");
  });

  it("opens the one after the open one, wrapping around", () => {
    expect(nextAttention(refs, "a")?.key).toBe("b");
    expect(nextAttention(refs, "c")?.key).toBe("a");
  });

  it("has nothing to open when nothing needs attention, or only the open one does", () => {
    expect(nextAttention([], "a")).toBeNull();
    expect(nextAttention([{ key: "a" }], "a")).toBeNull();
  });
});

describe("needsMeOn", () => {
  it("is on only when the filter is exactly needs permission, failed and finished unread", () => {
    expect(NEEDS_ME).toEqual(["needs_input", "failed", "attention"]);
    expect(needsMeOn(["attention", "needs_input", "failed"])).toBe(true);
    expect(needsMeOn(["needs_input", "failed"])).toBe(false);
    expect(needsMeOn(["needs_input", "failed", "attention", "done"])).toBe(false);
  });
});

describe("attentionOrder", () => {
  it("follows the order the view shows, group by group, listing a workspace once", () => {
    const sections = [
      { items: [{ key: "a1" }, { key: "x" }, { key: "a2" }] },
      { items: [{ key: "b1" }, { key: "a1" }] },
    ];
    expect(attentionOrder(sections, new Set(["a1", "a2", "b1"])).map((ref) => ref.key)).toEqual(["a1", "a2", "b1"]);
  });
});
