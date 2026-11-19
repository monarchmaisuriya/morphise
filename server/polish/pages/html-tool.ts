// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): server/html.ts
import type { PluginHookRequests } from "@getpaseo/plugin/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { Script } from "node:vm";
import { HTML_GUIDE_TOOL, HTML_PREVIEW_TOOL, HTML_SERVER, HTML_TOOL, heightsLine, localImages, pageIdLine, replacesLine } from "../../../shared/polish/html";
import { GUIDE_TOPICS, guideText } from "./guide";
import { PAGE_POLICY, unbalancedStyles } from "../../../shared/polish/page";
import { ImageTooLarge, openInFolder } from "../media/image";
import { folderOfToken } from "./agent-folders";
import { headlessShell } from "./headless-shell";
import { pagesCacheDir } from "./cache";
import { checkPage, type PageCheck } from "./page-check";

// A new agent's config as the agent.create.before hook receives it (Paseo's AgentSessionConfig).
export type AgentConfig = PluginHookRequests["agent.create.before"]["config"];

// When an agent should draw a page, in one place for both the system prompt (new chats) and the tool description (which
// Morphise's tool server sends live, so chats created before a change read it too). Proactive on purpose, like Claude
// Code's own guidance: draw without being asked whenever a page is clearer than text, keep text for short answers.
const WHEN_TO_DRAW = `Draw a page without being asked whenever it would be clearer than text:
- Choices: two or more options, designs or approaches to pick between. Show them side by side as mock-ups or a comparison.
- Numbers: anything compared, ranked, over time or broken down. A chart or a table.
- Structure: a plan, architecture, dependency map or timeline. A diagram on a page; a plain flowchart, sequence, state, class or ER diagram goes in a \`\`\`mermaid block in your reply instead, which the chat draws.
- Interfaces: a UI or layout to show or change. A mock-up, before and after when something changes.
- Results: a review, report, audit, test run or summary of many items. A page with the key facts first.
- Processes: how something works step by step or over time (an algorithm, a request's path, a protocol, a lifecycle, a physical process). An animated explainer with Morphise.player: scenes with captions, and play, pause and step controls the reader drives.
- Always when the user asks to draw, chart, plot, visualize, illustrate, simulate, animate or mock up something, in any language.
Keep text for a direct fact, a yes or no, a short explanation, code or a command; never add a page only to decorate an answer.`;

// The tool's description is the contract and the short style guide: the model reads it when it builds a page, on every
// provider. The rules for each kind of page come from html_guide (./guide.ts), read only when the agent draws one.
const DESCRIPTION = `Show a finished HTML page inline in this chat, above your reply: a chart, table, comparison, dashboard, diagram, interactive explainer or UI mock-up. Call it once per page, when the page is complete. To change a page you showed earlier, pass its id as replaces: the old one then shows "Updated below".

When to use it
${WHEN_TO_DRAW}

Before building one, call ${HTML_GUIDE_TOOL} with the kind of page (${GUIDE_TOPICS.join(", ")}) for its helpers and rules.

Page
- One self-contained HTML document with inline <style> and <script>. Prefer the built-in helpers (Morphise.chart, table.sortable, .gallery) and inline SVG; load a library from an https CDN only when it saves real work.
- Local images: absolute paths inside your working folder (PNG, JPEG, GIF or WebP up to 12 MB); nothing else shows.
- The page sits on the chat background, as wide as the reply column (about 700px on desktop, 360px on phones). No page background, outer card, border or title banner, and no horizontal padding on the outermost element. Fluid widths.
- Content sets the height. Never use vh units or height:100% on html or body; give charts and canvases fixed pixel heights.
- Reports and dashboards: use .report (24px between sections), .report-section (12px heading-group to data), .report-heading (8px heading to takeaway), and .report-data (16px chart to supporting content). Keep each supporting table inside a plain div so its filter stays with it. Put KPI grids before the sections. These are layout defaults, not extra cards or outer padding; html_guide charts/tables includes the full example. Existing custom layouts remain authoritative.

Theme
CSS variables that follow the user's theme live; use only them for color: --fg, --muted, --bg, --surface, --surface-2, --border, --accent, --accent-fg, --success, --warning, --danger, --chart-1 to --chart-6, --radius, --font, --mono. Built-in classes: .stack, .row, .grid, .card, .stat (.stat is a tile: a .label then a .value), .chip, .muted, .small, .num (.num right-aligns numbers in table cells; elsewhere it only lines digits up), .scroll; buttons (.primary), inputs, selects, range sliders, tables, details, links, code and kbd are styled. data-tip="…" on any element gives it a themed hover and focus hint. Charts, tables and galleries are interactive and fit the width on their own: tooltips, keyboard, legend toggles, tables that scroll sideways in their box.
Don't style text, headings, links, lists, quotes, code, tables, chips, cards, stats, buttons or inputs: the kit draws them like the chat's own replies, and a page's own styles for them are ignored. Write CSS only for layout (grid, flex, widths, positions, hiding) and for drawings (SVG, canvas). Status words in tables are plain text; use .chip.good, .warn, .bad or .info elsewhere. Show a selected button or tab with aria-pressed or aria-selected. A cell's inline background (a heatmap) is kept.

The tool lays the page out at 700 and 360px before showing it; when it finds script errors, overlapping or cut-off text, overflow, a moving height or styles that restyle what the kit draws, it shows nothing and returns them for you to fix.`;

