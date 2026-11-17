import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readImageFile, readTextFile, revealPath } from "./server/files";
import { watchSettings } from "./server/settings-watch";
import { createPlanInstruction, createPlanTools } from "./server/plan-tools";
import { createTurnRecap } from "./server/turn-recap";
import { registerAgentActions } from "./server/agent-actions";
import { createTitleJobs, type TitlePaseo } from "./server/titles";
import { agentsBoardSettings } from "./shared/agents-board";
import { startTitle, titleSettings, titleStatus } from "./shared/agent-titles";
import { createTaskKeeper } from "./server/task-keeper";
import { createShowHook, createShowTool, createShowWindows, readShowSetting } from "./server/show";
import { registerMedia } from "./server/polish/media.register";
import { registerPages } from "./server/polish/pages.register";
import { registerUpdate } from "./server/polish/update.register";
import { registerRun } from "./server/run/register";
import { profileSettings } from "./shared/document";
import { groupOrderSettings, projectGroupsSettings } from "./shared/project-groups";
import { registerProjectActions } from "./server/project-actions";
import { registerStats } from "./server/stats/register";
import { registerActivity } from "./server/activity/register";
import { remindersKeeper } from "./shared/reminder-contracts";
import { showChannel, showResult, showSettings, showUsed } from "./shared/show";
import { bookmarkSettings } from "./shared/bookmarks";
import { readImage, readText, revealFile } from "./shared/files";
import { taskSettings } from "./shared/tasks";
import { bookmarksWatch, profileWatch, tasksWatch } from "./shared/watch";

export default function contribute(server: PluginServerContext) {
  const profile = server.registerSettings(profileSettings);
  server.handle(profileWatch, watchSettings(profile));
  const tasks = server.registerSettings(taskSettings);
  server.handle(tasksWatch, watchSettings(tasks));
  const bookmarks = server.registerSettings(bookmarkSettings);
  server.handle(bookmarksWatch, watchSettings(bookmarks));
  // The Agents view: its settings, and Stop and Rename through Paseo's CLI (the SDK has neither).
  server.registerSettings(agentsBoardSettings);
  // "Your groups" in the sidebar view: the user's project groups, shared by every app on this daemon.
  server.registerSettings(projectGroupsSettings);
  server.registerSettings(groupOrderSettings);
  // Remove project in "Your groups", through Paseo's CLI (the SDK has no call for it).
  registerProjectActions(server);
  // Session stats and conversation search, read from the Claude Code and Codex log files (never from Paseo's
  // timeline, which would resume a finished agent). Registers its own "stats" settings.
  const stopStats = registerStats(server);
  registerActivity(server);
  const agentActions = registerAgentActions(server);
  // "Generate a title" on an agent card: a hidden helper agent writes it, the CLI applies it.
  const titlesSettings = server.registerSettings(titleSettings);
  const titles = createTitleJobs({
    readSettings: async () => {
      const state = await titlesSettings.read();
      return state.status === "ready" ? state.values : titleSettings.schema.parse({});
    },
    rename: async (agentId, title) => {
      const result = await agentActions.rename({ agentId, title });
      return result.ok ? null : result.error;
    },
  });
  server.handle(startTitle, ({ agentId }, { paseo }) => titles.start(agentId, paseo as unknown as TitlePaseo));
  server.handle(titleStatus, ({ jobId }) => titles.status(jobId));
  server.handle(readImage, readImageFile);
  server.handle(readText, readTextFile);
  server.handle(revealFile, revealPath);
  // Opt-in (Settings, Chat, Turn recap): one summary row after each top-level turn.
  const recap = createTurnRecap(profile);
  const stopRecap = server.addHook("agent.turn.after", async (payload, context) => {
    await recap(payload, context);
    return undefined;
  });
  // While the steps card is on, Claude agents launch with Claude Code's task-list tools, so they
  // publish the plan the card draws (newer models do not get those tools by default).
  const stopPlanTools = server.addHook("agent.open.before", createPlanTools(profile));
  // ...and each new one is asked to keep that plan, since Claude Code only lists the tools by name.
  const stopPlanInstruction = server.addHook("agent.create.before", createPlanInstruction(profile));
  // The daemon side of the parts ported from Chat Polish (see NOTICE.md).
  const stopPolish = [registerMedia, registerPages, registerUpdate].map((register) => register(server, profile));
  // Shell commands the user runs from a chat (/run, Run buttons), ported from Shell Yeah (see NOTICE.md).
  const stopRun = registerRun(server);
  const keeper = createTaskKeeper(tasks);
  server.handle(remindersKeeper, keeper.watch);
  // "Show in Paseo": agents can bring a chat, terminal, workspace or Morphise screen to the front of
  // the window M used last (on unless turned off; an unreadable setting counts as off).
  const showSetting = server.registerSettings(showSettings);
  const showOn = readShowSetting(() => showSetting.read(), console.log);
  const windows = createShowWindows();
  server.handle(showChannel, ({ windowId }, { push, signal }) => windows.serve(windowId, push, signal));
  server.handle(showUsed, ({ windowId, inFront }) => (windows.used(windowId, inFront), { ok: true as const }));
  server.handle(showResult, ({ requestId, ok, message }) => (windows.answer(requestId, ok, message), { ok: true as const }));
  const stopShowTool = server.addHook("agent.open.before", createShowHook({ enabled: showOn, tool: createShowTool({ windows, enabled: showOn, log: console.log }) }));
  return () => {
    stopStats();
    stopShowTool();
    windows.stop();
    stopRecap();
    stopPlanTools();
    stopPlanInstruction();
    stopPolish.forEach((stop) => stop());
    keeper.dispose();
    // Marks running commands interrupted and ends their processes before the plugin stops.
    return stopRun();
  };
}
