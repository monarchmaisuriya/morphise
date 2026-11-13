import type { PluginHookContext, PluginHookPayload, PluginHookResult, PluginServerContext } from "@getpaseo/plugin/server";
import { activeProfile } from "../../shared/document";
import { browserStatus, installBrowser, openHtml, removeBrowser, storedPage } from "../../shared/polish/html";
import { polishPrefs } from "../../shared/polish/prefs";
import { installHeadlessShell, removeHeadlessShell, shellStatus, staleShell } from "./pages/headless-shell";
import { baseProvider, closeLocalServer, PREAPPROVES, localServerUsedBefore, openHtmlPage, readStoredPage, startHtmlTool, withHtmlTool } from "./pages/html-tool";
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
    return { ...request, config: withHtmlTool(request.config, tool, base) };
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
  void Promise.all([localServerUsedBefore(), htmlPagesOn(profile)]).then(([used, on]) => (!stopped && (used || on) ? htmlTool() : undefined));
  const stopHook = server.addHook("agent.create.before", addHtmlTools(profile));
  return () => {
    stopped = true;
    stopHook();
    void closeLocalServer();
  };
}
