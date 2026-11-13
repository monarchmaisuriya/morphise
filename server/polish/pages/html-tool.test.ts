// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/html.test.mjs
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readPageId } from "../../../shared/polish/html";
import { PAGE_POLICY } from "../../../shared/polish/page";

interface RpcReply {
  result: { isError: boolean; content: Array<{ type: string; text: string }>; tools: Array<{ name: string; description: string }>; serverInfo: { name: string } };
}

// Every test here runs against an empty Paseo home, so no headless browser is installed: pages go
// out unchecked and html_preview is not offered. The checks with the browser are Chat Polish's
// page-check test, which needs the ~100 MB download.
const home = process.env.PASEO_HOME;
let cache = "";

beforeAll(async () => {
  process.env.PASEO_HOME = await mkdtemp(join(tmpdir(), "morphise-pages-"));
  cache = join(process.env.PASEO_HOME, "plugin-cache", "morphise", "pages");
  // A half-written address file from a crash is ignored, not fatal.
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, "server.json"), '{"port":');
});

afterAll(async () => {
  const { closeLocalServer } = await import("./html-tool");
  await closeLocalServer();
  if (home === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = home;
});

describe("the html_render MCP server", () => {
  it("adds itself to a new agent's config without dropping other servers, preapproved where the base provider allows", async () => {
    const { startHtmlTool, withHtmlTool, baseProvider } = await import("./html-tool");
    const tool = await startHtmlTool();
    expect(tool.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const config = withHtmlTool({ provider: "claude", cwd: "/w", systemPrompt: "Base", mcpServers: { other: { type: "http", url: "x" } } }, tool);
    expect(Object.keys(config.mcpServers ?? {})).toEqual(["other", "chat_polish"]);
    expect(config.mcpServers?.chat_polish).toEqual({ type: "http", url: tool.url, headers: { Authorization: `Bearer ${tool.token}` }, alwaysLoad: true });
    expect(config.toolPolicy?.preapproved).toEqual([
      { kind: "mcp", server: "chat_polish", tool: "html_render" },
      { kind: "mcp", server: "chat_polish", tool: "html_preview" },
    ]);
    expect(config.systemPrompt).toMatch(/^Base\n\n# HTML pages\nYou have an html_render tool/);
    // No headless browser in this cache: nothing to preview pages in.
    expect(config.systemPrompt).not.toMatch(/html_preview/);
    // Paseo refuses to create an agent on a provider without exact-tool preapprovals that has a toolPolicy.
    const omp = withHtmlTool({ provider: "omp", cwd: "/w" }, tool);
    expect(omp.toolPolicy).toBeUndefined();
    expect(omp.mcpServers?.chat_polish?.type).toBe("http");
    // A configured provider gets its base's contract through a chain of extends; a custom ACP one gets none.
    const providers = { "claude-mobile": { extends: "claude" }, work: { extends: "claude-mobile" }, mine: { extends: "acp" }, loop: { extends: "loop" }, omp: {} };
    expect(["claude-mobile", "work", "mine", "loop", "omp", "codex"].map((id) => baseProvider(id, providers))).toEqual(["claude", "claude", "acp", "loop", "omp", "codex"]);
    expect(baseProvider("claude-mobile", undefined)).toBe("claude-mobile");
  });

  it("answers MCP over HTTP: lists the tool, rejects broken pages, publishes and stores a good one", async () => {
    const { startHtmlTool, readStoredPage } = await import("./html-tool");
    const tool = await startHtmlTool();
    const post = (body: unknown, token = tool.token) =>
      fetch(tool.url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const ask = async (id: number, method: string, params?: unknown) => (await (await post({ jsonrpc: "2.0", id, method, params })).json()) as RpcReply;
    expect((await post({ jsonrpc: "2.0", id: 1, method: "initialize" }, "wrong")).status).toBe(403);
    expect((await fetch(tool.url)).status).toBe(405);
    expect((await ask(1, "initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.name).toBe("chat_polish");
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const tools = (await ask(2, "tools/list")).result.tools;
    expect(tools.map((listed) => listed.name)).toEqual(["html_render"]);
    expect(tools[0]!.description).toMatch(/only when the user asks for a visual/);
    expect((await ask(3, "tools/call", { name: "html_render", arguments: { title: "t", html: "<style>.a{height:100vh}</style>" } })).result.isError).toBe(true);
    // An agent created while the browser was installed can still call html_preview: it reports what html_render would reject, and never publishes.
    const previewed = (await ask(3, "tools/call", { name: "html_preview", arguments: { html: "<style>.a{height:100vh}</style>" } })).result;
    expect(previewed.isError).toBe(false);
    expect(previewed.content).toHaveLength(1);
    expect(previewed.content[0]!.text).toMatch(/The page wasn't published[\s\S]*html_render would reject it for:\n- The page uses a viewport height unit \(100vh\)/);
    const ok = (await ask(4, "tools/call", { name: "html_render", arguments: { title: "t", html: "<p>Use 12px, not 100vh or names like ovhd</p>", force: true } })).result;
    expect(ok.isError).toBe(false);
    expect(ok.content[0]!.text).toMatch(/^Shown to the reader/);
    // Stored under the id in the answer, for the chat to load when Paseo cuts the call's input; an unknown id is null.
    const id = readPageId(ok)!;
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(await readStoredPage({ id })).toEqual({ html: "<p>Use 12px, not 100vh or names like ovhd</p>" });
    expect(await readStoredPage({ id: "0".repeat(64) })).toEqual({ html: null });
    const publish = async (html: string) => (await ask(5, "tools/call", { name: "html_render", arguments: { title: "t", html, force: true } })).result;
    expect((await publish('<div style="min-height:100dvh"></div>')).content[0]!.text).toMatch(/viewport height unit \(100dvh\)/);
    expect((await publish("<script>\nconst a = {;\n</script>")).content[0]!.text).toMatch(/^Script 1 has a syntax error on its line 2/);
    expect((await publish('<script type="module">import x from "https://x"</script><script type="application/json">{"a":</script>')).isError).toBe(false);
    expect((await publish('<img src="/nope/missing.png">')).content[0]!.text).toMatch(/could not be read: \/nope\/missing\.png/);
    expect((await publish(`<img src="${join(process.cwd(), "morphise.png")}">`)).isError).toBe(false);
  });

  it("serves a page for the system browser under its hash only, sandboxed, and keeps its address across a restart", async () => {
    const { startHtmlTool, openHtmlPage, closeLocalServer, localServerUsedBefore } = await import("./html-tool");
    const tool = await startHtmlTool();
    const { url } = await openHtmlPage({ html: "<p>hi</p>" });
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\.html$/);
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("<p>hi</p>");
    expect(page.headers.get("content-security-policy")).toMatch(/^sandbox allow-scripts/);
    expect(page.headers.get("content-security-policy")).toContain(`; ${PAGE_POLICY}`);
    // The token in it lets any local process call the tools as an agent.
    expect((await stat(join(cache, "server.json"))).mode & 0o777).toBe(0o600);
    expect((await fetch(new URL("/../server.json", url))).status).toBe(404);
    expect((await fetch(url.replace(/[0-9a-f]{64}/, "0".repeat(64)))).status).toBe(404);
    expect(await localServerUsedBefore()).toBe(true);
    await closeLocalServer();
    expect(await startHtmlTool()).toEqual(tool);
  });
});

describe("the headless browser", () => {
  it("is missing in a fresh cache; Remove deletes every version; a download that fails its pinned hash leaves nothing", async () => {
    const { installHeadlessShell, removeHeadlessShell, shellStatus, staleShell } = await import("./headless-shell");
    expect(shellStatus().state).toMatch(/^(missing|unsupported)$/);
    // Only an older version left behind: it was downloaded once, so a new one is fetched without asking.
    const old = join(cache, "chrome-headless-shell", "1.0.0");
    await mkdir(old, { recursive: true });
    expect(staleShell()).toBe(shellStatus().state !== "unsupported");
    await removeHeadlessShell();
    expect(await stat(old).then(() => true, () => false)).toBe(false);
    expect(staleShell()).toBe(false);
    if (shellStatus().state === "unsupported") return;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("not the shell");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await installHeadlessShell();
    } finally {
      globalThis.fetch = realFetch;
      warn.mockRestore();
    }
    expect(shellStatus().state).toBe("failed");
    expect(shellStatus().error).toMatch(/doesn't match its pinned hash/);
    expect(await readdir(join(cache, "chrome-headless-shell"))).toEqual([]);
  });

  it("leaves a page unchecked while it is not installed", async () => {
    const { checkPage } = await import("./page-check");
    expect(await checkPage("<p>x</p>")).toBeUndefined();
  });
});
