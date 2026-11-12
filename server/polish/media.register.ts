import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderDiagram } from "../../shared/polish/diagram";
import { getIconSet } from "../../shared/polish/icons";
import { readImage } from "../../shared/polish/image";
import { renderDiagramSvg } from "./media/diagram";
import { loadIconSet } from "./media/icons";
import { readImageFile } from "./media/image";
import type { ProfileReader } from "./profile-reader";

// The daemon side of images, diagrams and icon sets (ported from Chat Polish, see NOTICE.md). Each
// is opt-in on the client: it asks only while its option is on. sharp and Pele load on first use
// from Morphise's node_modules; an icon set downloads from npm the first time it is picked.
export function registerMedia(server: PluginServerContext, _profile: ProfileReader): () => void {
  server.handle(readImage, readImageFile);
  server.handle(renderDiagram, renderDiagramSvg);
  server.handle(getIconSet, ({ set }) => loadIconSet(set));
  return () => {};
}
