import type { PluginServerContext } from "@getpaseo/plugin/server";
import { watchProfile } from "./server/profile-watch";
import { profileSettings } from "./shared/profile";
import { profileWatch } from "./shared/watch";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(profileSettings);
  server.handle(profileWatch, watchProfile(settings));
  return () => {};
}
