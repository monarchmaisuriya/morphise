// "Generate a title" for an agent: a short background agent reads the chat's start and writes a
// title. Prompt and approach after Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md):
// shared/title-generation.ts.
import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_TITLE_PROMPT =
  "Generate a concise, specific task title from the supplied conversation. Use the language of the first user message. Focus on the actual goal and preserve key module names, issue numbers, and technical identifiers. Limit the title to 60 characters including spaces. Return only the title, without quotes, explanations, or Markdown.";

export const MAX_TITLE = 60;

// Shared by every device on the host. Each field falls back on its own, so one bad value never
// empties the rest. An empty provider or model uses the chat's own.
export const titleSettings = defineSettings({
  id: "agent-titles",
  scope: "host",
  version: 1,
  schema: z.object({
    provider: z.string().max(80).catch(""),
    model: z.string().max(120).catch(""),
    prompt: z.string().trim().min(1).max(8000).catch(DEFAULT_TITLE_PROMPT),
  }),
});
export type TitleSettings = z.infer<typeof titleSettings.schema>;

// A title takes longer than one RPC may wait, so it runs as a job the app polls.
export const titleJobSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("running") }),
  z.object({ state: z.literal("done"), title: z.string() }),
  z.object({ state: z.literal("failed"), error: z.string() }),
]);
export type TitleJob = z.infer<typeof titleJobSchema>;

export const startTitle = defineRpc({ name: "titles.start", input: z.object({ agentId: z.string().min(1).max(200) }), output: z.object({ jobId: z.string() }) });
export const titleStatus = defineRpc({ name: "titles.status", input: z.object({ jobId: z.string().min(1).max(100) }), output: titleJobSchema });

/** The helper's reply as a title: its first non-empty line, without quotes or Markdown marks, at most MAX_TITLE characters; null if nothing is left. */
export function cleanTitle(reply: string): string | null {
  const line = reply
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line) return null;
  const bare = line.replace(/^[#>*\-\s]+/, "").replace(/^["'“”‘’`]+|["'“”‘’`.]+$/g, "").trim();
  if (!bare) return null;
  return bare.length > MAX_TITLE ? `${bare.slice(0, MAX_TITLE - 1).trimEnd()}…` : bare;
}

/** What the helper reads: the instructions, then the chat's first message and its latest reply, each cut to 1000 characters. */
export function titleRequest(prompt: string, firstMessage: string, lastReply: string): string {
  const cut = (text: string) => (text.length > 1000 ? `${text.slice(0, 1000)}…` : text);
  return [prompt, "Do not use any tools.", "", "First message:", cut(firstMessage.trim()), ...(lastReply.trim() ? ["", "Latest reply:", cut(lastReply.trim())] : [])].join("\n");
}
