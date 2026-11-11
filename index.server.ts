import type { PluginServerContext } from "@getpaseo/plugin/server";
import { watchProfile } from "./server/profile-watch";
import { createReminderKeeper } from "./server/reminder-keeper";
import { profileSettings } from "./shared/document";
import { remindersArm, remindersKeeper } from "./shared/reminder-contracts";
import { profileWatch } from "./shared/watch";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(profileSettings);
  server.handle(profileWatch, watchProfile(settings));
  const keeper = createReminderKeeper();
  server.handle(remindersKeeper, keeper.watch);
  server.handle(remindersArm, keeper.arm);
  return () => keeper.dispose();
}
