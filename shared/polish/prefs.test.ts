import { describe, expect, it } from "vitest";
import { profileSchema } from "../profile";
import { POLISH_DEFAULTS, polishPrefs } from "./prefs";

describe("Chat Polish preferences from Morphise's profile", () => {
  it("leaves Paseo's look by default", () => {
    const prefs = polishPrefs(undefined);
    expect(prefs).toMatchObject({ nativeStyle: "paseo", windowStyle: "paseo", diagrams: "mermaid", html: "off", images: "native", imageStacks: "off", iconSet: "lucide", recap: "off", merge: "on", selection: "on", failedOpen: true });
    expect(prefs.selectionActions).toEqual(["quote", "reply", "side", "copy", "bookmark"]);
  });

  it("reads options Morphise already had from their Morphise keys", () => {
    const prefs = polishPrefs({ reasoning: "fold", commandColors: false, wrap: false, hideFinished: ["read", "shell", "fetch"], strength: "faded", density: "compact", recap: true, phones: "paseo", labels: "label" });
    expect(prefs).toMatchObject({ reasoning: "collapsed", commandColors: "expanded", diffWrap: "off", hidden: ["read", "fetch"], steps: "faded", density: "compact", recap: "on", phoneChat: "off" });
    expect(prefs.rowIcons).toEqual({ steps: "hide", tool: "hide", thought: "hide" });
  });

  it("reads the rest from chat.polish; a value it cannot read falls back alone, and an unknown key is kept", () => {
    expect(polishPrefs({ polish: { restyle: true, window: "floating", richText: { table: "d" }, html: true } })).toMatchObject({ nativeStyle: "design", windowStyle: "floating", html: "on", richText: { table: "d", quote: "a" } });
    const parse = (polish: unknown) => profileSchema.parse({ chat: { polish } }).chat?.polish;
    expect(parse({ loader: "orb", selectionActions: ["quote", "bookmark"] })).toEqual({ loader: "orb", selectionActions: ["quote", "bookmark"] });
    // A bad value drops only itself; the profile and every other choice still apply.
    expect(parse({ loader: "spinner", restyle: true })).toEqual({ restyle: true });
    expect(parse({ textPx: 40, codePx: 14 })).toEqual({ codePx: 14 });
    // A newer version's key survives, so saving here does not erase it.
    expect(parse({ fromNewerVersion: { a: 1 }, html: true })).toEqual({ fromNewerVersion: { a: 1 }, html: true });
    expect(profileSchema.parse({ chat: { polish: "not an object" } }).chat?.polish).toBeUndefined();
  });

  it("reads an unset option as the default the settings screens remove", () => {
    const prefs = polishPrefs(undefined);
    const onOff = (value: unknown) => (value ? "on" : "off");
    expect({
      merge: prefs.merge, failedOpen: prefs.failedOpen, images: prefs.images, imageStacks: prefs.imageStacks, imageStackOpen: prefs.imageStackOpen, selection: prefs.selection, restyle: prefs.nativeStyle, window: prefs.windowStyle, loader: prefs.loader, loaderSize: prefs.loaderSize, diagrams: prefs.diagrams, iconSet: prefs.iconSet, html: prefs.html, syntax: prefs.syntax,
      mergeMin: prefs.mergeMin, diffLineNumbers: prefs.diffLineNumbers, thoughtFirstLine: prefs.thoughtFirstLine, barButtons: prefs.barButtons, barPosition: prefs.barPosition, sideModel: prefs.sideModel, thumbCorners: prefs.thumbCorners, replyWidth: prefs.replyWidth, floatingRadius: prefs.floatingRadius, floatingGap: prefs.floatingGap, loaderColor: prefs.loaderColor, pageHeight: prefs.pageHeight,
      uiFont: prefs.uiFont, markdownStyle: prefs.markdownStyle, hoverPreviews: prefs.hoverPreviews, hoverDelay: prefs.hoverDelay, previewWrap: prefs.previewWrap, previewLineNumbers: prefs.previewLineNumbers, previewStripes: prefs.previewStripes, tableCopy: prefs.tableCopy, runButtons: prefs.runButtons,
      runOutput: prefs.runOutput, runLines: prefs.runLines, runPanelButtons: prefs.runPanelButtons, runCard: prefs.runCard,
    }).toEqual({
      merge: onOff(POLISH_DEFAULTS.merge), failedOpen: POLISH_DEFAULTS.failedOpen, images: POLISH_DEFAULTS.images, imageStacks: onOff(POLISH_DEFAULTS.imageStacks), imageStackOpen: POLISH_DEFAULTS.imageStackOpen, selection: onOff(POLISH_DEFAULTS.selection), restyle: POLISH_DEFAULTS.restyle ? "design" : "paseo", window: POLISH_DEFAULTS.window, loader: POLISH_DEFAULTS.loader, loaderSize: POLISH_DEFAULTS.loaderSize, diagrams: POLISH_DEFAULTS.diagrams, iconSet: POLISH_DEFAULTS.iconSet, html: onOff(POLISH_DEFAULTS.html), syntax: POLISH_DEFAULTS.syntax,
      mergeMin: POLISH_DEFAULTS.mergeMin, diffLineNumbers: POLISH_DEFAULTS.diffLineNumbers, thoughtFirstLine: POLISH_DEFAULTS.thoughtFirstLine, barButtons: POLISH_DEFAULTS.barButtons, barPosition: POLISH_DEFAULTS.barPosition, sideModel: POLISH_DEFAULTS.sideModel, thumbCorners: POLISH_DEFAULTS.thumbCorners, replyWidth: POLISH_DEFAULTS.replyWidth, floatingRadius: POLISH_DEFAULTS.floatingRadius, floatingGap: POLISH_DEFAULTS.floatingGap, loaderColor: POLISH_DEFAULTS.loaderColor, pageHeight: POLISH_DEFAULTS.pageHeight,
      uiFont: POLISH_DEFAULTS.uiFont, markdownStyle: POLISH_DEFAULTS.markdownStyle, hoverPreviews: POLISH_DEFAULTS.hoverPreviews, hoverDelay: POLISH_DEFAULTS.hoverDelay, previewWrap: POLISH_DEFAULTS.previewWrap, previewLineNumbers: POLISH_DEFAULTS.previewLineNumbers, previewStripes: POLISH_DEFAULTS.previewStripes, tableCopy: POLISH_DEFAULTS.tableCopy, runButtons: POLISH_DEFAULTS.runButtons,
      runOutput: POLISH_DEFAULTS.runOutput, runLines: POLISH_DEFAULTS.runLines, runPanelButtons: POLISH_DEFAULTS.runPanelButtons, runCard: POLISH_DEFAULTS.runCard,
    });
    // Run output: saved values are read back; a value outside the lists is dropped, so the default applies.
    expect(polishPrefs({ polish: { runOutput: "card", runLines: 40, runPanelButtons: "both", runCard: "hidden" } })).toMatchObject({ runOutput: "card", runLines: 40, runPanelButtons: "both", runCard: "hidden" });
    expect(profileSchema.parse({ chat: { polish: { runLines: 12, runCard: "line" } } }).chat?.polish).toEqual({ runCard: "line" });
    // Exact sizes are unset by default, so rows keep following the step sizes.
    expect([prefs.textPx, prefs.codePx]).toEqual([null, null]);
  });
});
