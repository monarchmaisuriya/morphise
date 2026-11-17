import { chmod, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PluginHookContext } from "@getpaseo/plugin/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { documentSchema } from "../../shared/document";
import { TITLE_HELPER } from "../titles";
import { addHtmlTools } from "./pages.register";
import { folderOfToken } from "./pages/agent-folders";
import { pagesCacheDir } from "./pages/cache";
import { closeLocalServer, startHtmlTool } from "./pages/html-tool";

const home = process.env.PASEO_HOME;
beforeAll(async () => {
  process.env.PASEO_HOME = await mkdtemp(join(tmpdir(), "morphise-pages-hook-"));
});
afterAll(async () => {
  await closeLocalServer();
  if (home === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = home;
});

const profile = (html?: boolean) => {
  const document = documentSchema.parse({});
  const layout = document.layouts[0]!.profile;
  if (html !== undefined) layout.chat = { ...layout.chat, polish: { html } } as typeof layout.chat;
  return { read: async () => ({ status: "ready" as const, values: document, revision: "r1" }) };
};
const context = (providers: unknown = {}) =>
  ({ paseo: { config: { get: async () => ({ requestId: "1", config: { providers } }) } }, signal: new AbortController().signal }) as unknown as PluginHookContext;
const request = (config: Record<string, unknown> = {}) => ({ request: { config: { provider: "claude", cwd: "/w", ...config }, metadata: {} } });
const tokenOf = (config: { mcpServers?: Record<string, unknown> } | undefined) => (config?.mcpServers?.chat_polish as { headers: { Authorization: string } }).headers.Authorization.replace(/^Bearer /, "");
const savedTokens = async () => Object.keys(JSON.parse(await readFile(join(pagesCacheDir(), "agent-folders.json"), "utf8")) as object).length;

describe("HTML page tools for new agents", () => {
  it("adds the chat_polish server while the option is on, preapproved through the provider's base", async () => {
    const result = await addHtmlTools(profile(true))(request(), context());
    expect(result?.config.mcpServers?.chat_polish?.type).toBe("http");
    expect(result?.config.toolPolicy?.preapproved).toHaveLength(3);
    expect(result?.metadata).toEqual({});
    const derived = await addHtmlTools(profile(true))(request({ provider: "work" }), context({ work: { extends: "claude" } }));
    expect(derived?.config.toolPolicy?.preapproved).toHaveLength(3);
  });

  it("gives each new agent its own token, saved with the agent's folder, not the server's shared one", async () => {
    const result = await addHtmlTools(profile(true))(request({ cwd: "/w/project/.." }), context());
    const token = tokenOf(result?.config);
    expect(token).not.toBe((await startHtmlTool()).token);
    expect(await folderOfToken(token)).toBe(resolve("/w"));
  });

  it("keeps the token of a stored agent Paseo re-creates when it maps to the agent's folder, and gives a new one otherwise", async () => {
    const created = (await addHtmlTools(profile(true))(request(), context()))!.config;
    const saved = await savedTokens();
    const recreated = await addHtmlTools(profile(true))({ request: { config: created, metadata: {} } }, context());
    expect(tokenOf(recreated?.config)).toBe(tokenOf(created));
    expect(recreated?.config).toEqual(created);
    expect(await savedTokens()).toBe(saved);
    // The same token for another folder, or the shared token of an agent created before per-agent tokens: a new token for this folder.
    const moved = await addHtmlTools(profile(true))({ request: { config: { ...created, cwd: "/elsewhere" }, metadata: {} } }, context());
    expect(await folderOfToken(tokenOf(moved?.config))).toBe(resolve("/elsewhere"));
    const shared = { ...created, mcpServers: { chat_polish: { type: "http", url: "x", headers: { Authorization: `Bearer ${(await startHtmlTool()).token}` } } } } as typeof created;
    const upgraded = await addHtmlTools(profile(true))({ request: { config: shared, metadata: {} } }, context());
    expect(await folderOfToken(tokenOf(upgraded?.config))).toBe(resolve("/w"));
  });

  it.skipIf(process.getuid?.() === 0)("creates the agent as Paseo would when its token cannot be saved, and says why", async () => {
    await addHtmlTools(profile(true))(request(), context());
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await chmod(pagesCacheDir(), 0o500);
    try {
      expect(await addHtmlTools(profile(true))(request(), context())).toBeUndefined();
    } finally {
      await chmod(pagesCacheDir(), 0o700);
    }
    expect(error.mock.calls.some(([line]) => String(line).includes("html tools"))).toBe(true);
    error.mockRestore();
  });

  it("adds them by default, leaves agents alone while the option is off, and never touches internal agents", async () => {
    expect((await addHtmlTools(profile())(request(), context()))?.config.mcpServers?.chat_polish?.type).toBe("http");
    expect(await addHtmlTools(profile(false))(request(), context())).toBeUndefined();
    expect(await addHtmlTools(profile(true))(request({ internal: true }), context())).toBeUndefined();
  });

  it("never gives them to Morphise's title helper, which reads chat text that may carry instructions", async () => {
    const helper = { request: { ...request().request, metadata: { [TITLE_HELPER]: true } } };
    expect(await addHtmlTools(profile(true))(helper, context())).toBeUndefined();
  });

  it("creates the agent as Paseo would when the profile cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { read: async () => Promise.reject(new Error("disk")) };
    expect(await addHtmlTools(broken)(request(), context())).toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("gives the tools only to providers that support them, judging an unresolvable one by its own id", async () => {
    const failing = { paseo: { config: { get: async () => Promise.reject(new Error("rpc")) } }, signal: new AbortController().signal } as unknown as PluginHookContext;
    expect(await addHtmlTools(profile(true))(request({ provider: "work" }), failing)).toBeUndefined();
    expect((await addHtmlTools(profile(true))(request({ provider: "claude" }), failing))?.config.mcpServers?.chat_polish).toBeDefined();
  });
});
