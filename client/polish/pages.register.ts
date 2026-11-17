import type { PolishPart } from "./context";
import { createHtmlItem } from "./pages/html-item";
import { HTML_ROW_KIND, htmlSchema } from "./pages/html-rows";

// HTML pages (on unless turned off): draws the rows the chat-rows transformer makes from finished html_render calls
// (htmlRowData), with what a page can do in a chat (fill the message box, save to Bookmarks). Registered whatever the
// option says, so pages an agent published while it was on still show after it is turned off. Returns cleanup.
export const registerPages: PolishPart = ({ client, bookmarkPage }) =>
  client.addTimelineRenderer({ kind: HTML_ROW_KIND, version: 1, schema: htmlSchema, Component: createHtmlItem({ composers: client.composers, bookmarkPage }) });
