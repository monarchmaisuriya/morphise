import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// Stop and Rename for the Agents view. The public SDK has neither, so the daemon side runs Paseo's
// public CLI (`paseo agent stop`, `paseo agent update --name`). Every answer carries the CLI's own
// error text rather than failing silently.

// Paseo's limit for a title set by hand (protocol agent-title-limits.ts).
export const AGENT_TITLE_MAX = 200;

// One word that cannot be read as an option: the CLI takes it as a positional argument.
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

// Why an id cannot be passed to the CLI; null when it can.
export function checkAgentId(id: string): string | null {
  return AGENT_ID.test(id) ? null : "Not an agent id";
}

// Why a title cannot be set; null when it can. The CLI reads it as the value of --name.
export function checkAgentTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "The title is empty";
  if (trimmed.length > AGENT_TITLE_MAX) return `A title is at most ${AGENT_TITLE_MAX} characters`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return "A title is one line";
  return null;
}

const result = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), error: z.string() })]);
export type AgentActionResult = z.output<typeof result>;

// Whether the daemon's machine has the CLI; without it the board hides Stop and Rename.
export const agentActionsAvailable = defineRpc({ name: "agents.actions.available", input: z.object({}), output: z.object({ available: z.boolean() }) });

export const stopAgent = defineRpc({ name: "agents.stop", input: z.object({ agentId: z.string().max(200) }), output: result });

export const renameAgent = defineRpc({ name: "agents.rename", input: z.object({ agentId: z.string().max(200), title: z.string().max(1000) }), output: result });