/**
 * Added to a new agent's system prompt while pages are on: when to draw one, and the layout rules, since a description can load late and the
 * agent never sees its page. Overlapping labels were the most common fault in trials, all from text placed at hand-picked coordinates.
 */
const SYSTEM_PROMPT = `# HTML pages
You have an ${HTML_TOOL} tool that shows an HTML page inline in this chat.

When to use it
${WHEN_TO_DRAW}
Call ${HTML_GUIDE_TOOL} for the kind of page first.

Layout rules
You never see the page you publish, so build it so nothing can overlap, get cut off or move the chat:
- Put text in normal HTML flow (flex, grid, tables) and let it wrap. Use Morphise.chart for charts rather than placing text at coordinates.
- In your own SVG and canvas, compute positions from the data in your script, never from hand-picked numbers. Keep at least 8px between labels. Everything must fit a 360px-wide page too.
- Animations and controls must not change the page's height: reserve space for every state up front.

Your reply
After publishing, write one or two sentences the page doesn't already say: a takeaway, a caveat or a next step. Never say the page is shown, above, ready or rendered, and never reply with only punctuation.`;

// Only for agents created while the headless shell is installed: html_preview has nothing to lay a page out in without it.
const PREVIEW_RULE = `- To see a page before publishing it (canvas drawings, dense SVG), call ${HTML_PREVIEW_TOOL}: it reports what ${HTML_TOOL} would reject and, once the page passes, returns a screenshot. It doesn't publish the page, and it means writing the page twice, so skip it for plain layouts.`;

