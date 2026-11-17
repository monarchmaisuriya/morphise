// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/html.test.mjs
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readPageId, readReplaces } from "../../../shared/polish/html";
import { PAGE_POLICY } from "../../../shared/polish/page";

interface RpcReply {
  result: { isError: boolean; content: Array<{ type: string; text: string }>; tools: Array<{ name: string; description: string }>; serverInfo: { name: string } };
}

// Every path the code under test asked the file system about.
const touched = vi.hoisted(() => [] as string[]);
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const recorded =
    <A extends unknown[], R>(call: (path: string, ...rest: A) => R) =>
    (path: string, ...rest: A) => {
      touched.push(String(path));
      return call(path, ...rest);
    };
  return { ...actual, stat: recorded(actual.stat), lstat: recorded(actual.lstat), open: recorded(actual.open), readFile: recorded(actual.readFile), realpath: recorded(actual.realpath) };
});

// A tool call to the local server as an agent holding `token`.
const callAs = (url: string, token: string) => async (name: string, html: string, force = true) => {
  const body = { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: { title: "t", html, force } } };
  const reply = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return ((await reply.json()) as RpcReply).result;
};
const LEGACY_NOTE = "Local images were not checked for this chat; a new chat can preview them.";

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
      { kind: "mcp", server: "chat_polish", tool: "html_guide" },
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

  it("adds the tools once: on a config that has them (a stored agent Paseo re-creates), it only replaces the token", async () => {
    const { startHtmlTool, withHtmlTool } = await import("./html-tool");
    const tool = await startHtmlTool();
    const once = withHtmlTool({ provider: "claude", cwd: "/w", systemPrompt: "Base", toolPolicy: { preapproved: [{ kind: "mcp", server: "other", tool: "x" }] } }, tool);
    expect(withHtmlTool(once, tool)).toEqual(once);
    const renewed = withHtmlTool(once, { url: tool.url, token: "renewed" });
    expect(renewed).toEqual({ ...once, mcpServers: { chat_polish: { ...once.mcpServers!.chat_polish!, headers: { Authorization: "Bearer renewed" } } } });
  });

  it("answers MCP over HTTP: lists the tool, rejects broken pages, publishes and stores a good one", async () => {
    const { startHtmlTool, readStoredPage, keepStoredPage } = await import("./html-tool");
    const tool = await startHtmlTool();
    const post = (body: unknown, token = tool.token) =>
      fetch(tool.url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const ask = async (id: number, method: string, params?: unknown) => (await (await post({ jsonrpc: "2.0", id, method, params })).json()) as RpcReply;
    expect((await post({ jsonrpc: "2.0", id: 1, method: "initialize" }, "wrong")).status).toBe(403);
    expect((await fetch(tool.url)).status).toBe(405);
    expect((await ask(1, "initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.name).toBe("chat_polish");
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const tools = (await ask(2, "tools/list")).result.tools;
    expect(tools.map((listed) => listed.name)).toEqual(["html_render", "html_guide"]);
    expect(tools[0]!.description).toMatch(/call html_guide with the kind of page/);
    const chartsGuide = (await ask(20, "tools/call", { name: "html_guide", arguments: { topic: "charts" } })).result;
    expect(chartsGuide.isError).toBe(false);
    expect(chartsGuide.content[0].text).toMatch(/Morphise\.chart/);
    const unknownGuide = (await ask(21, "tools/call", { name: "html_guide", arguments: { topic: "poems" } })).result;
    expect(unknownGuide.isError).toBe(true);
    expect(unknownGuide.content[0].text).toMatch(/charts, tables, diagrams, images, interactive, mockups/);
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
    // Save keeps a copy past the 30-day cleanup; a page that isn't stored can't be kept.
    expect(await keepStoredPage({ id, keep: true })).toEqual({ kept: true });
    expect(await keepStoredPage({ id: "0".repeat(64), keep: true })).toEqual({ kept: false });
    expect(await keepStoredPage({ id, keep: false })).toEqual({ kept: false });
    await expect(keepStoredPage({ id: "../x", keep: true })).rejects.toThrow(/Not a page id/);
    // An update names the page it replaces; the same page, an unknown id or a malformed one is refused.
    const update = async (html: string, replaces: string) => (await ask(6, "tools/call", { name: "html_render", arguments: { title: "t", html, force: true, replaces } })).result;
    const updated = await update("<p>Second version</p>", id);
    expect(updated.isError).toBe(false);
    expect(readReplaces(updated)).toBe(id);
    // The same page published again (a revert) gets an id of its own, so it can replace the version between.
    const reverted = await update("<p>Use 12px, not 100vh or names like ovhd</p>", readPageId(updated)!);
    expect(reverted.isError).toBe(false);
    expect(readPageId(reverted)).not.toBe(id);
    expect((await update("<p>Third</p>", "f".repeat(64))).content[0]!.text).toMatch(/No page f+ is stored/);
    expect((await update("<p>Third</p>", "page-1")).isError).toBe(true);
    const publish = async (html: string) => (await ask(5, "tools/call", { name: "html_render", arguments: { title: "t", html, force: true } })).result;
    expect((await publish('<div style="min-height:100dvh"></div>')).content[0]!.text).toMatch(/viewport height unit \(100dvh\)/);
    expect((await publish("<script>\nconst a = {;\n</script>")).content[0]!.text).toMatch(/^Script 1 has a syntax error on its line 2/);
    expect((await publish('<script type="module">import x from "https://x"</script><script type="application/json">{"a":</script>')).isError).toBe(false);
    // This token is the shared one agents created before per-agent tokens hold: their pages' local images are neither read nor checked.
    const missing = await publish('<img src="/nope/missing.png">');
    expect(missing.isError).toBe(false);
    expect(missing.content[0]!.text).toContain(LEGACY_NOTE);
    expect((await publish(`<img src="${join(process.cwd(), "morphise.png")}">`)).isError).toBe(false);
    // An agent with its own token gets its images checked inside its folder.
    const { issueAgentToken } = await import("./agent-folders");
    const own = callAs(tool.url, await issueAgentToken(process.cwd()));
    expect((await own("html_render", '<img src="/nope/missing.png">')).content[0]!.text).toMatch(/could not be read inside your working folder: \/nope\/missing\.png/);
    const inside = await own("html_render", `<img src="${join(process.cwd(), "morphise.png")}">`);
    expect(inside.isError).toBe(false);
    expect(inside.content[0]!.text).not.toContain(LEGACY_NOTE);
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

describe("which local images a tool call may open", () => {
  let base = "";
  let work = "";
  let outside = "";
  let png: Buffer;
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "morphise-pages-images-"));
    work = join(base, "work");
    outside = join(base, "outside");
    await mkdir(work);
    await mkdir(outside);
    png = await readFile(join(process.cwd(), "morphise.png"));
    await writeFile(join(work, "inside.png"), png);
  });
  afterAll(() => rm(base, { recursive: true, force: true }));

  it("refuses a call without a bearer token the server knows", async () => {
    const { startHtmlTool } = await import("./html-tool");
    const { issueAgentToken } = await import("./agent-folders");
    const tool = await startHtmlTool();
    const ping = async (headers: Record<string, string>) =>
      (await fetch(tool.url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) })).status;
    expect(await ping({})).toBe(403);
    expect(await ping({ Authorization: "" })).toBe(403);
    expect(await ping({ Authorization: "Bearer " })).toBe(403);
    expect(await ping({ Authorization: "Bearer short" })).toBe(403);
    expect(await ping({ Authorization: `Bearer ${"0".repeat(tool.token.length)}` })).toBe(403);
    expect(await ping({ Authorization: tool.token })).toBe(403);
    expect(await ping({ Authorization: `Bearer ${tool.token}` })).toBe(200);
    expect(await ping({ Authorization: `Bearer ${await issueAgentToken(work)}` })).toBe(200);
  });

  it("opens an agent's page images only inside its folder, and answers the same whether an outside image exists or not", async () => {
    const { startHtmlTool } = await import("./html-tool");
    const { issueAgentToken } = await import("./agent-folders");
    const tool = await startHtmlTool();
    const call = callAs(tool.url, await issueAgentToken(work));
    expect((await call("html_render", `<img src="${join(work, "inside.png")}">`)).isError).toBe(false);
    const secret = join(outside, "secret.png");
    await symlink(secret, join(work, "out.png"));
    for (const path of [secret, `${work}/../outside/secret.png`, join(work, "out.png")]) {
      const page = `<p>x</p><img src="${path}">`;
      await writeFile(secret, png);
      touched.length = 0;
      const exists = [await call("html_render", page), await call("html_preview", page)];
      expect(touched.filter((asked) => asked.startsWith(outside))).toEqual([]);
      await rm(secret);
      const missing = [await call("html_render", page), await call("html_preview", page)];
      expect(JSON.stringify(missing)).toBe(JSON.stringify(exists));
      expect(exists[0]!.isError).toBe(true);
      expect(exists[0]!.content[0]!.text).toBe(`These local images could not be read inside your working folder: ${path}. Use absolute paths to image files inside it, or remove them.`);
      expect(exists[1]!.content[0]!.text).toContain(`could not be read inside your working folder: ${path}`);
    }
  });

  it("opens and looks up no local image for a chat holding the shared token, and says so when it publishes", async () => {
    const { startHtmlTool } = await import("./html-tool");
    const tool = await startHtmlTool();
    const call = callAs(tool.url, tool.token);
    await writeFile(join(outside, "legacy.png"), png);
    const page = `<p>x</p><img src="${join(work, "inside.png")}"><img src="${join(outside, "legacy.png")}"><img src="/nope/missing.png">`;
    touched.length = 0;
    const published = await call("html_render", page, false);
    const previewed = await call("html_preview", page);
    expect(touched.filter((asked) => asked.startsWith(base) || asked.startsWith("/nope"))).toEqual([]);
    expect(published.isError).toBe(false);
    expect(published.content[0]!.text).toContain(LEGACY_NOTE);
    expect(previewed.content[0]!.text).toContain("html_render's checks pass.");
    expect(previewed.content[0]!.text).toContain(LEGACY_NOTE);
    // Without local images there is nothing to note.
    expect((await call("html_render", "<p>x</p>")).content[0]!.text).not.toContain(LEGACY_NOTE);
  });

  it("inlines only images inside the calling agent's folder for the layout check, and none for a chat without one", async () => {
    const { inlineLocalImages } = await import("./page-check");
    const secret = join(outside, "inline.png");
    await writeFile(secret, png);
    const page = `<img src="${join(work, "inside.png")}"><img src="${secret}">`;
    touched.length = 0;
    const inlined = await inlineLocalImages(page, work);
    expect(inlined).toBe(`<img src="data:image/png;base64,${png.toString("base64")}"><img src="${secret}">`);
    expect(touched.filter((asked) => asked.startsWith(outside))).toEqual([]);
    touched.length = 0;
    expect(await inlineLocalImages(page, undefined)).toBe(page);
    expect(touched).toEqual([]);
  });
});

