import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import type { PluginHookPayload, PluginServerContext, PluginSessionOpenContext, PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { bookmarkDocumentSchema } from "../../shared/bookmarks";
import { activeProfile } from "../../shared/document";
import { browserStatus, HTML_GUIDE_TOOL, HTML_PREVIEW_TOOL, HTML_SERVER, HTML_TOOL, installBrowser, keepPage, openHtml, removeBrowser, storedPage } from "../../shared/polish/html";
import { polishPrefs } from "../../shared/polish/prefs";
import { folderOfToken, issueLaunchToken, loadAgentFolders } from "./pages/agent-folders";
import { installHeadlessShell, removeHeadlessShell, shellStatus, staleShell } from "./pages/headless-shell";
import { closeLocalServer, keepStoredPage, pruneKept, LEGACY_HTML_PROMPTS, localServerUsedBefore, openHtmlPage, readStoredPage, startHtmlTool, withHtmlTool } from "./pages/html-tool";
import { TITLE_HELPER } from "../titles";
import { TASK_LIST_INSTRUCTION, TODO_TOOLS_ENV } from "../plan-tools";
import type { ProfileReader } from "./profile-reader";

type OpenHook = (payload: PluginHookPayload<"agent.open.before">, context: PluginSessionOpenContext) => Promise<PluginSessionOpenRequest | undefined>;

// HTML pages are derived at each interactive open, independently of Show and the steps card.
async function htmlPagesOn(profile: ProfileReader) {
  try {
    const state = await profile.read();
    return state.status === "ready" && polishPrefs(activeProfile(state.values).chat).html === "on";
  } catch (error) {
    console.error("[morphise] Could not read the profile to decide on the HTML page tools", error);
    return false;
  }
}

const htmlTool = () => startHtmlTool().catch((error: unknown) => (console.error("[morphise] html_render tool unavailable", error), undefined));

export function registerLegacyConfig(server: Pick<PluginServerContext, "registerLegacyAgentConfig">) {
  server.registerLegacyAgentConfig({
    version: 1,
    selectors: [
      { id: "html-endpoint", group: "html", label: "HTML tools endpoint", kind: "mcp", name: HTML_SERVER },
      ...LEGACY_HTML_PROMPTS.map(({ id, text }) => ({ id, group: "html", label: "HTML page guidance", kind: "prompt-suffix" as const, text })),
      ...[HTML_TOOL, HTML_GUIDE_TOOL, HTML_PREVIEW_TOOL].map((tool) => ({ id: `html-grant-${tool}`, group: "html", label: `HTML ${tool} approval`, kind: "grant" as const, server: HTML_SERVER, tool })),
      { id: "task-list-prompt", group: "task-list", label: "Claude task-list guidance", kind: "prompt-suffix", text: TASK_LIST_INSTRUCTION },
      { id: "task-list-prompt-before-html", group: "task-list", label: "Claude task-list guidance before HTML", kind: "prompt-suffix", text: TASK_LIST_INSTRUCTION, followedBySuffix: LEGACY_HTML_PROMPTS.map(({ text }) => `\n\n${text}`) },
      { id: "task-list-env", group: "task-list", label: "Claude task-list tools", kind: "env", key: TODO_TOOLS_ENV, baselines: [
        { id: "inherit", label: "Inherit current defaults (not recovered history)", kind: "absent" },
        { id: "off", label: "Explicitly disable task-list tools", kind: "value", value: "0" },
        { id: "on", label: "Explicitly enable task-list tools", kind: "value", value: "1" },
      ] },
    ],
  });
}

// An occupied name is caller state, not an owned credential or permission grant.
export function addHtmlTools(profile: ProfileReader): OpenHook {
  return async ({ request }, { launch }) => {
    if (request.purpose === "history") return undefined;
    const support = request.openSupport;
    const fixed = support?.restrictions.mcpConfiguration === "fixed";
    const hasPriorHtml = Object.hasOwn(request.previousContribution?.mcpServers ?? {}, HTML_SERVER);
    const closeRequired = () => new Error("Morphise cannot reuse its prior HTML contribution with the current settings and session support. Fully close this agent and its retained children, then reopen it.");
    const excluded = request.baseConfig?.internal || request.metadata[TITLE_HELPER] === true;
    const endpointState = request.legacyConfigState?.selectors["html-endpoint"];
    const occupied = (endpointState !== undefined && endpointState !== "absent") || Object.hasOwn(request.baseConfig?.mcpServers ?? {}, HTML_SERVER) || Object.hasOwn(request.mcpServers, HTML_SERVER);
    if (fixed && hasPriorHtml && (excluded || occupied)) throw closeRequired();
    if (excluded) return undefined;
    if (occupied) {
      console.info(`[morphise] ${request.agentId} html: saved binding retained; new HTML additions suppressed (not fully adaptive)`);
      return undefined;
    }
    if (fixed && !hasPriorHtml) return undefined;
    const on = await htmlPagesOn(profile);
    if (!on) {
      if (fixed) throw closeRequired();
      return undefined;
    }
    if (support?.mcpHttp !== "supported" || (!fixed && support.restrictions.mcpConfiguration !== "mutable")) {
      if (fixed) throw closeRequired();
      console.info(`[morphise] ${request.agentId} html: unavailable HTTP delivery or mutable MCP configuration`);
      return undefined;
    }
    const prompt = request.baseConfig?.systemPrompt ?? "";
    const savedGuidance = Object.entries(request.legacyConfigState?.selectors ?? {}).some(([id, state]) => id.startsWith("html-prompt-") && state !== "absent")
      || LEGACY_HTML_PROMPTS.some(({ text }) => prompt.includes(text)) || prompt.includes("# HTML pages") || prompt.includes("<morphise-html-pages>");
    if (savedGuidance) console.info(`[morphise] ${request.agentId} html: saved or ambiguous guidance retained; fresh guidance suppressed`);
    if (support.exactMcpPreapproval !== "supported") console.info(`[morphise] ${request.agentId} html: exact approvals unavailable; ordinary permission prompts retained`);
    const instructions = support.instructions === "supported" && !savedGuidance;
    const preapprove = support.exactMcpPreapproval === "supported";
    if (fixed) {
      const previous = request.previousContribution;
      const binding = previous?.mcpServers[HTML_SERVER];
      if (!previous || !binding || binding.type !== "http") throw closeRequired();
      const token = /^Bearer ([0-9a-f]{48})$/.exec(binding.headers?.Authorization ?? "")?.[1];
      if (!token || (await folderOfToken(token)) !== resolve(request.cwd)) throw closeRequired();
      const expected = withHtmlTool(request, { url: binding.url, token, instructions, preapprove });
      const priorGuidance = previous.appendSystemPrompt?.filter((text) => text.includes("<morphise-html-pages>")) ?? [];
      const newGuidance = expected.appendSystemPrompt?.filter((text) => text.includes("<morphise-html-pages>")) ?? [];
      if (!isDeepStrictEqual(binding, expected.mcpServers[HTML_SERVER]) || !isDeepStrictEqual(priorGuidance, newGuidance)) throw closeRequired();
      const priorGrants = previous.toolPolicy?.preapproved.filter((grant) => grant.server === HTML_SERVER) ?? [];
      const allowedGrants = expected.toolPolicy?.preapproved.filter((grant) => grant.server === HTML_SERVER) ?? [];
      if (preapprove && !isDeepStrictEqual(priorGrants, allowedGrants)) throw closeRequired();
      // The host owns instance/generation validity and retains the prior cleanup through this launch.
      const retained = launch.retainPrevious();
      if (!isDeepStrictEqual(retained, previous)) throw closeRequired();
      console.info(`[morphise] ${request.agentId} html: retained prior binding and launch lifetime`);
      return {
        ...expected,
        mcpServers: { ...request.mcpServers, [HTML_SERVER]: structuredClone(binding) },
        ...(instructions && { appendSystemPrompt: [...(request.appendSystemPrompt ?? []), ...priorGuidance] }),
        ...(preapprove && { toolPolicy: { preapproved: [...(request.toolPolicy?.preapproved ?? []), ...structuredClone(priorGrants)] } }),
      };
    }
    const tool = await htmlTool();
    if (!tool) return undefined;
    const token = issueLaunchToken(request.cwd, launch);
    return withHtmlTool(request, { url: tool.url, token, instructions, preapprove });
  };
}

// The Workbench's bookmarks, read once at start to let go of kept pages no bookmark holds.
export interface BookmarksReader {
  read(): Promise<{ status: string; values?: unknown }>;
}

async function pruneUnheldPages(bookmarks: BookmarksReader) {
  const state = await bookmarks.read();
  if (state.status !== "ready") return;
  const document = bookmarkDocumentSchema.safeParse(state.values);
  if (!document.success) return;
  const removed = await pruneKept(new Set(document.data.bookmarks.flatMap((bookmark) => (bookmark.page ? [bookmark.page.id] : []))));
  if (removed) console.info(`[morphise] removed ${removed} kept page(s) no bookmark holds`);
}

export function registerPages(server: PluginServerContext, profile: ProfileReader, bookmarks?: BookmarksReader): () => void {
  server.handle(openHtml, openHtmlPage);
  server.handle(storedPage, readStoredPage);
  server.handle(keepPage, keepStoredPage);
  server.handle(browserStatus, shellStatus);
  // The download takes minutes and every RPC has a 30 s deadline, so it runs on in the background
  // and Settings polls browserStatus for its progress.
  server.handle(installBrowser, () => (void installHeadlessShell(), shellStatus()));
  server.handle(removeBrowser, async () => {
    await removeHeadlessShell();
    return shellStatus();
  });
  // The user downloaded an older pinned version once, so the new one comes without asking again.
  if (staleShell()) void installHeadlessShell();
  // A stop before these reads finish must not start the server afterwards.
  let stopped = false;
  void Promise.all([localServerUsedBefore(), htmlPagesOn(profile)]).then(([used, on]) => {
    if (stopped || !(used || on)) return undefined;
    // Loaded with the server, so a store that can't be read is set aside and said at start rather than at the first call.
    loadAgentFolders().catch((error: unknown) => console.error("[morphise] html tools: couldn't load the agent folder store; per-agent calls fail until the plugin restarts", error));
    return htmlTool();
  });
  if (bookmarks) void pruneUnheldPages(bookmarks).catch((error: unknown) => console.warn("[morphise] couldn't tidy kept pages", error));
  const stopHook = server.addHook("agent.open.before", addHtmlTools(profile));
  return () => {
    stopped = true;
    stopHook();
    void closeLocalServer();
  };
}