const TOOL = {
  name: HTML_TOOL,
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short name for the page" },
      html: { type: "string", description: "A complete, self-contained HTML document" },
      force: { type: "boolean", description: "Publish without the layout check. Only when a check reported problems you made on purpose." },
      replaces: { type: "string", description: "The page id (from an earlier answer's 'Page id:' line) of a page in this chat this one updates" },
    },
    required: ["title", "html"],
  },
  annotations: { title: "Render HTML", readOnlyHint: true },
};
const GUIDE = {
  name: HTML_GUIDE_TOOL,
  description: `The helpers and rules for one kind of page, to read before building it with ${HTML_TOOL}: ${GUIDE_TOPICS.slice(0, -1).join(", ")} or ${GUIDE_TOPICS.at(-1)}.`,
  inputSchema: { type: "object", properties: { topic: { type: "string", enum: [...GUIDE_TOPICS], description: "The kind of page" } }, required: ["topic"] },
  annotations: { title: "Page guide", readOnlyHint: true },
};
const PREVIEW = {
  name: HTML_PREVIEW_TOOL,
  description: `Lay an HTML page out exactly as ${HTML_TOOL} would, without publishing it, and get back what ${HTML_TOOL}'s checks would reject, its console output, its height and, once it passes them, a screenshot at 700px wide. Optional: ${HTML_TOOL} runs the same checks itself, and previewing means writing the page twice. Use it for what the checks can't judge (canvas drawings, dense SVG, a look you need to see), then publish the page with ${HTML_TOOL}.`,
  inputSchema: { type: "object", properties: { html: { type: "string", description: "A complete, self-contained HTML document" } }, required: ["html"] },
  annotations: { title: "Preview HTML", readOnlyHint: true },
};
// The frame grows to fit the page, so a size that follows the viewport grows it again and again. Only stylesheets and style attributes are
// scanned, so a page that mentions the unit in its text passes; comments match first so their contents are skipped.
const CSS_SOURCE = /<!--[\s\S]*?(?:-->|$)|<style\b[^>]*(?:>|$)([\s\S]*?)(?:<\/style\s*>|$)|\sstyle\s*=\s*(?:"([^"]*)(?:"|$)|'([^']*)(?:'|$)|([^\s>]+))/gi;
// The lookbehind skips base64 runs, such as an inlined image that happens to contain "1vh".
const VIEWPORT = /(?<![\w.+/])(?:\d+(?:\.\d+)?|\.\d+)[sld]?vh(?![\w-])/i;
const viewportUnit = (html: string) => {
  for (const [, sheet, double, single, bare] of html.matchAll(CSS_SOURCE)) {
    const found = VIEWPORT.exec(sheet ?? double ?? single ?? bare ?? "")?.[0];
    if (found) return found;
  }
  return undefined;
};

// Classic inline scripts, compiled but not run: a syntax error leaves the page blank or half-built, and this names it with its line even
// when the page isn't laid out (no headless browser, or force). Modules, src scripts and errors at run time are left to the page check.
const SCRIPT = /<!--[\s\S]*?(?:-->|$)|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
function scriptError(html: string) {
  let n = 0;
  for (const [, attrs, code] of html.matchAll(SCRIPT)) {
    if (attrs === undefined) continue;
    n++;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (/\bsrc\s*=/i.test(attrs) || (type && !/^(?:text|application)\/(?:java|ecma)script$/i.test(type))) continue;
    try {
      new Script(code!, { filename: "script" });
    } catch (error) {
      const line = Number(/^script:(\d+)/.exec((error as Error).stack ?? "")?.[1]);
      const text = line ? code!.split("\n")[line - 1]?.trim().slice(0, 160) : undefined;
      return `Script ${n} has a syntax error${line ? ` on its line ${line}` : ""}: ${(error as Error).message}.${text ? ` The line: ${text}` : ""}`;
    }
  }
  return undefined;
}

// Opened with the same folder check the chat loads them with; without a folder (a chat created before per-agent tokens), none is opened or
// looked up. Every image it may not read gets the same words, so the answer never tells whether a path outside the folder exists.
async function imageError(html: string, folder: string | undefined) {
  if (!folder) return undefined;
  const paths = [...new Set(localImages(html).map((image) => image.path))];
  const opened = await Promise.all(paths.map((path) => openInFolder(path, folder).then(() => "read" as const, (error: unknown) => (error instanceof ImageTooLarge ? ("large" as const) : ("refused" as const)))));
  const refused = paths.filter((_, i) => opened[i] === "refused");
  if (refused.length) return `These local images could not be read inside your working folder: ${refused.join(", ")}. Use absolute paths to image files inside it, or remove them.`;
  const large = paths.find((_, i) => opened[i] === "large");
  return large ? `${large} is over 12 MB; use a smaller image.` : undefined;
}

// What the kit draws (./page.ts KIT_LOOK) and the inline styles that would restyle it: an inline style outranks every rule, so these are
// the one way a page's own look could still win. Layout (grid, sizes, positions) and drawings' own colours are the page's to set.
const KIT_DRAWN = /^(?:table|thead|tbody|tfoot|tr|th|td|h[1-6]|button|input|select|textarea)$/;
const KIT_CLASSES = /(?:^|\s)(?:chip|card|stat)(?:\s|$)/;
const LOOK_PROPERTY = /^(?:color|background(?:-[a-z-]+)?|border(?:-[a-z-]+)?|font(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)$/;
// Text the browser never reads as markup: comments, scripts, the kit-free bodies of templates and text areas, and style blocks (checked apart).
const NOT_MARKUP = /<!--[\s\S]*?(?:-->|$)|<(script|style|template|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
const STYLE_TEXT = /<!--[\s\S]*?(?:-->|$)|<(script|template|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi;
const TAG = /<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const attribute = (attrs: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs)?.slice(1).find((v) => v !== undefined);

/**
 * Problems with a page restyling what the kit draws, which html_render rejects unless forced: !important (it beats the kit from the
 * page's own layer), an inline look on a table, heading, chip, card, stat or control, or on anything inside a table cell (status words in
 * tables are plain text), and a style block whose braces don't balance (it can't go in the page's layer). A cell's own background stays.
 */
export function ownLookProblems(html: string): string[] {
  const problems: string[] = [];
  const important = [...html.matchAll(STYLE_TEXT)].map((m) => m[2]).filter((css): css is string => css !== undefined).map((css) => css.replace(/\/\*[\s\S]*?\*\//g, "")).find((css) => /!\s*important/i.test(css));
  const markup = html.replace(NOT_MARKUP, "");
  let cells = 0;
  const looks: string[] = [];
  let inlineImportant = false;
  for (const [, closing, rawName, attrs] of markup.matchAll(TAG)) {
    const name = rawName!.toLowerCase();
    if (/^(?:td|th)$/.test(name)) cells = closing ? Math.max(0, cells - 1) : cells + 1;
    else if (/^(?:tr|tbody|thead|tfoot|table)$/.test(name)) cells = 0;
    if (closing) continue;
    const style = attribute(attrs!, "style");
    if (!style) continue;
    if (/!\s*important/i.test(style)) inlineImportant = true;
    const cls = attribute(attrs!, "class") ?? "";
    const inCell = cells > 0 && !/^(?:td|th)$/.test(name);
    if (!(KIT_DRAWN.test(name) || KIT_CLASSES.test(cls) || inCell)) continue;
    const props = style.split(";").map((d) => d.split(":")[0]!.trim().toLowerCase()).filter((p) => LOOK_PROPERTY.test(p) && !(/^(?:td|th)$/.test(name) && /^background/.test(p)));
    if (props.length && looks.length < 3) looks.push(`<${name}${cls ? ` class="${cls}"` : ""}>${inCell ? " (in a table cell)" : ""} sets ${props.join(", ")}`);
  }
  if (important || inlineImportant) problems.push(`The page's CSS uses !important${important ? ` (${important.trim().slice(0, 60)})` : " in a style attribute"}; the kit draws text, tables and controls like the chat, so remove it.`);
  for (const look of looks) problems.push(`${look}; the kit draws tables, headings, chips, cards, stats and controls like the chat and keeps cell text plain, so drop it (layout such as width or grid is fine).`);
  for (const css of unbalancedStyles(html).slice(0, 1)) problems.push(`A <style> block has unbalanced braces (${css.trim().slice(0, 60)}); fix the CSS.`);
  return problems;
}

/** Who is calling the tools: the working folder its token was issued for, or none for a chat holding the shared token (created before per-agent tokens). */
interface Caller {
  folder: string | undefined;
}

interface RpcMessage {
  id?: unknown;
  method?: unknown;
  params?: { protocolVersion?: unknown; name?: unknown; arguments?: { html?: unknown; force?: unknown; replaces?: unknown; topic?: unknown } };
}

/**
 * The MCP server's answer to one JSON-RPC message, undefined for a notification. It checks the page, and stores a published one: the chat
 * reads the page from the call's input, which the provider's transcript keeps, and loads the stored copy only when Paseo cut that input.
 */
export async function mcpAnswer(m: RpcMessage, caller: Caller) {
  if (m.id === undefined) return undefined;
  const result = (value: unknown) => ({ jsonrpc: "2.0", id: m.id, result: value });
  const text = (value: string, isError = false) => result({ content: [{ type: "text", text: value }], isError });
  if (m.method === "initialize") return result({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: HTML_SERVER, version: "1" } });
  if (m.method === "ping") return result({});
  // html_preview while the headless shell is installed; without it pages go out unchecked and there's nothing to preview them in.
  if (m.method === "tools/list") return result({ tools: headlessShell() ? [TOOL, GUIDE, PREVIEW] : [TOOL, GUIDE] });
  if (m.method !== "tools/call") return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } };
  console.info(`[morphise] html tools: ${String(m.params?.name)} called for ${caller.folder ?? "legacy"}`);
  // Routed by name first: html_guide takes no page.
  if (m.params?.name === GUIDE.name) {
    const guide = guideText(m.params?.arguments?.topic);
    return text(guide.text, !guide.known);
  }
  const html = m.params?.arguments?.html;
  const preview = m.params?.name === PREVIEW.name;
  if ((m.params?.name !== TOOL.name && !preview) || typeof html !== "string" || !html.trim()) return text(preview ? "Pass a complete HTML document." : "Pass a title and a complete HTML document.", true);
  if (html.length > 200000) return text("The page is over 200,000 characters; make it smaller.", true);
  const vh = viewportUnit(html);
  const problem = (vh && `The page uses a viewport height unit (${vh}). Let content set the height, or use fixed pixel heights.`) || scriptError(html) || (await imageError(html, caller.folder));
  // The chat still shows the page's images inside its folder; the agent should know nothing here looked at them.
  const unread = !caller.folder && localImages(html).length > 0 && "Local images were not checked for this chat; a new chat can preview them.";
  // Forceable, and found from the source, so they hold whether or not the layout check can run.
  const looks = ownLookProblems(html);
  if (preview) return result(previewAnswer(problem, await checkPage(html, caller.folder), unread || undefined, looks));
  if (problem) return text(problem, true);
  const forced = m.params?.arguments?.force === true;
  const check = forced ? undefined : await checkPage(html, caller.folder);
  const problems = forced ? [] : [...looks, ...(check?.problems ?? [])];
  if (problems.length) {
    const found = check?.problems.length ? "The page was laid out as the chat shows it, and a reader would see these problems." : "The page has these problems.";
    return text(`${found} Fix them and call ${HTML_TOOL} again; pass force: true only if every one is on purpose.\n- ${problems.join("\n- ")}`, true);
  }
  const shown = "Shown to the reader above your reply. Don't say it's shown and don't describe it; reply in one or two sentences with what it doesn't say: a takeaway, a caveat or a next step.";
  // The browser is there but the check didn't run (it couldn't start, or failed): the agent should know nothing vouched for the page.
  const unchecked = !check && m.params?.arguments?.force !== true && headlessShell();
  const replaces = await replacedPage(m.params?.arguments?.replaces);
  if (replaces.error) return text(replaces.error, true);
  const stored = await savePage(html, true).then(pageIdLine, (error: unknown) => console.warn("[morphise] couldn't store the page", error));
  return text([unchecked ? `${shown} The layout check couldn't run, so it went out unchecked.` : shown, unread, check && heightsLine(check.heights), stored, replaces.id && replacesLine(replaces.id)].filter(Boolean).join("\n\n"));
}

/**
 * What html_preview tells the agent: everything html_render would, as notes rather than a rejection. The screenshot comes only once the
 * checks pass: until then the problems say what to fix, and Paseo shows every image a tool returns in the chat.
 */
function previewAnswer(problem: string | undefined, check: PageCheck | undefined, unread?: string, looks: string[] = []) {
  const problems = [problem, ...looks, ...(check?.problems ?? [])].filter(Boolean);
  const height = (width: number) => check?.heights.find(([w]) => w === width)?.[1];
  const heights = height(700) && height(360) ? [`Height: ${height(700)}px at 700px wide, ${height(360)}px at 360px.`] : [];
  const text = [
    check
      ? `Laid out as the chat would show it, at 700px and 360px wide. The page wasn't published.${problems.length ? " The screenshot comes once these are fixed." : " The screenshot is at 700px."}`
      : `The page couldn't be laid out (${headlessShell() ? "the check failed" : "the headless browser isn't installed"}), so only its source was checked. The page wasn't published.`,
    problems.length ? `${HTML_TOOL} would reject it for:\n- ${problems.join("\n- ")}` : `${HTML_TOOL}'s checks pass.`,
    ...(unread ? [unread] : []),
    ...(check ? [check.console.length ? `Console:\n${check.console.join("\n")}` : "Console: nothing logged.", ...heights] : []),
    `When it looks right, publish it with ${HTML_TOOL}.`,
  ].join("\n\n");
  const shot = check && !problems.length ? [{ type: "image", data: check.screenshot, mimeType: "image/png" }] : [];
  return { content: [{ type: "text", text }, ...shot], isError: false };
}

/** Providers whose agents may preapprove exact MCP tools (`PROVIDER_CONTRACTS` in Paseo's provider-registry.ts); Paseo refuses to create an agent on any other with a toolPolicy. The tools go only to these, so no other provider is handed an MCP server it may not support. */
export const PREAPPROVES = new Set(["claude", "codex", "opencode"]);

/** The provider a configured one finally extends, as Paseo resolves its contract: `claude-mobile` → `claude`, a custom ACP one → `acp`. */
export function baseProvider(provider: string, providers: unknown = {}): string {
  const entries = (providers && typeof providers === "object" ? providers : {}) as Record<string, { extends?: unknown } | undefined>;
  const seen = new Set<string>();
  for (let id = provider; ; ) {
    const next = entries[id]?.extends;
    if (typeof next !== "string" || seen.has(next)) return id;
    seen.add(id);
    id = next;
  }
}

/**
 * A new agent's config with the tools added, preapproved where its base provider allows it so calling them never asks for permission, loaded up
 * front on Claude, and its rules appended to the system prompt. A config that has them already (Paseo re-creating a stored agent hands the hook
 * its saved config) only gets the new address and token.
 */
export function withHtmlTool(config: AgentConfig, { url, token }: { url: string; token: string }, base = config.provider): AgentConfig {
  const added = Boolean(config.mcpServers?.[HTML_SERVER]);
  const others = (config.toolPolicy?.preapproved ?? []).filter((entry) => entry.server !== HTML_SERVER);
  return {
    ...config,
    mcpServers: { ...config.mcpServers, [HTML_SERVER]: { type: "http", url, headers: { Authorization: `Bearer ${token}` }, alwaysLoad: true } },
    ...(PREAPPROVES.has(base) && {
      toolPolicy: { ...config.toolPolicy, preapproved: [...others, ...[HTML_TOOL, HTML_GUIDE_TOOL, HTML_PREVIEW_TOOL].map((tool) => ({ kind: "mcp" as const, server: HTML_SERVER, tool }))] },
    }),
    systemPrompt: added ? config.systemPrompt : [config.systemPrompt, headlessShell() ? SYSTEM_PROMPT.replace("\n\nYour reply", `\n${PREVIEW_RULE}\n\nYour reply`) : SYSTEM_PROMPT].filter(Boolean).join("\n\n"),
  };
}

// ---- The local server: the tool for agents, and pages for the system browser ----

const MCP_PATH = "/mcp";
// Served with a sandbox policy like the chat's frame, plus forms and modals a browser tab can show: the page gets an opaque origin, so it
// can't read anything else served here. The page's own network policy comes with it, whatever document the app saved.
const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": `sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals; ${PAGE_POLICY}`,
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};
const pagesDir = () => join(pagesCacheDir(), "published");
const addressFile = () => join(pagesCacheDir(), "server.json");
let listening: Promise<{ server: Server; port: number; token: string }> | undefined;

// The caller its bearer token names: the shared token (held by agents created before per-agent tokens) gives no folder, a per-agent token
// the folder it was issued for, anything else nobody. Refusals are logged with their reason, never with the token.
async function callerOf(authorization: string | undefined, shared: string): Promise<Caller | undefined> {
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const refuse = (reason: string) => void console.warn(`[morphise] html tools: refused a call (${reason})`);
  if (!bearer) return refuse("no bearer token");
  const sameLength = Buffer.byteLength(bearer) === Buffer.byteLength(shared);
  if (sameLength && timingSafeEqual(Buffer.from(bearer), Buffer.from(shared))) return { folder: undefined };
  const folder = await folderOfToken(bearer);
  return folder ? { folder } : refuse(sameLength ? "unknown token" : "wrong length");
}

// Stateless Streamable HTTP: one JSON answer per POST, no event stream and no sessions, so a plugin restart between calls goes unnoticed.
async function serveMcp(req: IncomingMessage, res: ServerResponse, token: string) {
  if (req.method !== "POST") return void res.writeHead(405, { Allow: "POST" }).end();
  const caller = await callerOf(req.headers.authorization, token);
  if (!caller) return void res.writeHead(403).end();
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let message: unknown;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return void res.writeHead(400).end();
  }
  const answer = message && typeof message === "object" ? await mcpAnswer(message as RpcMessage, caller) : undefined;
  if (!answer) return void res.writeHead(202).end();
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(answer));
}

