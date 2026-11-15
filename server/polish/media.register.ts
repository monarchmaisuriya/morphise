import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderDiagram } from "../../shared/polish/diagram";
import { getIconSet } from "../../shared/polish/icons";
import { readImage, readPageImage } from "../../shared/polish/image";
import { renderDiagramSvg } from "./media/diagram";
import { loadIconSet } from "./media/icons";
import { readImageFile, readImageInFolder } from "./media/image";
import type { ProfileReader } from "./profile-reader";

// The daemon side of images, diagrams and icon sets (ported from Chat Polish, see NOTICE.md). Each
// is opt-in on the client: it asks only while its option is on. sharp and Pele load on first use
// from Morphise's node_modules; an icon set downloads from npm the first time it is picked.
export function registerMedia(server: PluginServerContext, _profile: ProfileReader): () => void {
  server.handle(readImage, readImageFile);
  server.handle(readPageImage, async ({ path, agentId }, { paseo }) => {
    const folder = (await paseo.agents.ref(agentId).refresh())?.agent.cwd;
    if (!folder) throw new Error("This chat has no folder, so its pages show no local images");
    return readImageInFolder({ path }, folder);
  });
  server.handle(renderDiagram, renderDiagramSvg);
  server.handle(getIconSet, ({ set }) => loadIconSet(set));
  return () => {};
}
