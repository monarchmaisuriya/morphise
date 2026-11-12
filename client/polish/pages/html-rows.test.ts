// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/html.test.mjs
import { describe, expect, it } from "vitest";
import { heightsLine, pageIdLine } from "../../../shared/polish/html";
import type { ToolCallItem } from "../agent-types";
import { htmlRowData } from "./html-rows";

const call = (name: string, input: unknown, extra: Record<string, unknown> = {}) =>
  ({ type: "tool_call", callId: "1", name, status: "completed", error: null, detail: { type: "unknown", input, output: null }, ...extra }) as unknown as ToolCallItem;
const withOutput = (name: string, input: unknown, output: unknown) => call(name, input, { detail: { type: "unknown", input, output } });

describe("htmlRowData", () => {
  it("reads finished calls from Claude and Codex, and skips running, failed and other tools", () => {
    const page = { title: " Chart ", html: "<p>x</p>" };
    expect(htmlRowData(call("mcp__chat_polish__html_render", page))).toEqual({ title: "Chart", html: "<p>x</p>" });
    expect(htmlRowData(call("chat_polish.html_render", { html: "<p>x</p>" }))).toEqual({ title: "Page", html: "<p>x</p>" });
    expect(htmlRowData(call("chat_polish.html_render", page, { status: "running" }))).toBeUndefined();
    expect(htmlRowData(call("chat_polish.html_render", page, { status: "failed" }))).toBeUndefined();
    expect(htmlRowData(withOutput("chat_polish.html_render", page, { isError: true }))).toBeUndefined();
    expect(htmlRowData(call("mcp__other__html_render", page))).toBeUndefined();
    // An MCP bridge may add an alias suffix; a host may publish the label instead of the name.
    expect(htmlRowData(call("mcp_chat_polish__html_render_53e28128e555", page))).toEqual({ title: "Chart", html: "<p>x</p>" });
    expect(htmlRowData(call("chat_polish / html_render", page))).toEqual({ title: "Chart", html: "<p>x</p>" });
    expect(htmlRowData(call("chat_polish / html_preview", page))).toBeUndefined();
  });

  it("reads the page's heights back from the call's output in either provider's shape", () => {
    const page = { title: "Chart", html: "<p>x</p>" };
    const line = heightsLine([[360, 900], [700, 500], [1000, 400]]);
    const heights = [[360, 900], [700, 500], [1000, 400]];
    // Claude keeps the answer's text as `output`; Codex keeps the MCP result.
    expect(htmlRowData(withOutput("mcp__chat_polish__html_render", page, { output: `Shown to the reader.\n\n${line}` }))?.heights).toEqual(heights);
    expect(htmlRowData(withOutput("chat_polish.html_render", page, { content: [{ type: "text", text: `Shown.\n\n${line}` }] }))?.heights).toEqual(heights);
    expect(htmlRowData(withOutput("chat_polish.html_render", page, { output: "Shown." }))).not.toHaveProperty("heights");
  });

  it("names the stored copy of a page Paseo cut to fit the timeline, or null when there is none", () => {
    const cut = { title: "Chart", html: "<p>xx…[truncated 82.1 KB]" };
    const id = "a".repeat(64);
    expect(htmlRowData(withOutput("chat_polish.html_render", cut, { output: `Shown.\n\n${pageIdLine(id)}` }))?.stored).toBe(id);
    expect(htmlRowData(withOutput("chat_polish.html_render", cut, { output: "Shown." }))?.stored).toBeNull();
    expect(htmlRowData(withOutput("chat_polish.html_render", { title: "Chart", html: "<p>x</p>" }, { output: pageIdLine(id) }))).not.toHaveProperty("stored");
  });
});