async function serve(req: IncomingMessage, res: ServerResponse, token: string) {
  if (req.url === MCP_PATH) return serveMcp(req, res, token);
  const name = /^\/([0-9a-f]{64})\.html$/.exec(req.url ?? "")?.[1];
  const page = name ? await readFile(join(pagesDir(), `${name}.html`)).catch(() => undefined) : undefined;
  if (!page) return void res.writeHead(404).end();
  res.writeHead(200, PAGE_HEADERS).end(page);
}

// ponytail: localhost on the daemon's machine, so a page opened from a remote daemon's chat doesn't load; serve through Paseo's relay if that's needed.
/**
 * One server in the plugin's process for every agent's tool and every opened page, on 127.0.0.1; the tool needs the token, a page only its
 * hash. Its port and token are saved, so agents keep working across restarts with the address they were created with; a new port only if the
 * old one is taken, and agents created before then lose the tool.
 */
function localServer() {
  listening ??= (async () => {
    const saved = (await readFile(addressFile(), "utf8").then(JSON.parse).catch(() => undefined)) as { port?: unknown; token?: unknown } | undefined;
    const token = typeof saved?.token === "string" ? saved.token : randomBytes(24).toString("hex");
    const start = (port: number) =>
      new Promise<Server>((resolve, reject) => {
        const server = createServer((req, res) =>
          serve(req, res, token).catch((error: unknown) => {
            console.error("[morphise] html server", req.method, req.url, error);
            if (!res.headersSent) res.writeHead(500);
            res.end();
          }),
        );
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve(server);
        });
      });
    const server = await (typeof saved?.port !== "number"
      ? start(0)
      : start(saved.port).catch((error: unknown) => {
          console.warn(`[morphise] html server port ${saved.port} unavailable, agents created before now lose html_render`, error);
          return start(0);
        }));
    const port = (server.address() as { port: number }).port;
    if (port !== saved?.port || token !== saved?.token) {
      // Unsaved, the server still works until the plugin stops; only the next start picks a new address.
      await mkdir(pagesCacheDir(), { recursive: true })
        .then(() => writeFile(addressFile(), JSON.stringify({ port, token }), { mode: 0o600 }))
        .catch((error: unknown) => console.warn("[morphise] couldn't save the html server's address", error));
    }
    // The token lets any process that reads it call the tools as an agent. A mode only applies when a file is created, so one saved
    // before (or rewritten in place) is narrowed here too.
    await chmod(addressFile(), 0o600).catch(() => undefined);
    return { server, port, token };
  })();
  listening.catch(() => (listening = undefined));
  return listening;
}

