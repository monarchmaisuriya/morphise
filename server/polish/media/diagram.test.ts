import { describe, expect, it } from "vitest";
import { renderDiagramSvg } from "./diagram";

describe("diagram RPC", () => {
  it("draws mermaid with Pele, loaded from Morphise's node_modules", async () => {
    const drawn = await renderDiagramSvg({ source: "flowchart LR\n  A[Start] --> B{Done?}\n  B -->|yes| C[<threadId>]" });
    expect(drawn?.svg).toMatch(/^<svg[\s>]/);
    expect(drawn?.svg).toContain("Start");
    // A tag-like label is drawn as text, not dropped.
    expect(drawn?.svg).toContain("threadId");
    expect(drawn!.width).toBeGreaterThan(0);
    expect(drawn!.height).toBeGreaterThan(0);
  });

  it("draws a label that starts with an @, which mermaid 11's grammar (and Pele's) reads as an edge id", async () => {
    const drawn = await renderDiagramSvg({ source: "flowchart LR\n  F[@mention in any workspace] --> G[Look up token by workspace]" });
    expect(drawn?.svg).toContain("@mention in any workspace");
  });

  it("gives null for source Pele can't read, so the chat shows the source", async () => {
    expect(await renderDiagramSvg({ source: "notADiagram at all" })).toBeNull();
  });
});
