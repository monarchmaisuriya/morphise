import { describe, expect, it, vi } from "vitest";
import { polishPrefs } from "../../shared/polish/prefs";
import { centeredMetrics } from "./web/control-font";
import { optionVariables } from "./web/restyle-css";
import { registerWeb, rootChoices } from "./web.register";

const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));

describe("Paseo page restyle", () => {
  it("does nothing outside the browser", () => {
    platform.OS = "ios";
    // Any use of the client would throw on this empty object.
    const stop = registerWeb({ client: {} } as Parameters<typeof registerWeb>[0]);
    expect(stop).toBeTypeOf("function");
    stop();
    platform.OS = "web";
  });

  it("keeps image stacks and the window style off while Paseo's own look is chosen", () => {
    const paseo = rootChoices(polishPrefs({ polish: { imageStacks: true, window: "floating" } }));
    expect(paseo.stacks).toBe("off");
    expect(paseo.window).toBe("a");
    const design = rootChoices(polishPrefs({ polish: { restyle: true, imageStacks: true, window: "floating" } }));
    expect(design.stacks).toBe("on");
    expect(design.window).toBe("floating");
  });

  it("writes no attribute for each default, so <html> stays as Paseo drew it", () => {
    const choices = rootChoices(polishPrefs(undefined));
    const written = Object.entries(choices).filter(([, value]) => value !== "a");
    // Images and the hover opening are read by the image stacks part, so they are always written.
    expect(Object.fromEntries(written)).toEqual({ images: "native", stacks: "off", stackopen: "hover", steps: "full" });
  });
});

describe("restyle options on <html>", () => {
  const restyle = (polish: NonNullable<NonNullable<Parameters<typeof polishPrefs>[0]>["polish"]>) => rootChoices(polishPrefs({ polish: { restyle: true, ...polish } }));

  it("writes nothing at each default, with the restyle on or off, so 0.16's look stays", () => {
    for (const choices of [restyle({}), rootChoices(polishPrefs(undefined))]) {
      expect([choices.width, choices["float-radius"], choices["float-gap"], choices["loader-color"], choices.thumbs]).toEqual(["a", "a", "a", "a", "a"]);
      expect(optionVariables(choices)).toEqual({});
    }
  });

  it("writes each chosen value only while the restyle is on", () => {
    const chosen = { replyWidth: "narrow", floatingRadius: 16, floatingGap: 4, loaderColor: "muted", thumbCorners: "square" } as const;
    expect(restyle(chosen)).toMatchObject({ width: "narrow", "float-radius": "16", "float-gap": "4", "loader-color": "muted", thumbs: "square" });
    const off = rootChoices(polishPrefs({ polish: chosen }));
    expect([off.width, off["float-radius"], off["float-gap"], off["loader-color"], off.thumbs]).toEqual(["a", "a", "a", "a", "a"]);
  });

  it("gives a preview the same variables the stylesheet sets", () => {
    expect(optionVariables(restyle({ replyWidth: "full", floatingRadius: 8, floatingGap: 12, loaderColor: "text", thumbCorners: "square" }))).toEqual({
      "--cp-reply-width": "none",
      "--cp-float-radius": "8px",
      "--cp-float-gap": "12px",
      "--cp-loader-color": "var(--cp-fg)",
      "--cp-thumb-radius": "0px",
    });
    expect(optionVariables(restyle({ replyWidth: "wide" }))).toEqual({ "--cp-reply-width": "960px" });
  });
});

// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/web.test.mjs ("controlFontMetrics")
describe("control font", () => {
  it("lifts Berkeley Mono to SF's offset with the same line box, and leaves SF and SF Pro alone", () => {
    const fix = centeredMetrics({ ascent: 1.048, descent: 0.246, capHeight: 0.68 })!;
    expect(Math.abs(fix.ascent - 1.013)).toBeLessThan(0.001);
    expect(Math.abs(fix.ascent + fix.descent - 1.294)).toBeLessThan(1e-9);
    expect(centeredMetrics({ ascent: 0.967, descent: 0.211, capHeight: 0.705 })).toBeUndefined();
    expect(centeredMetrics({ ascent: 0.952, descent: 0.241, capHeight: 0.705 })).toBeUndefined();
  });
});
