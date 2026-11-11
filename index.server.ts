import type { PluginServerContext } from "@getpaseo/plugin/server";
import { watchSettings } from "./server/settings-watch";
import { createTaskKeeper } from "./server/task-keeper";
import { profileSettings } from "./shared/document";
import { remindersKeeper } from "./shared/reminder-contracts";
import { taskSettings } from "./shared/tasks";
import { profileWatch, tasksWatch } from "./shared/watch";

export default function contribute(server: PluginServerContext) {
  const profile = server.registerSettings(profileSettings);
  server.handle(profileWatch, watchSettings(profile));
  const tasks = server.registerSettings(taskSettings);
  server.handle(tasksWatch, watchSettings(tasks));
  const keeper = createTaskKeeper(tasks);
  server.handle(remindersKeeper, keeper.watch);
  return () => keeper.dispose();
}
