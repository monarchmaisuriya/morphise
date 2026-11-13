import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginHookContext } from "@getpaseo/plugin/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { documentSchema } from "../../shared/document";
import { TITLE_HELPER } from "../titles";
import { addHtmlTools } from "./pages.register";
import { closeLocalServer } from "./pages/html-tool";

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

describe("HTML page tools for new agents", () => {
  it("adds the chat_polish server while the option is on, preapproved through the provider's base", async () => {
    const result = await addHtmlTools(profile(true))(request(), context());
    expect(result?.config.mcpServers?.chat_polish?.type).toBe("http");
    expect(result?.config.toolPolicy?.preapproved).toHaveLength(2);
    expect(result?.metadata).toEqual({});
    const derived = await addHtmlTools(profile(true))(request({ provider: "work" }), context({ work: { extends: "claude" } }));
    expect(derived?.config.toolPolicy?.preapproved).toHaveLength(2);
  });

  it("leaves agents alone while the option is off (the default) and never touches internal agents", async () => {
    expect(await addHtmlTools(profile())(request(), context())).toBeUndefined();
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
