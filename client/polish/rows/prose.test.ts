import { describe, expect, it, vi } from "vitest";

const Markdown = () => null;
vi.mock("@getpaseo/plugin/client/ui", () => ({ Markdown }));

const { Prose } = await import("./prose");

describe("Prose (markdown an agent wrote, inside Morphise's rows)", () => {
  it("hands the whole text to Paseo's own Markdown renderer, so headings, lists and links look as in a reply", () => {
    const text = "## Briefing\n\n- **Bottom line:** yes.\n\n### Questions for M\n\n1. First? [link](https://example.com)";
    const element = Prose({ text }) as { type: unknown; props: { children: string } };
    expect(element.type).toBe(Markdown);
    expect(element.props.children).toBe(text);
  });
});
