// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): server/diagram.ts
import { escapeTags } from "../../../shared/polish/diagram";
import { optionalDependency } from "./plugin-require";

// The part of Pele's API used here (loaded at run time; its types are not imported).
type Pele = {
  render(source: string, options: { fontFamily: string; fontSize: number; responsive: boolean; links: boolean; images: boolean }): { svg: string; width: number; height: number };
  PeleError: new (...args: never[]) => Error;
};

const loadPele = optionalDependency<Pele>("pele", "mermaid diagrams show their source");

// Off the browser Pele sizes labels with its built-in Helvetica/Arial metrics, so the drawing names that font
// (metric-compatible Liberation Sans on Linux) and its labels fit wherever it's shown.
const FONT = 'Helvetica, Arial, "Liberation Sans", sans-serif';

/** Mermaid source as an SVG drawn by Pele, or null when Pele can't read it or can't load (the chat then shows the source). */
export async function renderDiagramSvg({ source }: { source: string }) {
  const pele = await loadPele();
  if (!pele) return null;
  try {
    const r = pele.render(escapeTags(source), { fontFamily: FONT, fontSize: 13, responsive: false, links: false, images: false });
    return { svg: r.svg, width: Math.ceil(r.width), height: Math.ceil(r.height) };
  } catch (error) {
    if (error instanceof pele.PeleError) return null;
    throw error;
  }
}
