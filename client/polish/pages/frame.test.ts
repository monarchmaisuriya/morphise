// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/html.test.mjs
import { describe, expect, it } from "vitest";
import { FRAME_SANDBOX, fitFrame, frameKey, frameLink, frameReport, frameShortcut, heightAt } from "./frame";

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
});