describe("an agent folder store that cannot be read at start", () => {
  it("is set aside and logged; calls with a per-agent token are refused, calls with the shared token still work", async () => {
    await (await import("./html-tool")).closeLocalServer();
    const before = process.env.PASEO_HOME;
    process.env.PASEO_HOME = await mkdtemp(join(tmpdir(), "morphise-pages-corrupt-"));
    const pages = join(process.env.PASEO_HOME, "plugin-cache", "morphise", "pages");
    await mkdir(pages, { recursive: true });
    await writeFile(join(pages, "agent-folders.json"), "{not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { startHtmlTool, closeLocalServer } = await import("./html-tool");
    try {
      const tool = await startHtmlTool();
      const ping = async (token: string) =>
        (await fetch(tool.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) })).status;
      expect(await ping("1".repeat(tool.token.length))).toBe(403);
      expect(await ping(tool.token)).toBe(200);
      expect((await readdir(pages)).filter((name) => /^agent-folders\.json\.corrupt-\d+$/.test(name))).toHaveLength(1);
      expect(warn.mock.calls.some(([line]) => String(line).includes("set aside"))).toBe(true);
    } finally {
      await closeLocalServer();
      warn.mockRestore();
      process.env.PASEO_HOME = before;
    }
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
    expect(await checkPage("<p>x</p>", undefined)).toBeUndefined();
  });
});