/**
 * Whether the local server ran before (it saved its address): agents created then keep calling
 * the tools after the option is turned off, so the server starts with the plugin. A user who
 * never turned HTML pages on gets no listening port.
 */
export const localServerUsedBefore = () => stat(addressFile()).then(() => true, () => false);

/** Where agents reach the chat_polish MCP server (html_render, and html_preview while the headless browser is installed). */
export const startHtmlTool = () => localServer().then(({ port, token }) => ({ url: `http://127.0.0.1:${port}${MCP_PATH}`, token }));

// Saved pages older than this are deleted when another is saved, so the cache does not only grow.
// A chat older than that still shows a page it carries in full; only a cut one reads as gone.
const PAGE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** Saves a page under its sha256, where the local server serves it and the html.page RPC reads it, and returns that id. */
// `published`: a page html_render shows gets an id of its own (the page and a random salt), so "Updated below" and a bookmark name
// that one publish, even when the same page is published again (a revert) or in another chat. Open in browser keys by content.
async function savePage(html: string, published = false) {
  const id = published ? createHash("sha256").update(html).update(randomBytes(16)).digest("hex") : pageId(html);
  await mkdir(pagesDir(), { recursive: true });
  await writeFile(join(pagesDir(), `${id}.html`), html);
  void pruneOldPages();
  return id;
}

