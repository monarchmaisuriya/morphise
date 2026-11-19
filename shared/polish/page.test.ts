import { describe, expect, it } from "vitest";
import { htmlPage, KIT_LOOK, layerPageStyles, themeCss, unbalancedStyles, type HtmlColors } from "./page";
import { KIT_CSS_LOOK } from "./page-kit";

const POLICY = /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="([^"]+)">/;
const COLORS: HtmlColors = { surface0: "#111111", surface1: "#222222", surface2: "#333333", border: "#444444", foreground: "#eeeeee", foregroundMuted: "#999999", accent: "#3366ff", accentForeground: "#ffffff", statusSuccess: "#22aa55", statusWarning: "#ddaa22", statusDanger: "#ee4444" };
const FONTS = { sans: "sans-serif", mono: "monospace" };

describe("the theme a page is drawn in", () => {
  it("passes Paseo's third surface, which table headers and code sit on", () => {
    expect(themeCss(COLORS, FONTS, [], false)).toContain("--surface-2:#333333;");
  });
  it("sets the text size Paseo's replies use: 15px, or 14px in a compact layout", () => {
    expect(themeCss(COLORS, FONTS, [], false)).toContain("--text:15px;--leading:21px;");
    expect(themeCss(COLORS, FONTS, [], true)).toContain("--text:14px;--leading:20px;");
  });
  it("sizes headings from the text size, as Paseo's markdown does", () => {
    expect(themeCss(COLORS, FONTS, [], false)).toContain("--h1:24px;--h1-leading:31px;--h2:21px;--h2-leading:27px;--h3:18px;--h3-leading:23px;--h4:17px;--h4-leading:22px;");
    expect(themeCss(COLORS, FONTS, [], true)).toContain("--h1:22px;--h1-leading:29px;--h2:20px;--h2-leading:26px;--h3:17px;--h3-leading:22px;--h4:15px;--h4-leading:20px;");
  });
});

// A page's own styles go in the `page` layer, which the kit's unlayered look outranks; layout they set still applies.
describe("the page's own styles", () => {
  it.each([
    ["no style", "<p>hi</p>", "<p>hi</p>"],
    ["one style", "<style>p{color:red}</style>", "<style>@layer page{p{color:red}}</style>"],
    ["two styles, attributes kept", '<style media="all">a{}</style><b></b><style>b{}</style>', '<style media="all">@layer page{a{}}</style><b></b><style>@layer page{b{}}</style>'],
    ["a style in an SVG", "<svg><style>.x{fill:red}</style></svg>", "<svg><style>@layer page{.x{fill:red}}</style></svg>"],
    ["an import with a media query", "<style>@import url(https://f.example/a.css) screen;p{}</style>", "<style>@import url(https://f.example/a.css) layer(page) screen;@layer page{p{}}</style>"],
    ["an import as a string with supports()", '<style>@import "https://f.example/a.css" supports(display:grid);</style>', '<style>@import "https://f.example/a.css" layer(page) supports(display:grid);@layer page{}</style>'],
    ["an import already in a layer", "<style>@import url(https://f.example/a.css) layer(lib);p{}</style>", "<style>@import url(https://f.example/a.css) layer(lib);@layer page{p{}}</style>"],
    ["a charset", '<style>@charset "utf-8";p{}</style>', "<style>@layer page{p{}}</style>"],
    ["a leading comment", "<style>/* theme */ @import url(https://f.example/a.css);p{}</style>", "<style>@import url(https://f.example/a.css) layer(page);@layer page{p{}}</style>"],
    ["CDATA in an SVG style", "<svg><style><![CDATA[.x{fill:red}]]></style></svg>", "<svg><style><![CDATA[@layer page{.x{fill:red}}]]></style></svg>"],
    ["old comment markers", "<style><!-- p{color:red} --></style>", "<style>@layer page{p{color:red}}</style>"],
    ["a Tailwind style, read by its script", '<style type="text/tailwindcss">@apply x;</style>', '<style type="text/tailwindcss">@apply x;</style>'],
    ["an explicit text/css type", '<style type="text/css">p{}</style>', '<style type="text/css">@layer page{p{}}</style>'],
    ["unbalanced braces, left for the check to report", "<style>p{color:red}}td{color:red}</style>", "<style>p{color:red}}td{color:red}</style>"],
    ["a brace inside a string", '<style>p::after{content:"}"}</style>', '<style>@layer page{p::after{content:"}"}}</style>'],
    ["style text in a script", '<script>var s = "<style>p{}</style>";</script>', '<script>var s = "<style>p{}</style>";</script>'],
    ["style text in a comment", "<!-- <style>p{}</style> -->", "<!-- <style>p{}</style> -->"],
    ["an unclosed style", "<style>p{color:red}", "<style>p{color:red}"],
  ])("%s", (_, html, expected) => {
    expect(layerPageStyles(html)).toBe(expected);
  });
  it("names the style blocks it left out of the layer because their braces don't balance", () => {
    expect(unbalancedStyles("<style>p{}</style><style>p{color:red}}td{}</style>")).toEqual(["p{color:red}}td{}"]);
  });
});

