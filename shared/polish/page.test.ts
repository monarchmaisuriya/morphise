import { describe, expect, it } from "vitest";
import { htmlPage } from "./page";

const POLICY = /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="([^"]+)">/;

describe("the document a published page runs in", () => {
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
