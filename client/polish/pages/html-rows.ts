// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/html.ts
import { z } from "zod";
import { isHtmlTool, readHeights, readPageId } from "../../../shared/polish/html";
import type { ToolCallItem } from "../agent-types";

// The HTML page row: its timeline kind, and its data for a finished html_render call (undefined
// for any other tool call). The rows part calls htmlRowData from the tool_call transformer.
export const HTML_ROW_KIND = "polish-html";

// `heights`: width → height pairs the daemon measured when it checked the page, sorted by width; absent on pages it couldn't check, pages
// published with force, and older ones. `stored`: set only when Paseo cut the page to fit the timeline, to the id html_render stored the
// whole page under, or null for a page published before it stored them.
export const htmlSchema = z.object({
  title: z.string(),
  html: z.string(),
  heights: z.array(z.tuple([z.number(), z.number()])).min(1).optional(),
  stored: z.string().nullable().optional(),
});
export type HtmlData = z.output<typeof htmlSchema>;

// The marker Paseo (0.15+) ends a string with when it cuts a timeline item to its size limit (cutString in agent-timeline-content.ts).
const CUT = /…\[truncated [\d.]+ (?:B|KB|MB)\]$/;

/**
 * The page a finished html_render call published, read from the call's own input, plus the heights the daemon added to its output
 * (readHeights); failed calls (the tool rejected the page) stay tool rows.
 */
export function htmlRowData(item: ToolCallItem): HtmlData | undefined {
  if (item.status !== "completed" || !isHtmlTool(item.name)) return undefined;
  // The call's own shape, whatever detail type the provider chose for a tool it doesn't recognise.
  const { detail } = item;
  const input = ("input" in detail ? detail.input : undefined) as { title?: unknown; html?: unknown } | null | undefined;
  const output = ("output" in detail ? detail.output : undefined) as { isError?: unknown } | null | undefined;
  if (typeof input?.html !== "string" || output?.isError === true) return undefined;
  const heights = readHeights(output);
  const cut = CUT.test(input.html);
  return { title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Page", html: input.html, ...(heights && { heights }), ...(cut && { stored: readPageId(output) ?? null }) };
}
