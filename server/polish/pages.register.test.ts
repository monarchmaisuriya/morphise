import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PluginPriorContribution, PluginServerContext, PluginSessionOpenContext, PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { documentSchema } from "../../shared/document";
import { TASK_LIST_INSTRUCTION } from "../plan-tools";
import { TITLE_HELPER } from "../titles";
import { addHtmlTools, registerLegacyConfig } from "./pages.register";
import * as agentFolders from "./pages/agent-folders";
import { folderOfToken, issueAgentToken } from "./pages/agent-folders";
import { pagesCacheDir } from "./pages/cache";
import * as htmlTools from "./pages/html-tool";
import { closeLocalServer, LEGACY_HTML_PROMPTS, startHtmlTool } from "./pages/html-tool";

const home = process.env.PASEO_HOME;
// Each suite uses an empty home; no daemon or installed plugin is contacted.
beforeAll(async () => { process.env.PASEO_HOME = await mkdtemp(join(tmpdir(), "morphise-pages-hook-")); });
afterEach(() => { vi.restoreAllMocks(); });
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
const request = (patch: Partial<PluginSessionOpenRequest> = {}): PluginSessionOpenRequest => ({
  agentId: "a", launchId: "launch-a", workspaceId: null, provider: "actual-alias", cwd: "/w", reason: "create", purpose: "interactive", title: null,
  background: false, labels: {}, metadata: {}, tools: [], env: {}, mcpServers: {},
  baseConfig: { provider: "actual-alias", cwd: "/w" },
  openSupport: {
    adapter: { kind: "builtin", id: "claude" }, instructions: "supported", mcpHttp: "supported", exactMcpPreapproval: "supported",
    attachedTools: { delivery: "native", enabled: true, disabledTools: [] },
    restrictions: { mcpConfiguration: "mutable", processEnvironment: "mutable" }, providerOptions: [],
  },
  ...patch,
});
// Fake host lifetime boundary. Actual same-instance/generation retention belongs to the host suite.
const context = (previous?: PluginPriorContribution, owner?: { hold(): void; release(): Promise<void> }) => {
  const cleanups: Array<(outcome: { installed: boolean }) => void | Promise<void>> = [];
  const installedCallbacks: Array<() => void | Promise<void>> = [];
  const launch = new AbortController();
  let installed = false;
  let users = 1;
  let retained = false;
  const release = async () => {
    if (--users !== 0) return;
    launch.abort();
    for (const cleanup of cleanups) await cleanup({ installed });
  };
  const value: PluginSessionOpenContext = {
    paseo: {} as PluginSessionOpenContext["paseo"], signal: new AbortController().signal,
    launch: {
      id: "launch-a", signal: launch.signal,
      onDispose: (cleanup) => void cleanups.push(cleanup),
      onInstalled: (callback) => void installedCallbacks.push(callback),
      retainPrevious: () => {
        if (!previous || !owner) throw new Error("No live owner-specific prior contribution; fully close the agent and retained children, then reopen");
        if (!retained) { owner.hold(); cleanups.push(() => owner.release()); retained = true; }
        return previous;
      },
    },
  };
  return {
    context: value, dispose: release, release,
    install: async () => { installed = true; for (const callback of installedCallbacks) await callback(); },
    hold: () => { if (!installed || launch.signal.aborted) throw new Error("Prior launch is not installed and live; fully close and reopen"); users++; },
    cleanups, retained: () => retained,
  };
};
const contributionOf = (opened: PluginSessionOpenRequest): PluginPriorContribution => ({
  launchId: "original-launch", mcpServers: opened.mcpServers, env: {},
  appendSystemPrompt: opened.appendSystemPrompt, toolPolicy: opened.toolPolicy,
});
const fixedRequest = (previousContribution?: PluginPriorContribution): PluginSessionOpenRequest => {
  const input = request({ reason: "refresh", previousContribution });
  return { ...input, openSupport: { ...input.openSupport!, adapter: { kind: "builtin", id: "opencode" }, restrictions: { mcpConfiguration: "fixed", processEnvironment: "fixed" } } };
};
const tokenOf = (opened: PluginSessionOpenRequest | undefined) => {
  const server = opened?.mcpServers.chat_polish;
  return server && "headers" in server ? server.headers!.Authorization!.replace(/^Bearer /, "") : "";
};

