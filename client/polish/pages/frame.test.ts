// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/html.test.mjs
import { describe, expect, it } from "vitest";
import { ASK_EVERY_MS, ASK_MAX, askAllowed, FRAME_SANDBOX, fitFrame, frameKey, frameLink, frameMessage, frameReport, frameShortcut, heightAt, limitFrameHeight, recentPages } from "./frame";

describe("the page frame", () => {
  it("never gets the app's origin", () => {
    expect(FRAME_SANDBOX).not.toMatch(/allow-same-origin/);
  });

  it("reads a height between and beyond the widths the daemon measured", () => {
    const heights = [[360, 900], [700, 500], [1000, 400]] as const;
    expect(heightAt(heights, 700)).toBe(500);
    expect(heightAt(heights, 530)).toBe(700);
    expect(heightAt(heights, 320)).toBe(900);
    expect(heightAt(heights, 1400)).toBe(400);
  });

  it("reads keys and links only in their own shape, and opens only http(s) links", () => {
    expect(frameKey({ type: "cp-html-key", key: "k", code: "KeyK", metaKey: true })).toEqual({ key: "k", code: "KeyK", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false });
    expect(frameKey({ type: "cp-html-key", key: 1, code: "x" })).toBeUndefined();
    expect(frameLink({ type: "cp-html-link", url: "https://paseo.sh/docs" })).toBe("https://paseo.sh/docs");
    expect(frameLink({ type: "cp-html-link", url: "javascript:alert(1)" })).toBeUndefined();
    expect(frameLink({ type: "cp-html-link", url: "file:///etc/passwd" })).toBeUndefined();
  });

  it("passes on only Mod+K, with the platform's Mod, rebuilt rather than copied from the page", () => {
    const key = (k: string, code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>>) => frameKey({ type: "cp-html-key", key: k, code, ...mods })!;
    const commandCenterMac = { key: "k", code: "KeyK", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(frameShortcut(key("k", "KeyK", { metaKey: true }), true)).toEqual(commandCenterMac);
    expect(frameShortcut(key("K", "KeyK", { metaKey: true }), true)).toEqual(commandCenterMac);
    expect(frameShortcut(key("k", "KeyK", { ctrlKey: true }), false)).toEqual({ ...commandCenterMac, metaKey: false, ctrlKey: true });
    // The other platform's Mod, or both.
    expect(frameShortcut(key("k", "KeyK", { ctrlKey: true }), true)).toBeUndefined();
    expect(frameShortcut(key("k", "KeyK", { metaKey: true }), false)).toBeUndefined();
    expect(frameShortcut(key("k", "KeyK", { metaKey: true, ctrlKey: true }), true)).toBeUndefined();
    // Archive workspace, close tab, interrupt, new chat: never.
    expect(frameShortcut(key("Backspace", "Backspace", { metaKey: true, shiftKey: true }), true)).toBeUndefined();
    expect(frameShortcut(key("w", "KeyW", { metaKey: true }), true)).toBeUndefined();
    expect(frameShortcut(key("Escape", "Escape", {}), true)).toBeUndefined();
    expect(frameShortcut(key("n", "KeyN", { metaKey: true }), true)).toBeUndefined();
    // Mod+K with more modifiers is another shortcut.
    expect(frameShortcut(key("k", "KeyK", { metaKey: true, shiftKey: true }), true)).toBeUndefined();
    expect(frameShortcut(key("k", "KeyK", { metaKey: true, altKey: true }), true)).toBeUndefined();
    // A forged pairing of a harmless key with another key's code.
    expect(frameShortcut(key("k", "KeyW", { metaKey: true }), true)).toBeUndefined();
  });

  it("counts only the frame's own height message, capped", () => {
    expect(frameReport({ type: "cp-html-height", height: 321, width: 728 })).toEqual({ height: 321, width: 728 });
    expect(frameReport({ type: "cp-html-height", height: 1e9, width: 728 })?.height).toBe(20000);
    expect(frameReport({ type: "cp-html-height", height: -1 })).toBeUndefined();
    expect(frameReport({ type: "other", height: 10 })).toBeUndefined();
    expect(frameReport(null)).toBeUndefined();
  });

  it("grows at once, never shrinks at the same width, and follows a new width down once the page settles", () => {
    const at = { height: 229, width: 728 };
    expect(fitFrame(at, { height: 300, width: 728 })).toEqual({ height: 300, later: false });
    // An animation cycling 229 → 188 → 229 leaves the frame alone.
    expect(fitFrame(at, { height: 188, width: 728 })).toBeUndefined();
    expect(fitFrame(at, { height: 229, width: 728 })).toBeUndefined();
    expect(fitFrame(at, { height: 150, width: 1200 })).toEqual({ height: 150, later: true });
    expect(fitFrame(at, { height: 400, width: 360 })).toEqual({ height: 400, later: false });
  });

  it("stops the frame at the page height limit, and never with no limit", () => {
    expect(limitFrameHeight(1200, 800)).toBe(800);
    expect(limitFrameHeight(640, 800)).toBe(640);
    expect(limitFrameHeight(1200, 500)).toBe(500);
    expect(limitFrameHeight(5000, 0)).toBe(5000);
  });

  it("hears only its own frame, and opens links or passes keys on only while the frame has focus", () => {
    const link = { type: "cp-html-link", url: "https://paseo.sh" };
    const commandCenter = { type: "cp-html-key", key: "k", code: "KeyK", metaKey: true };
    const escape = { type: "cp-html-key", key: "Escape", code: "Escape" };
    const height = { type: "cp-html-height", height: 300, width: 700 };
    const focused = { own: true, focused: true, mac: true };
    expect(frameMessage(link, focused)).toEqual({ kind: "link", url: "https://paseo.sh" });
    expect(frameMessage(commandCenter, focused)).toEqual({ kind: "shortcut", key: { key: "k", code: "KeyK", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } });
    expect(frameMessage(escape, focused)).toEqual({ kind: "escape" });
    expect(frameMessage(height, focused)).toEqual({ kind: "report", report: { height: 300, width: 700 } });
    // Another window (another frame, or the app itself) is never heard, focused or not.
    for (const data of [link, commandCenter, escape, height]) expect(frameMessage(data, { ...focused, own: false })).toBeUndefined();
    // A page's script can post at any time: unfocused, links and keys go nowhere, while its height still counts.
    const unfocused = { ...focused, focused: false };
    expect(frameMessage(link, unfocused)).toBeUndefined();
    expect(frameMessage(commandCenter, unfocused)).toBeUndefined();
    expect(frameMessage(escape, unfocused)).toBeUndefined();
    expect(frameMessage(height, unfocused)).toEqual({ kind: "report", report: { height: 300, width: 700 } });
    // A key that is no allowed shortcut goes nowhere even when focused.
    expect(frameMessage({ type: "cp-html-key", key: "w", code: "KeyW", metaKey: true }, focused)).toBeUndefined();
  });

  it("remembers values for the most recently used pages only, by a short key rather than the page itself", () => {
    const pages = recentPages<number>(3);
    pages.set("<p>one</p>", 1);
    pages.set("<p>two</p>", 2);
    pages.set("<p>three</p>", 3);
    // Reading a page makes it recent, so the next one in drops "two", the least recently used.
    expect(pages.get("<p>one</p>")).toBe(1);
    pages.set("<p>four</p>", 4);
    expect(pages.get("<p>two</p>")).toBeUndefined();
    expect([pages.get("<p>one</p>"), pages.get("<p>three</p>"), pages.get("<p>four</p>")]).toEqual([1, 3, 4]);
    // Setting a page again replaces its value instead of adding a second entry.
    pages.set("<p>four</p>", 40);
    pages.set("<p>five</p>", 5);
    expect(pages.get("<p>one</p>")).toBeUndefined();
    expect([pages.get("<p>three</p>"), pages.get("<p>four</p>"), pages.get("<p>five</p>")]).toEqual([3, 40, 5]);
    // Pages of the same length but different text are different pages.
    pages.set("<p>abc</p>", 7);
    expect(pages.get("<p>abd</p>")).toBeUndefined();
  });
});

describe("asks and SVG exports from a page", () => {
  const ask = { type: "cp-html-ask", text: "  Break Q3 down by week  " };
  const from = { own: true, focused: true, mac: true, activated: true };
  it("fills the message box only for the page's own focused frame, right after a click", () => {
    expect(frameMessage(ask, from)).toEqual({ kind: "ask", text: "Break Q3 down by week" });
    expect(frameMessage(ask, { ...from, activated: false })).toBeUndefined();
    expect(frameMessage(ask, { ...from, focused: false })).toBeUndefined();
    expect(frameMessage(ask, { ...from, own: false })).toBeUndefined();
    expect(frameMessage({ ...ask, text: "   " }, from)).toBeUndefined();
    expect((frameMessage({ ...ask, text: "x".repeat(5000) }, from) as { text: string }).text).toHaveLength(ASK_MAX);
  });
  it("takes back an exported SVG, or null for a page without one or anything else", () => {
    expect(frameMessage({ type: "cp-html-svg", id: "1", svg: "<svg viewBox='0 0 1 1'></svg>" }, { ...from, focused: false })).toEqual({ kind: "svg", id: "1", svg: "<svg viewBox='0 0 1 1'></svg>" });
    expect(frameMessage({ type: "cp-html-svg", id: "1", svg: "<script>x</script>" }, from)).toEqual({ kind: "svg", id: "1", svg: null });
    expect(frameMessage({ type: "cp-html-svg", id: "1", svg: null }, from)).toEqual({ kind: "svg", id: "1", svg: null });
  });
});

describe("askAllowed", () => {
  it("allows one ask per activation window and no repeat of the same text within a minute", () => {
    expect(askAllowed("a", 0, null)).toBe(true);
    expect(askAllowed("b", ASK_EVERY_MS - 1, { at: 0, text: "a" })).toBe(false);
    expect(askAllowed("b", ASK_EVERY_MS, { at: 0, text: "a" })).toBe(true);
    expect(askAllowed("a", ASK_EVERY_MS, { at: 0, text: "a" })).toBe(false);
    expect(askAllowed("a", 60_000, { at: 0, text: "a" })).toBe(true);
  });
});
