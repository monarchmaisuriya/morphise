import type { PolishPart } from "./context";
import { HtmlItem } from "./pages/html-item";
import { HTML_ROW_KIND, htmlSchema } from "./pages/html-rows";

// HTML pages (experimental, off by default): draws the rows the chat-rows transformer makes from
// finished html_render calls (htmlRowData). Registered whatever the option says, so pages an agent
// published while it was on still show after it is turned off. Returns cleanup.
export const registerPages: PolishPart = ({ client }) => client.addTimelineRenderer({ kind: HTML_ROW_KIND, version: 1, schema: htmlSchema, Component: HtmlItem });
