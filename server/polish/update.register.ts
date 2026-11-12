import type { PluginServerContext } from "@getpaseo/plugin/server";
import { applyUpdate, checkUpdate } from "../../shared/polish/update";
import type { ProfileReader } from "./profile-reader";
import { checkForUpdate, installUpdate } from "./update";

// Settings, General: "Update available" and Update, through `paseo plugin update` on this daemon.
export function registerUpdate(server: PluginServerContext, _profile: ProfileReader): () => void {
  server.handle(checkUpdate, () => checkForUpdate());
  server.handle(applyUpdate, () => installUpdate());
  return () => {};
}
