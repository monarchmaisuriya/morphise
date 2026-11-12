import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readImageFile, readTextFile, revealPath } from "./server/files";
import { watchSettings } from "./server/settings-watch";
import { createTurnRecap } from "./server/turn-recap";
import { createTaskKeeper } from "./server/task-keeper";
import { profileSettings } from "./shared/document";
import { remindersKeeper } from "./shared/reminder-contracts";
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
  server.handle(readImage, readImageFile);
  server.handle(readText, readTextFile);
  server.handle(revealFile, revealPath);
  // Opt-in (Settings, Chat, Turn recap): one summary row after each top-level turn.
  const recap = createTurnRecap(profile);
  const stopRecap = server.addHook("agent.turn.after", async (payload, context) => {
    await recap(payload, context);
    return undefined;
  });
  const keeper = createTaskKeeper(tasks);
  server.handle(remindersKeeper, keeper.watch);
  return () => {
    stopRecap();
    keeper.dispose();
  };
}
