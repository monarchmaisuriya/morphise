import { Markdown } from "@getpaseo/plugin/client/ui";

/**
 * Markdown an agent wrote, drawn inside Morphise's rows (a reply folded into merged steps, a tool row's text) by Paseo's own renderer,
 * so headings, lists, links, code and tables look exactly as they do in a reply.
 */
export function Prose({ text }: { text: string }) {
  return <Markdown>{text.trim()}</Markdown>;
}