describe("HTML page tools at session opening", () => {
  it("adds launch-only tools and exact approvals without changing the actual alias or saved intent", async () => {
    const input = request();
    const before = JSON.stringify(input);
    const lifetime = context();
    const opened = await addHtmlTools(profile(true))({ request: input }, lifetime.context);
    expect(opened?.provider).toBe("actual-alias");
    expect(opened?.mcpServers.chat_polish?.type).toBe("http");
    expect(opened?.toolPolicy?.preapproved).toEqual([
      { kind: "mcp", server: "chat_polish", tool: "html_render" },
      { kind: "mcp", server: "chat_polish", tool: "html_guide" },
      { kind: "mcp", server: "chat_polish", tool: "html_preview" },
    ]);
    expect(opened?.appendSystemPrompt?.[0]).toContain("<morphise-html-pages>");
    expect(JSON.stringify(input)).toBe(before);
    await lifetime.dispose();
  });

  it.each(["unsupported", "unknown"] as const)("keeps HTML tools with ordinary prompts when exact approval is %s", async (exactMcpPreapproval) => {
    const input = request();
    const lifetime = context();
    const opened = await addHtmlTools(profile(true))({ request: { ...input, openSupport: { ...input.openSupport!, exactMcpPreapproval } } }, lifetime.context);
    expect(opened?.mcpServers.chat_polish).toBeDefined();
    expect(opened?.toolPolicy).toBeUndefined();
    await lifetime.dispose();
  });

  it("keeps tools without instruction delivery and restores guidance on the next supported open", async () => {
    const input = request();
    const settings = profile(true);
    const before = JSON.stringify(await settings.read());
    const first = context();
    const second = context();
    const limited = await addHtmlTools(settings)({ request: { ...input, openSupport: { ...input.openSupport!, instructions: "unknown" } } }, first.context);
    expect(limited?.mcpServers.chat_polish).toBeDefined();
    expect(limited?.appendSystemPrompt).toBeUndefined();
    const restored = await addHtmlTools(settings)({ request: input }, second.context);
    expect(restored?.appendSystemPrompt).toHaveLength(1);
    expect(JSON.stringify(await settings.read())).toBe(before);
    await first.dispose();
    await second.dispose();
  });

  it("does not exclude HTTP-capable adapters merely because exact approvals are unavailable", async () => {
    const input = request();
    const lifetime = context();
    const opened = await addHtmlTools(profile(true))({ request: { ...input, openSupport: { ...input.openSupport!, adapter: { kind: "acp" }, instructions: "unsupported", exactMcpPreapproval: "unknown" } } }, lifetime.context);
    expect(opened?.mcpServers.chat_polish).toBeDefined();
    expect(opened?.toolPolicy).toBeUndefined();
    expect(opened?.appendSystemPrompt).toBeUndefined();
    await lifetime.dispose();
  });

  it("keeps simultaneous launch tokens separate and revokes only the disposed launch", async () => {
    const first = context();
    const second = context();
    const hook = addHtmlTools(profile(true));
    const a = await hook({ request: request() }, first.context);
    const b = await hook({ request: request({ agentId: "b", cwd: "/other" }) }, second.context);
    expect(tokenOf(a)).not.toBe(tokenOf(b));
    expect(tokenOf(a)).not.toBe((await startHtmlTool()).token);
    expect(await folderOfToken(tokenOf(a))).toBe(resolve("/w"));
    await first.dispose();
    expect(await folderOfToken(tokenOf(a))).toBeUndefined();
    expect(await folderOfToken(tokenOf(b))).toBe(resolve("/other"));
    await second.dispose();
  });

  it("keeps the launch token alive after the hook invocation signal ends", async () => {
    const lifetime = context();
    const invocation = new AbortController();
    const opened = await addHtmlTools(profile(true))({ request: request() }, { ...lifetime.context, signal: invocation.signal });
    invocation.abort();
    expect(await folderOfToken(tokenOf(opened))).toBe(resolve("/w"));
    await lifetime.dispose();
    expect(await folderOfToken(tokenOf(opened))).toBeUndefined();
  });

  it("restores HTML after a limited open without changing preferences", async () => {
    const settings = profile(true);
    const before = JSON.stringify(await settings.read());
    const original = context();
    const limited = context();
    const restored = context();
    const hook = addHtmlTools(settings);
    const supported = request();
    const first = await hook({ request: supported }, original.context);
    expect(first?.mcpServers.chat_polish).toBeDefined();
    expect(await hook({ request: { ...supported, openSupport: { ...supported.openSupport!, mcpHttp: "unsupported" } } }, limited.context)).toBeUndefined();
    expect(limited.cleanups).toHaveLength(0);
    const last = await hook({ request: request({ reason: "refresh" }) }, restored.context);
    expect(last?.mcpServers.chat_polish).toBeDefined();
    expect(tokenOf(last)).not.toBe(tokenOf(first));
    expect(JSON.stringify(await settings.read())).toBe(before);
    await original.dispose();
    await restored.dispose();
  });

  it("keeps persistent token rows at baseline across 100 failed refresh and fixed reuse cycles", async () => {
    const legacy = await issueAgentToken("/work/legacy");
    const file = join(pagesCacheDir(), "agent-folders.json");
    const before = await readFile(file, "utf8");
    const baselineRows = Object.entries(JSON.parse(before));
    const hook = addHtmlTools(profile(true));
    const original = context();
    const opened = await hook({ request: request() }, original.context);
    expect(tokenOf(opened)).toMatch(/^[0-9a-f]{48}$/);
    await original.install();
    const previous = contributionOf(opened!);
    const incompatible = { ...previous, mcpServers: { chat_polish: { ...previous.mcpServers.chat_polish!, alwaysLoad: false } } };
    const tool = await startHtmlTool();
    const statusOf = async (token: string) => {
      const response = await fetch(tool.url, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      await response.text();
      return response.status;
    };
    expect(await statusOf(tokenOf(opened))).toBe(200);

    // Approved stress repetition: every cycle asserts the same outcomes, not a computed total or runner retry.
    for (let cycle = 0; cycle < 100; cycle++) {
      const candidate = context();
      const refreshed = await hook({ request: request({ reason: "refresh", previousContribution: previous }) }, candidate.context);
      expect(tokenOf(refreshed), `cycle ${cycle}: fresh refresh credential`).toMatch(/^[0-9a-f]{48}$/);
      expect(tokenOf(refreshed), `cycle ${cycle}: candidate must not own the installed token`).not.toBe(tokenOf(opened));
      expect(await folderOfToken(tokenOf(refreshed))).toBe(resolve("/w"));
      expect(await statusOf(tokenOf(refreshed))).toBe(200);
      expect(await readFile(file, "utf8"), `cycle ${cycle}: live candidate must not be persisted`).toBe(before);
      // A later open stage failed: the host disposes this candidate without installing it.
      await candidate.dispose();
      expect(await folderOfToken(tokenOf(refreshed)), `cycle ${cycle}: failed candidate token must be revoked`).toBeUndefined();
      expect(await statusOf(tokenOf(refreshed))).toBe(403);

      const dependent = context(previous, original);
      const retained = await hook({ request: fixedRequest(previous) }, dependent.context);
      expect(retained?.mcpServers.chat_polish).toEqual(opened!.mcpServers.chat_polish);
      expect(retained?.appendSystemPrompt).toEqual(opened!.appendSystemPrompt);
      expect(retained?.toolPolicy).toEqual(opened!.toolPolicy);
      expect(dependent.retained()).toBe(true);
      await dependent.install();
      await dependent.dispose();

      const rejected = context(incompatible, original);
      await expect(hook({ request: fixedRequest(incompatible) }, rejected.context)).rejects.toThrow(/fully close.*reopen/i);
      expect(rejected.retained(), `cycle ${cycle}: incompatible binding must not be retained`).toBe(false);
      await rejected.dispose();
      expect(original.context.launch.signal.aborted).toBe(false);
      expect(await folderOfToken(tokenOf(opened))).toBe(resolve("/w"));
      expect(await statusOf(tokenOf(opened)), `cycle ${cycle}: disposing candidates must preserve the installed original`).toBe(200);
      const saved = await readFile(file, "utf8");
      expect(Object.entries(JSON.parse(saved)), `cycle ${cycle}: persistent token rows must stay at baseline`).toEqual(baselineRows);
      expect(saved).toBe(before);
    }

    await original.dispose();
    expect(original.context.launch.signal.aborted, "no dependent lifetime may leak after 100 cycles").toBe(true);
    expect(await folderOfToken(tokenOf(opened))).toBeUndefined();
    expect(await statusOf(tokenOf(opened))).toBe(403);
    expect(await folderOfToken(legacy)).toBe(resolve("/work/legacy"));
    expect(await statusOf(legacy)).toBe(200);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("preserves saved endpoint, policy and text without allocating a token, including when Off", async () => {
    const token = await issueAgentToken("/w");
    const file = join(pagesCacheDir(), "agent-folders.json");
    const before = await readFile(file, "utf8");
    const saved = { provider: "actual-alias", cwd: "/w", systemPrompt: "Caller text", mcpServers: { chat_polish: { type: "http" as const, url: "http://caller.invalid/mcp" } }, toolPolicy: { preapproved: [{ kind: "mcp" as const, server: "chat_polish", tool: "caller_tool" }] } };
    const original = JSON.stringify(saved);
    const lifetime = context();
    expect(await addHtmlTools(profile(true))({ request: request({ baseConfig: saved }) }, lifetime.context)).toBeUndefined();
    expect(await addHtmlTools(profile(false))({ request: request({ baseConfig: saved }) }, lifetime.context)).toBeUndefined();
    expect(lifetime.cleanups).toHaveLength(0);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await folderOfToken(token)).toBe(resolve("/w"));
    expect(JSON.stringify(saved)).toBe(original);
  });

  it.each(["present", "ambiguous"] as const)("suppresses the whole HTML group for %s saved endpoint state before allocating credentials", async (state) => {
    const lifetime = context();
    expect(await addHtmlTools(profile(true))({ request: request({ legacyConfigState: { selectors: { "html-endpoint": state, "html-prompt-current": "absent" } } }) }, lifetime.context)).toBeUndefined();
    expect(lifetime.cleanups).toHaveLength(0);
  });

  it.each([true, false])("keeps an unadopted saved binding unchanged on a fixed provider without claiming ownership when HTML is %s", async (html) => {
    const initialize = vi.spyOn(htmlTools, "startHtmlTool");
    const mint = vi.spyOn(agentFolders, "issueLaunchToken");
    const lifetime = context();
    const input = request();
    const fixed = { ...input, baseConfig: { provider: "actual-alias", cwd: "/w", systemPrompt: "Caller HTML guidance", mcpServers: { chat_polish: { type: "http" as const, url: "http://caller.invalid/mcp" } }, toolPolicy: { preapproved: [{ kind: "mcp" as const, server: "chat_polish", tool: "caller_tool" }] } }, openSupport: { ...input.openSupport!, restrictions: { mcpConfiguration: "fixed" as const, processEnvironment: "fixed" as const } } };
    const before = JSON.stringify(fixed);
    expect(await addHtmlTools(profile(html))({ request: fixed }, lifetime.context)).toBeUndefined();
    expect(JSON.stringify(fixed)).toBe(before);
    expect(lifetime.cleanups).toHaveLength(0);
    expect(lifetime.retained()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it.each(["present", "ambiguous"] as const)("suppresses only HTML guidance for %s saved prompt state", async (state) => {
    const lifetime = context();
    const opened = await addHtmlTools(profile(true))({ request: request({ legacyConfigState: { selectors: { "html-prompt-current": state } } }) }, lifetime.context);
    expect(opened?.mcpServers.chat_polish).toBeDefined();
    expect(opened?.appendSystemPrompt).toBeUndefined();
    await lifetime.dispose();
  });

  it.each(["task-list-prompt", "task-list-prompt-before-html"])("does not mistake independent %s state for saved HTML guidance", async (id) => {
    const lifetime = context();
    const opened = await addHtmlTools(profile(true))({ request: request({ baseConfig: { provider: "actual-alias", cwd: "/w", systemPrompt: TASK_LIST_INSTRUCTION }, legacyConfigState: { selectors: { [id]: "present", "html-prompt-current": "absent" } } }) }, lifetime.context);
    expect(opened?.appendSystemPrompt).toHaveLength(1);
    await lifetime.dispose();
  });

  it("preserves a saved HTML prompt byte-for-byte after endpoint adoption", async () => {
    const lifetime = context();
    const systemPrompt = `Caller\n\n${LEGACY_HTML_PROMPTS[0]!.text}`;
    const baseConfig = { provider: "actual-alias", cwd: "/w", systemPrompt };
    const opened = await addHtmlTools(profile(true))({ request: request({ baseConfig }) }, lifetime.context);
    expect(opened?.mcpServers.chat_polish).toBeDefined();
    expect(opened?.appendSystemPrompt).toBeUndefined();
    expect(baseConfig.systemPrompt).toBe(systemPrompt);
    await lifetime.dispose();
  });

  it("treats unmatched HTML headings as ambiguous guidance without deleting caller text", async () => {
    const lifetime = context();
    const baseConfig = { provider: "actual-alias", cwd: "/w", systemPrompt: "# HTML pages\nMy own instructions" };
    const opened = await addHtmlTools(profile(true))({ request: request({ baseConfig }) }, lifetime.context);
    expect(opened?.mcpServers.chat_polish).toBeDefined();
    expect(opened?.appendSystemPrompt).toBeUndefined();
    expect(baseConfig.systemPrompt).toBe("# HTML pages\nMy own instructions");
    await lifetime.dispose();
  });

  it("does not allocate for unsupported HTTP, history, internal agents, title helpers or Off", async () => {
    const input = request();
    const lifetime = context();
    const hook = addHtmlTools(profile(true));
    expect(await hook({ request: { ...input, openSupport: { ...input.openSupport!, mcpHttp: "unknown" } } }, lifetime.context)).toBeUndefined();
    expect(await hook({ request: request({ purpose: "history" }) }, lifetime.context)).toBeUndefined();
    expect(await hook({ request: request({ baseConfig: { provider: "actual-alias", cwd: "/w", internal: true } }) }, lifetime.context)).toBeUndefined();
    expect(await hook({ request: request({ metadata: { [TITLE_HELPER]: true } }) }, lifetime.context)).toBeUndefined();
    expect(await addHtmlTools(profile(false))({ request: input }, lifetime.context)).toBeUndefined();
    expect(lifetime.cleanups).toHaveLength(0);
  });

  it("keeps the HTML child behavior independent of Show's child exclusion", async () => {
    const lifetime = context();
    const opened = await addHtmlTools(profile(true))({ request: request({ labels: { "paseo.parent-agent-id": "parent" } }) }, lifetime.context);
    expect(opened?.mcpServers.chat_polish).toBeDefined();
    await lifetime.dispose();
  });

  it.each([
    { html: true, mcpHttp: "supported" as const },
    { html: false, mcpHttp: "supported" as const },
    { html: true, mcpHttp: "unsupported" as const },
    { html: true, mcpHttp: "unknown" as const },
  ])("keeps a first fixed open empty without a prior HTML binding when HTML is $html and HTTP is $mcpHttp", async ({ html, mcpHttp }) => {
    const initialize = vi.spyOn(htmlTools, "startHtmlTool");
    const mint = vi.spyOn(agentFolders, "issueLaunchToken");
    const lifetime = context();
    const settings = profile(html);
    const fixed = fixedRequest();
    const input = { ...fixed, reason: "create" as const, openSupport: { ...fixed.openSupport!, mcpHttp } };
    const before = JSON.stringify(input);
    const saved = JSON.stringify(await settings.read());
    expect(await addHtmlTools(settings)({ request: input }, lifetime.context)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(await settings.read())).toBe(saved);
    expect(lifetime.cleanups).toHaveLength(0);
    expect(lifetime.retained()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it("keeps Off empty when a later open fixes the MCP configuration", async () => {
    const initialize = vi.spyOn(htmlTools, "startHtmlTool");
    const mint = vi.spyOn(agentFolders, "issueLaunchToken");
    const settings = profile(false);
    const saved = JSON.stringify(await settings.read());
    const hook = addHtmlTools(settings);
    const original = context();
    const first = request();
    const firstBefore = JSON.stringify(first);
    expect(await hook({ request: first }, original.context)).toBeUndefined();
    await original.install();
    const previous = { launchId: "original-launch", mcpServers: {}, env: {} };
    const dependent = context(previous, original);
    const fixed = fixedRequest(previous);
    const before = JSON.stringify(fixed);
    expect(await hook({ request: fixed }, dependent.context)).toBeUndefined();
    expect(JSON.stringify(first)).toBe(firstBefore);
    expect(JSON.stringify(fixed)).toBe(before);
    expect(JSON.stringify(await settings.read())).toBe(saved);
    expect(original.cleanups).toHaveLength(0);
    expect(dependent.cleanups).toHaveLength(0);
    expect(dependent.retained()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
    await dependent.dispose();
    await original.dispose();
  });

  it.each(["unsupported", "unknown"] as const)("does not add HTML after %s HTTP becomes supported with fixed MCP configuration", async (mcpHttp) => {
    const initialize = vi.spyOn(htmlTools, "startHtmlTool");
    const mint = vi.spyOn(agentFolders, "issueLaunchToken");
    const settings = profile(true);
    const saved = JSON.stringify(await settings.read());
    const hook = addHtmlTools(settings);
    const original = context();
    const first = request();
    const limited = { ...first, openSupport: { ...first.openSupport!, mcpHttp } };
    const firstBefore = JSON.stringify(limited);
    expect(await hook({ request: limited }, original.context)).toBeUndefined();
    await original.install();
    const previous = { launchId: "original-launch", mcpServers: {}, env: {} };
    const dependent = context(previous, original);
    const fixed = fixedRequest(previous);
    const before = JSON.stringify(fixed);
    expect(await hook({ request: fixed }, dependent.context)).toBeUndefined();
    expect(JSON.stringify(limited)).toBe(firstBefore);
    expect(JSON.stringify(fixed)).toBe(before);
    expect(JSON.stringify(await settings.read())).toBe(saved);
    expect(original.cleanups).toHaveLength(0);
    expect(dependent.cleanups).toHaveLength(0);
    expect(dependent.retained()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
    await dependent.dispose();
    await original.dispose();
  });

  it("does not mistake prior task or unrelated MCP contributions for an owned HTML binding", async () => {
    const initialize = vi.spyOn(htmlTools, "startHtmlTool");
    const mint = vi.spyOn(agentFolders, "issueLaunchToken");
    const previous = { launchId: "original-launch", mcpServers: { other: { type: "http" as const, url: "http://other.invalid/mcp" } }, env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" }, appendSystemPrompt: ["Prior task guidance"], providerOptions: { oldOption: true } };
    const lifetime = context(previous);
    const input = { ...fixedRequest(previous), env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: "0" }, appendSystemPrompt: ["Current task guidance"], providerOptions: { currentOption: true } };
    const before = JSON.stringify(input);
    expect(await addHtmlTools(profile(true))({ request: input }, lifetime.context)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
    expect(lifetime.cleanups).toHaveLength(0);
    expect(lifetime.retained()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it.each([
    { authority: "missing", headers: undefined },
    { authority: "unknown", headers: { Authorization: "Bearer 000000000000000000000000000000000000000000000000" } },
  ])("rejects a prior HTML binding with $authority credential authority instead of treating it as empty", async ({ headers }) => {
    const initialize = vi.spyOn(htmlTools, "startHtmlTool");
    const mint = vi.spyOn(agentFolders, "issueLaunchToken");
    const previous = { launchId: "original-launch", mcpServers: { chat_polish: { type: "http" as const, url: "http://127.0.0.1:1/mcp", headers, alwaysLoad: true } }, env: {} };
    const lifetime = context(previous);
    const input = fixedRequest(previous);
    const before = JSON.stringify(input);
    await expect(addHtmlTools(profile(true))({ request: input }, lifetime.context)).rejects.toThrow(/fully close.*reopen/i);
    expect(JSON.stringify(input)).toBe(before);
    expect(lifetime.cleanups).toHaveLength(0);
    expect(lifetime.retained()).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it("reuses the exact HTML binding and keeps its token alive until the dependent launch releases it", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    const dependent = context(previous, original);
    const input = fixedRequest(previous);
    const refreshed = await addHtmlTools(profile(true))({ request: input }, dependent.context);
    expect(refreshed?.mcpServers.chat_polish).toEqual(opened?.mcpServers.chat_polish);
    expect(refreshed?.appendSystemPrompt).toEqual(opened?.appendSystemPrompt);
    expect(refreshed?.toolPolicy).toEqual(opened?.toolPolicy);
    expect(dependent.retained()).toBe(true);
    await original.dispose();
    expect(original.context.launch.signal.aborted).toBe(false);
    expect(await folderOfToken(tokenOf(refreshed))).toBe(resolve("/w"));
    await dependent.dispose();
    expect(original.context.launch.signal.aborted).toBe(true);
    expect(await folderOfToken(tokenOf(refreshed))).toBeUndefined();
  });

  it("does not replay prior task or unrelated environment/options while retaining HTML", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = { ...contributionOf(opened!), env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: "1", OTHER_PLUGIN: "old" }, providerOptions: { oldOption: true }, appendSystemPrompt: ["<morphise-task-list>old task guidance</morphise-task-list>", ...opened!.appendSystemPrompt!], toolPolicy: { preapproved: [...opened!.toolPolicy!.preapproved, { kind: "mcp" as const, server: "other", tool: "old_tool" }] } };
    const dependent = context(previous, original);
    const input = { ...fixedRequest(previous), env: { CALLER: "keep", CLAUDE_CODE_ENABLE_TODO_TOOLS: "0" }, appendSystemPrompt: ["Current task guidance"], providerOptions: { currentOption: true } };
    const refreshed = await addHtmlTools(profile(true))({ request: input }, dependent.context);
    expect(refreshed?.env).toEqual({ CALLER: "keep", CLAUDE_CODE_ENABLE_TODO_TOOLS: "0" });
    expect(refreshed?.providerOptions).toEqual({ currentOption: true });
    expect(refreshed?.appendSystemPrompt).toEqual(["Current task guidance", ...opened!.appendSystemPrompt!]);
    expect(refreshed?.toolPolicy?.preapproved).toEqual(opened!.toolPolicy!.preapproved);
    await dependent.dispose();
    await original.dispose();
  });

  it("keeps ordinary approval mode on a fixed refresh when exact support is unavailable", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    const dependent = context(previous, original);
    const input = fixedRequest(previous);
    const refreshed = await addHtmlTools(profile(true))({ request: { ...input, openSupport: { ...input.openSupport!, exactMcpPreapproval: "unknown" } } }, dependent.context);
    expect(refreshed?.mcpServers.chat_polish).toEqual(opened?.mcpServers.chat_polish);
    expect(refreshed?.toolPolicy).toBeUndefined();
    await dependent.dispose();
    await original.dispose();
  });

  it("retains an instruction-free ordinary-approval HTML binding when those support limits are unchanged", async () => {
    const original = context();
    const input = request();
    const limitedSupport = { ...input.openSupport!, instructions: "unsupported" as const, exactMcpPreapproval: "unknown" as const };
    const opened = await addHtmlTools(profile(true))({ request: { ...input, openSupport: limitedSupport } }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    const dependent = context(previous, original);
    const fixed = fixedRequest(previous);
    const refreshed = await addHtmlTools(profile(true))({ request: { ...fixed, openSupport: { ...fixed.openSupport!, instructions: "unsupported", exactMcpPreapproval: "unknown" } } }, dependent.context);
    expect(refreshed?.mcpServers.chat_polish).toEqual(opened?.mcpServers.chat_polish);
    expect(refreshed?.appendSystemPrompt).toBeUndefined();
    expect(refreshed?.toolPolicy).toBeUndefined();
    expect(dependent.retained()).toBe(true);
    await dependent.dispose();
    await original.dispose();
  });

  it("rejects Off and incompatible guidance/support before retaining a fixed contribution", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    const dependent = context(previous, original);
    const input = fixedRequest(previous);
    await expect(addHtmlTools(profile(false))({ request: input }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    await expect(addHtmlTools(profile(true))({ request: { ...input, openSupport: { ...input.openSupport!, instructions: "unsupported" } } }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    await expect(addHtmlTools(profile(true))({ request: { ...input, openSupport: { ...input.openSupport!, mcpHttp: "unsupported" } } }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    expect(dependent.retained()).toBe(false);
    expect(await folderOfToken(tokenOf(opened))).toBe(resolve("/w"));
    await original.dispose();
  });

  it("rejects a changed settings-generated prompt rather than retaining stale preview guidance", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = { ...contributionOf(opened!), appendSystemPrompt: [opened!.appendSystemPrompt![0]!.replace("\n\nYour reply", "\nPreview guidance from a different browser setting\n\nYour reply")] };
    const dependent = context(previous, original);
    await expect(addHtmlTools(profile(true))({ request: fixedRequest(previous) }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    expect(dependent.retained()).toBe(false);
    await original.dispose();
  });

  it("rejects changed exclusions or a newly occupied caller name rather than silently dropping fixed HTML", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    const dependent = context(previous, original);
    const input = fixedRequest(previous);
    await expect(addHtmlTools(profile(true))({ request: { ...input, metadata: { [TITLE_HELPER]: true } } }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    await expect(addHtmlTools(profile(true))({ request: { ...input, baseConfig: { provider: input.provider, cwd: input.cwd, mcpServers: { chat_polish: { type: "http", url: "http://caller.invalid/mcp" } } } } }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    expect(dependent.retained()).toBe(false);
    await original.dispose();
  });

  it("rejects a modified prior binding or missing prior exact grants before retaining", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    const binding = previous.mcpServers.chat_polish!;
    const modified = { ...previous, mcpServers: { chat_polish: { ...binding, alwaysLoad: false } } };
    const changedBinding = context(modified, original);
    await expect(addHtmlTools(profile(true))({ request: fixedRequest(modified) }, changedBinding.context)).rejects.toThrow(/fully close.*reopen/i);
    const noGrants = { ...previous, toolPolicy: undefined };
    const changedGrants = context(noGrants, original);
    await expect(addHtmlTools(profile(true))({ request: fixedRequest(noGrants) }, changedGrants.context)).rejects.toThrow(/fully close.*reopen/i);
    expect(changedBinding.retained()).toBe(false);
    expect(changedGrants.retained()).toBe(false);
    await original.dispose();
  });

  it("fails when the host cannot retain a prior instance or when its token no longer matches the folder", async () => {
    const original = context();
    const opened = await addHtmlTools(profile(true))({ request: request() }, original.context);
    await original.install();
    const previous = contributionOf(opened!);
    await expect(addHtmlTools(profile(true))({ request: fixedRequest(previous) }, context().context)).rejects.toThrow(/fully close.*reopen/i);
    const dependent = context(previous, original);
    await expect(addHtmlTools(profile(true))({ request: { ...fixedRequest(previous), cwd: "/other" } }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    await original.dispose();
    await expect(addHtmlTools(profile(true))({ request: fixedRequest(previous) }, dependent.context)).rejects.toThrow(/fully close.*reopen/i);
    expect(dependent.retained()).toBe(false);
  });

  it("keeps the existing unreadable-profile behavior", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await addHtmlTools({ read: async () => Promise.reject(new Error("disk")) })({ request: request() }, context().context)).toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("registers literal legacy suffixes and exact grants, never a heading-only removal recipe", () => {
    const recipes: Array<Parameters<PluginServerContext["registerLegacyAgentConfig"]>[0]> = [];
    registerLegacyConfig({ registerLegacyAgentConfig: (recipe) => recipes.push(recipe) });
    expect(recipes).toHaveLength(1);
    const recipe = recipes[0]!;
    expect(recipe.selectors.filter((selector) => selector.kind === "prompt-section")).toEqual([]);
    expect(recipe.selectors.filter((selector) => selector.kind === "prompt-suffix")).toHaveLength(10);
    expect(recipe.selectors.filter((selector) => selector.kind === "grant")).toEqual([
      { id: "html-grant-html_render", group: "html", label: "HTML html_render approval", kind: "grant", server: "chat_polish", tool: "html_render" },
      { id: "html-grant-html_guide", group: "html", label: "HTML html_guide approval", kind: "grant", server: "chat_polish", tool: "html_guide" },
      { id: "html-grant-html_preview", group: "html", label: "HTML html_preview approval", kind: "grant", server: "chat_polish", tool: "html_preview" },
    ]);
    expect(recipe.selectors.find((selector) => selector.kind === "env")).toMatchObject({ key: "CLAUDE_CODE_ENABLE_TODO_TOOLS", baselines: [{ id: "inherit", kind: "absent" }, { id: "off", kind: "value", value: "0" }, { id: "on", kind: "value", value: "1" }] });
    expect(recipe.selectors.filter((selector) => selector.kind === "option")).toEqual([]);
  });

  it("selects only task guidance before eight exact HTML successors, leaving HTML outside the removal text", () => {
    const recipes: Array<Parameters<PluginServerContext["registerLegacyAgentConfig"]>[0]> = [];
    registerLegacyConfig({ registerLegacyAgentConfig: (recipe) => recipes.push(recipe) });
    const standalone = recipes[0]!.selectors.find((selector) => selector.id === "task-list-prompt");
    const beforeHtml = recipes[0]!.selectors.find((selector) => selector.id === "task-list-prompt-before-html");
    expect(standalone).toEqual({ id: "task-list-prompt", group: "task-list", label: "Claude task-list guidance", kind: "prompt-suffix", text: TASK_LIST_INSTRUCTION });
    expect(beforeHtml).toEqual({
      id: "task-list-prompt-before-html", group: "task-list", label: "Claude task-list guidance before HTML", kind: "prompt-suffix",
      text: TASK_LIST_INSTRUCTION,
      followedBySuffix: LEGACY_HTML_PROMPTS.map(({ text }) => `\n\n${text}`),
    });
    expect(beforeHtml?.kind === "prompt-suffix" && beforeHtml.followedBySuffix).toHaveLength(8);
    expect(beforeHtml?.kind === "prompt-suffix" && beforeHtml.followedBySuffix).not.toContain("");
    // Parent-owned host projection tests verify removal; this test pins the recipe's exact text boundary.
  });

  it("rejects a host without adaptive features before registering anything", async () => {
    const { default: contribute } = await import("../../index.server");
    expect(() => contribute({} as PluginServerContext)).toThrow(/update the host/i);
  });
});
