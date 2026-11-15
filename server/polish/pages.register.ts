import { resolve } from "node:path";
import type { PluginHookContext, PluginHookPayload, PluginHookResult, PluginServerContext } from "@getpaseo/plugin/server";
import { activeProfile } from "../../shared/document";
import { browserStatus, HTML_SERVER, installBrowser, openHtml, removeBrowser, storedPage } from "../../shared/polish/html";
import { polishPrefs } from "../../shared/polish/prefs";
import { folderOfToken, issueAgentToken, loadAgentFolders } from "./pages/agent-folders";
import { installHeadlessShell, removeHeadlessShell, shellStatus, staleShell } from "./pages/headless-shell";
import { type AgentConfig, baseProvider, closeLocalServer, PREAPPROVES, localServerUsedBefore, openHtmlPage, readStoredPage, startHtmlTool, withHtmlTool } from "./pages/html-tool";
import { TITLE_HELPER } from "../titles";
import type { ProfileReader } from "./profile-reader";

type CreateHook = (payload: PluginHookPayload<"agent.create.before">, context: PluginHookContext) => Promise<PluginHookResult<"agent.create.before">>;

// HTML pages (experimental, off by default; Settings, Chat, HTML pages): while the option is on,
// new agents get the chat_polish MCP server (html_render, and html_preview while the headless
// browser is installed). Off, or with an unreadable profile, agents are created as Paseo would.
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

// The agent's own token, which tells the tool server whose folder a page's images may come from: the one a stored agent Paseo re-creates
// already holds when it was issued for this folder, otherwise a new one, saved before it is handed out.
async function agentToken(config: AgentConfig) {
  const server = config.mcpServers?.[HTML_SERVER];
  const held = server && "headers" in server ? /^Bearer (.+)$/.exec(server.headers?.Authorization ?? "")?.[1] : undefined;
  if (held && (await folderOfToken(held)) === resolve(config.cwd)) return held;
  return issueAgentToken(config.cwd);
}

// Adds the tools to a new agent while the option is on; never to internal agents (commit and PR
// messages) or Morphise's title helper. Exported for its test.
export function addHtmlTools(profile: ProfileReader): CreateHook {
  return async ({ request }, { paseo }) => {
    if (request.config.internal || request.metadata?.[TITLE_HELPER] === true || !(await htmlPagesOn(profile))) return undefined;
    // Unreadable daemon config: judge the provider by its own id, so a derived one goes without the tools rather than failing to start.
    const providers = await paseo.config.get().then(({ config }) => config.providers, () => undefined);
    const base = baseProvider(request.config.provider, providers);
    if (!PREAPPROVES.has(base)) return undefined;
    const tool = await htmlTool();
    if (!tool) return undefined;
    const token = await agentToken(request.config).catch((error: unknown) => (console.error("[morphise] html tools: couldn't save the new agent's token, so it gets no html_render", error), undefined));
    if (!token) return undefined;
    return { ...request, config: withHtmlTool(request.config, { url: tool.url, token }, base) };
  };
}

export function registerPages(server: PluginServerContext, profile: ProfileReader): () => void {
  server.handle(openHtml, openHtmlPage);
  server.handle(storedPage, readStoredPage);
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
  const stopHook = server.addHook("agent.create.before", addHtmlTools(profile));
  return () => {
    stopped = true;
    stopHook();
    void closeLocalServer();
  };
}
