// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): shared/diagram.ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Draws mermaid source with Pele on the daemon, so clients don't carry Pele's code; null when Pele can't read it. */
export const renderDiagram = defineRpc({
  name: "polish.diagram.render",
  input: z.object({ source: z.string() }),
  output: z.object({ svg: z.string(), width: z.number(), height: z.number() }).nullable(),
});

/**
 * Tag-like text in labels ("<uuid>", "<iframe …>") as mermaid's #lt;/#gt; codes, which Pele draws as text where it would
 * drop a tag. Leaves the <br>/<i> tags mermaid allows, arrows ("<-->", "<|--") and stereotypes ("<<interface>>").
 */
export const escapeTags = (source: string) => source.replace(/(?<!<)<(?!\/?(?:br|i)\s*\/?>)(\/?[a-z][^<>\n]*)>(?!>)/gi, "#lt;$1#gt;");

/**
 * Quotes a flowchart's node and piped edge labels that contain an @. Mermaid 11 reads "word@" as an edge id (`e1@-->`)
 * even inside a label, so "[@mention]" or "[ops@example.com]" fails the whole diagram; Pele does too. Mermaid 12 reads
 * them, and draws a quoted label the same. Self-contained (builtins only), because Paseo's diagram frame runs a copy made
 * from this function's text (client/polish/web/mermaid.ts).
 * Scaffold: remove once Paseo ships mermaid 12 or later; on 2026-11-19 it asked for ^11.16.0 (packages/app/package.json).
 */
export function quoteAtLabels(source: string): string {
  const lines = source.split("\n");
  let first = 0;
  if (lines[0]?.trim() === "---") {
    first = 1;
    while (first < lines.length && lines[first].trim() !== "---") first++;
    first++;
  }
  while (first < lines.length && (!lines[first].trim() || lines[first].trim().startsWith("%%"))) first++;
  if (!/^(?:flowchart|graph)\b/.test(lines[first]?.trim() ?? "")) return source;
  const closing: Record<string, string> = { "(((": ")))", "((": "))", "([": "])", "[[": "]]", "[(": ")]", "{{": "}}", "[": "]", "(": ")", "{": "}" };
  const node = /([A-Za-z0-9_]+)(\(\(\(|\(\(|\(\[|\[\[|\[\(|\{\{|\[|\(|\{)([^"\n[\](){}|]*@[^"\n[\](){}|]*)(\)\)\)|\)\)|\]\)|\]\]|\)\]|\}\}|\]|\)|\})/g;
  const edge = /\|([^"\n|]*@[^"\n|]*)\|/g;
  return lines
    .map((line, index) =>
      index <= first ? line : line.replace(node, (all, id, open, text, close) => (closing[open] === close ? `${id}${open}"${text}"${close}` : all)).replace(edge, (_all, text) => `|"${text}"|`),
    )
    .join("\n");
}