async function pruneOldPages(now = Date.now()) {
  const names = await readdir(pagesDir()).catch(() => [] as string[]);
  for (const name of names) {
    if (!/^[0-9a-f]{64}\.html$/.test(name)) continue;
    const file = join(pagesDir(), name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > PAGE_KEEP_MS) await rm(file, { force: true }).catch(() => undefined);
  }
}

const pageId = (html: string) => createHash("sha256").update(html).digest("hex");
const PAGE_ID = /^[0-9a-f]{64}$/;

/**
 * The page `replaces` names, checked: a stored page id. Each publish has an id of its own (savePage), so the new page can't
 * be the one it replaces. Absent: nothing replaced.
 */
async function replacedPage(replaces: unknown): Promise<{ id?: string; error?: string }> {
  if (replaces === undefined || replaces === null || replaces === "") return {};
  if (typeof replaces !== "string" || !PAGE_ID.test(replaces)) return { error: "replaces must be a page id from an earlier answer's 'Page id:' line." };
  const known = await readStoredPage({ id: replaces });
  return known.html === null ? { error: `No page ${replaces} is stored; leave replaces out to show this one as a new page.` } : { id: replaces };
}

// Pages a bookmark keeps (Save), out of reach of pruneOldPages, which only looks at pagesDir itself.
const keptDir = () => join(pagesDir(), "kept");

