import { describe, expect, it } from "vitest";
import { inlineImages, localImages } from "./html";

const paths = (html: string) => localImages(html).map((image) => image.path);

describe("local images a page names", () => {
  it("finds absolute paths in quotes, in CSS url(), as file:// URLs and as Windows paths, scripts included", () => {
    expect(paths(`<img src="/abs/shot.png"><div style="background:url( /abs/bg.webp )"></div>`)).toEqual(["/abs/shot.png", "/abs/bg.webp"]);
    expect(paths(`<script>img.src = '/abs/drawn.gif'; const next = \`/abs/next.jpeg\`;</script>`)).toEqual(["/abs/drawn.gif", "/abs/next.jpeg"]);
    expect(paths(`<img src="file:///abs/a.png"><img src="C:\\Users\\me\\b.JPG"><img src='d:/x/c.png'>`)).toEqual(["file:///abs/a.png", "C:\\Users\\me\\b.JPG", "d:/x/c.png"]);
  });

  it("leaves alone relative paths, web addresses, other file types, mismatched quotes and paths broken by a line end", () => {
    const html = [
      `<img src="shots/a.png">`,
      `<img src="./b.png">`,
      `<img src="//cdn.example.com/c.png">`,
      `<img src="https://example.com/d.png">`,
      `<a href="/abs/notes.txt">`,
      `<a href="/abs/vector.svg">`,
      `<img src="/abs/e.png'>`,
      `<img src="/abs/\nf.png">`,
      `<div style="background:url(shots/g.png)">`,
      `<img src="C:g.png">`,
    ].join("\n");
    expect(paths(html)).toEqual([]);
  });

  it("skips a path longer than the limit rather than reading it", () => {
    expect(paths(`<img src="/${"a".repeat(2100)}.png">`)).toEqual([]);
  });
});

describe("inlining local images", () => {
  it("replaces every place a page names an image it has data for, and keeps the path of each image it lacks", () => {
    const html = `<img src="/abs/a.png"><img src="/abs/missing.png"><i style="background:url(/abs/a.png)"></i><img src="C:\\x\\refused.png">`;
    const uris = new Map([["/abs/a.png", "data:image/png;base64,AAAA"]]);
    expect(inlineImages(html, uris)).toBe(`<img src="data:image/png;base64,AAAA"><img src="/abs/missing.png"><i style="background:url(data:image/png;base64,AAAA)"></i><img src="C:\\x\\refused.png">`);
  });

  it("matches a path exactly, not by a look-alike spelling", () => {
    const html = `<img src="/abs/A.png"><img src="file:///abs/a.png">`;
    expect(inlineImages(html, new Map([["/abs/a.png", "data:x"]]))).toBe(html);
  });

  it("returns the page unchanged when it has no data at all", () => {
    const html = `<img src="/abs/a.png">`;
    expect(inlineImages(html, new Map())).toBe(html);
  });
});
