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

  it("reads the rest from chat.polish, and the profile accepts only known values", () => {
    expect(polishPrefs({ polish: { restyle: true, window: "floating", richText: { table: "d" }, html: true } })).toMatchObject({ nativeStyle: "design", windowStyle: "floating", html: "on", richText: { table: "d", quote: "a" } });
    const parse = (polish: unknown) => profileSchema.safeParse({ chat: { polish } }).success;
    expect(parse({ loader: "orb", selectionActions: ["quote", "bookmark"] })).toBe(true);
    expect(parse({ loader: "spinner" })).toBe(false);
    expect(parse({ unknown: true })).toBe(false);
  });

  it("reads an unset option as the default the settings screens remove", () => {
    const prefs = polishPrefs(undefined);
    const onOff = (value: unknown) => (value ? "on" : "off");
    expect({
      merge: prefs.merge, failedOpen: prefs.failedOpen, images: prefs.images, imageStacks: prefs.imageStacks, imageStackOpen: prefs.imageStackOpen, selection: prefs.selection, restyle: prefs.nativeStyle, window: prefs.windowStyle, loader: prefs.loader, loaderSize: prefs.loaderSize, diagrams: prefs.diagrams, iconSet: prefs.iconSet, html: prefs.html, syntax: prefs.syntax,
      mergeMin: prefs.mergeMin, diffLineNumbers: prefs.diffLineNumbers, thoughtFirstLine: prefs.thoughtFirstLine, barButtons: prefs.barButtons, barPosition: prefs.barPosition, sideModel: prefs.sideModel, thumbCorners: prefs.thumbCorners, replyWidth: prefs.replyWidth, floatingRadius: prefs.floatingRadius, floatingGap: prefs.floatingGap, loaderColor: prefs.loaderColor, pageHeight: prefs.pageHeight,
    }).toEqual({
      merge: onOff(POLISH_DEFAULTS.merge), failedOpen: POLISH_DEFAULTS.failedOpen, images: POLISH_DEFAULTS.images, imageStacks: onOff(POLISH_DEFAULTS.imageStacks), imageStackOpen: POLISH_DEFAULTS.imageStackOpen, selection: onOff(POLISH_DEFAULTS.selection), restyle: POLISH_DEFAULTS.restyle ? "design" : "paseo", window: POLISH_DEFAULTS.window, loader: POLISH_DEFAULTS.loader, loaderSize: POLISH_DEFAULTS.loaderSize, diagrams: POLISH_DEFAULTS.diagrams, iconSet: POLISH_DEFAULTS.iconSet, html: onOff(POLISH_DEFAULTS.html), syntax: POLISH_DEFAULTS.syntax,
      mergeMin: POLISH_DEFAULTS.mergeMin, diffLineNumbers: POLISH_DEFAULTS.diffLineNumbers, thoughtFirstLine: POLISH_DEFAULTS.thoughtFirstLine, barButtons: POLISH_DEFAULTS.barButtons, barPosition: POLISH_DEFAULTS.barPosition, sideModel: POLISH_DEFAULTS.sideModel, thumbCorners: POLISH_DEFAULTS.thumbCorners, replyWidth: POLISH_DEFAULTS.replyWidth, floatingRadius: POLISH_DEFAULTS.floatingRadius, floatingGap: POLISH_DEFAULTS.floatingGap, loaderColor: POLISH_DEFAULTS.loaderColor, pageHeight: POLISH_DEFAULTS.pageHeight,
    });
  });
});
