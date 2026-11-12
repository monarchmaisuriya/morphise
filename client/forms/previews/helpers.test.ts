import { describe, expect, it } from "vitest";
import { polishPrefs } from "../../../shared/polish/prefs";
import { loaderTint, mockTheme, pageHeightNote, promptClampLines, replyColumnShare, shownRichText, stepsPlacement, syntaxShown } from "./helpers";

const host = { colors: { surface0: "#101010", surface1: "#181818", surface2: "#202020", border: "#303030", foreground: "#eeeeee", foregroundMuted: "#999999", accent: "#3fb68b", accentForeground: "#101010", statusSuccess: "#00aa00", statusWarning: "#aaaa00", statusDanger: "#aa0000" } };

describe("look mock", () => {
  it("widens the chat column from narrow to full", () => {
    const shares = (["narrow", "paseo", "wide", "full"] as const).map(replyColumnShare);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    expect(replyColumnShare("full")).toBe(1);
  });

  it("tints the loader with the chosen theme colour", () => {
    expect(loaderTint("accent", host.colors)).toBe("#3fb68b");
    expect(loaderTint("text", host.colors)).toBe("#eeeeee");
    expect(loaderTint("muted", host.colors)).toBe("#999999");
  });

  it("draws in the app's theme without a profile theme", () => {
    expect(mockTheme(host, null)).toEqual({ theme: host, sidebar: "#101010" });
  });

  it("draws in the profile's theme, with its sidebar colour and the app's accent when it has none", () => {
    const profileTheme = { name: "Paper", appearance: "light" as const, colors: { background: "#ffffff", foreground: "#111111", raised: "#f4f4f4", control: "#eeeeee", border: "#dddddd", mutedForeground: "#666666", ring: "#aaaaaa" }, sidebar: "#f0f0f0" };
    const { theme, sidebar } = mockTheme(host, profileTheme);
    expect(sidebar).toBe("#f0f0f0");
    expect(theme.colors).toMatchObject({ surface0: "#ffffff", surface1: "#f4f4f4", surface2: "#eeeeee", foreground: "#111111", foregroundMuted: "#666666", accent: "#3fb68b", statusDanger: "#aa0000" });
    expect(mockTheme(host, { ...profileTheme, sidebar: undefined }).sidebar).toBe("#ffffff");
  });

  it("shows code plain for the plain choice and for a palette made for the other appearance", () => {
    expect(syntaxShown("one-dark", "#1e2227")).toBe("colours");
    expect(syntaxShown("one-dark", "#ffffff")).toBe("other-appearance");
    expect(syntaxShown("github-light", "#ffffff")).toBe("colours");
    expect(syntaxShown("plain", "#1e2227")).toBe("plain");
  });
});

describe("messages mock", () => {
  it("clamps prompts only when a clamp is set", () => {
    expect(promptClampLines(undefined)).toBeNull();
    expect(promptClampLines({ web: {} })).toBeNull();
    expect(promptClampLines({ web: { clampPrompts: 4 } })).toBe(4);
  });

  it("shows the chosen rich text only while Paseo is restyled", () => {
    const chat = { polish: { richText: { quote: "b" as const, table: "d" as const } } };
    expect(shownRichText(polishPrefs(chat))).toMatchObject({ quote: "a", table: "a" });
    expect(shownRichText(polishPrefs({ polish: { ...chat.polish, restyle: true } }))).toMatchObject({ quote: "b", table: "d" });
  });
});

describe("steps and pages mocks", () => {
  it("places the steps card in the chat or the sidebar, naming the chat for a whole workspace", () => {
    expect(stepsPlacement({ position: "chat", scope: "open" })).toMatchObject({ inline: true, title: null });
    expect(stepsPlacement({ position: "bottom", scope: "open" })).toMatchObject({ inline: false, label: "At the bottom of the sidebar", title: null });
    expect(stepsPlacement({ position: "top", scope: "workspace" }).title).not.toBeNull();
  });

  it("words the page height limit", () => {
    expect(pageHeightNote(500)).toContain("500 px");
    expect(pageHeightNote(0)).toBe("Pages show at their full height.");
  });
});