describe("the document a published page runs in", () => {
  it("provides separate overridable gaps for report sections, headings and supporting data", () => {
    const page = htmlPage('<main class="report"></main>', "");
    const base = page.slice(page.indexOf("@layer kit-base{"), page.indexOf("html,body{font:"));
    expect(base).toContain(".report{gap:24px;");
    expect(base).toContain(".report-section{gap:12px}");
    expect(base).toContain(".report-heading{gap:8px}");
    expect(base).toContain(".report-data{gap:16px}");
    expect(base).toContain(".report,.report-section,.report-heading,.report-data{display:flex;flex-direction:column;min-width:0}");
    expect(base).toContain(".stack{display:flex;flex-direction:column;gap:12px}");
  });
  it("draws tables as Paseo's replies do: full width, a line on every side of every cell, a bold shaded header, rows shaded from the page background", () => {
    const page = htmlPage("<table><tr><td>a</td></tr></table>", "");
    expect(page).toMatch(/table\{border-collapse:collapse;width:100%\}/);
    expect(page).toMatch(/th,td\{padding:8px 12px;border:1px solid var\(--border\)\}/);
    expect(page).toMatch(/th\{font-weight:700;color:var\(--fg\);background:var\(--surface-2\)\}/);
    expect(page).toMatch(/tbody tr:nth-child\(odd\)>td\{background:var\(--bg\)\}tbody tr:nth-child\(even\)>td\{background:var\(--surface\)\}/);
  });
  it("draws status chips inside table cells as plain text, as the chat's tables have no badges", () => {
    const page = htmlPage("<p>hi</p>", "");
    expect(page).toMatch(/td \.chip,th \.chip\{background:none;border:0;border-radius:0;padding:0;/);
    expect(page).toMatch(/td \.chip::before,th \.chip::before\{content:none\}/);
  });
  it("declares the base layer and the page's layer before any kit rule, so the kit's unlayered look outranks both", () => {
    expect(htmlPage("<p>hi</p>", ":root{}")).toContain('<style id="cp-theme">:root{}</style><style>@layer kit-base,page;@layer kit-base{');
  });
  it("keeps layout out of the kit's look rules, so a page can still arrange, size and hide anything", () => {
    const layout = /(?<![-\w])(display|grid(-[a-z-]+)?|flex(-[a-z-]+)?|gap|width|max-width|height|max-height|overflow(-[xy])?|position|inset|margin(-[a-z-]+)?|text-align|z-index|white-space)\s*:/;
    expect(KIT_LOOK).not.toMatch(layout);
    expect(KIT_CSS_LOOK).not.toMatch(layout);
  });
  it("pads highlighted words, so the page check never finds the kit's own <mark> cramped", () => {
    expect(KIT_LOOK).toMatch(/mark\{[^}]*padding:0 4px;border-radius:4px/);
  });
  it("puts the page's own styles in its layer", () => {
    expect(htmlPage("<style>td{color:red}</style><p>hi</p>", "")).toMatch(/<style>@layer page\{td\{color:red\}\}<\/style><p>hi<\/p>$/);
  });
  it("opens with a policy that blocks fetches, form posts and remote images, allowing https scripts, styles, fonts and blob workers", () => {
    const policy = POLICY.exec(htmlPage("<p>hi</p>", ":root{}"))?.[1];
    expect(policy?.split("; ")).toEqual(
      expect.arrayContaining(["default-src 'none'", "connect-src 'none'", "form-action 'none'", "img-src data: blob:", "worker-src blob:", expect.stringMatching(/^script-src 'unsafe-inline'.* https:$/), "style-src 'unsafe-inline' https:", expect.stringMatching(/^font-src https:/)]),
    );
  });

  // A meta policy covers only what the parser reaches after it, so nothing of the page may come first, wherever its own tags are.
  it.each([
    ["no tags", "<p>hi</p>"],
    ["its own head", '<head><meta http-equiv="refresh" content="0;url=https://example.com/"></head><p>hi</p>'],
    ["a meta before its head", '<meta http-equiv="Content-Security-Policy" content="default-src *"><head></head><img src="https://example.com/x">'],
    ["a head inside a comment", '<!-- <head> --><img src="https://example.com/x">'],
    ["a full document", '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><p>hi</p></body></html>'],
  ])("puts the policy before any of the page's content: %s", (_, html) => {
    const doc = htmlPage(html, ":root{}", true);
    expect(doc).toMatch(POLICY);
    expect(doc.endsWith(html)).toBe(true);
    // Everything ahead of the page is ours: one head, closed before the page starts.
    const ours = doc.slice(0, doc.length - html.length);
    expect(ours.match(/<head>/g)).toHaveLength(1);
    expect(ours.endsWith("</head>")).toBe(true);
  });
});