/** A page html_render stored, for the chat when Paseo cut the call's input, or a kept one; null once it's gone. */
export const readStoredPage = ({ id }: { id: string }): Promise<{ html: string | null }> =>
  readFile(join(pagesDir(), `${id}.html`), "utf8").then(
    (html) => ({ html }),
    () => readFile(join(keptDir(), `${id}.html`), "utf8").then((html) => ({ html }), () => ({ html: null })),
  );

/** Removes kept pages no bookmark holds any more (a bookmark removed elsewhere, pushed out past the limit, or dropped by an older version). */
export async function pruneKept(held: ReadonlySet<string>): Promise<number> {
  const names = await readdir(keptDir()).catch(() => [] as string[]);
  let removed = 0;
  for (const name of names) {
    const id = /^([0-9a-f]{64})\.html$/.exec(name)?.[1];
    if (!id || held.has(id)) continue;
    await rm(join(keptDir(), name), { force: true }).catch(() => undefined);
    removed++;
  }
  return removed;
}

/** Keeps a copy of a stored page while a bookmark holds it, or removes that copy. A page already gone can't be kept. */
export async function keepStoredPage({ id, keep }: { id: string; keep: boolean }): Promise<{ kept: boolean }> {
  if (!PAGE_ID.test(id)) throw new Error("Not a page id");
  const file = join(keptDir(), `${id}.html`);
  if (!keep) {
    await rm(file, { force: true });
    return { kept: false };
  }
  const { html } = await readStoredPage({ id });
  if (html === null) return { kept: false };
  await mkdir(keptDir(), { recursive: true });
  await writeFile(file, html);
  return { kept: true };
}

/** Saves the page under its hash and returns its address on the daemon's localhost. */
export async function openHtmlPage({ html }: { html: string }) {
  const name = await savePage(html);
  const { port } = await localServer();
  return { url: `http://127.0.0.1:${port}/${name}.html` };
}

export async function closeLocalServer() {
  const current = await listening?.catch(() => undefined);
  listening = undefined;
  current?.server.close();
  current?.server.closeAllConnections();
}
