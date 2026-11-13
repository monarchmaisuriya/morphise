// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/shared/rpc.ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { LIMITS } from "./limits";
import { liveView, runRow } from "./row";

const runId = z.string().regex(/^[a-z0-9-]{6,64}$/);
const agentId = z.string().min(1);

// The only way a command starts: /run, the Run buttons on code blocks and Rerun all call this.
// There is no folder field: the daemon runs the command in the agent's own folder, read from
// Paseo, and refuses when it doesn't know the agent or its folder. `rerunOf` is the card Rerun
// was pressed on: the new run takes over that card and the old one moves into its history.
// Idempotent on `rerunOf` while this daemon knows the card. Returns once the row exists and
// the process is launched.
export const start = defineRpc({
  name: "morphise.run.start",
  input: z.object({
    agentId,
    command: z.string().trim().min(1).max(LIMITS.commandChars),
    rerunOf: runRow.optional(),
  }),
  output: z.object({ runId }),
});

// First call = Ctrl+C (SIGINT to the process group). `force` or a later call = SIGKILL.
export const stop = defineRpc({
  name: "morphise.run.stop",
  input: z.object({ runId, force: z.boolean().default(false) }),
  output: z.object({ ok: z.literal(true) }),
});

// Sends keys to a running command's terminal as they're pressed, the way a terminal does:
// "\r" is Enter. The terminal decides what shows, so a password prompt shows nothing.
// Fails when the command has no terminal.
export const input = defineRpc({
  name: "morphise.run.input",
  input: z.object({ runId, keys: z.string().min(1).max(LIMITS.inputChars) }),
  output: z.object({ ok: z.literal(true) }),
});

// The live channel, a coalescing long poll. Answers at once if `since` is not the
// current rev; otherwise holds up to `waitMs` for a change, then a little longer
// so a burst batches into one reply. "unknown" = this daemon process never saw
// the run (plugin reloaded): the card calls it interrupted.
export const tail = defineRpc({
  name: "morphise.run.tail",
  input: z.object({
    runId,
    lines: z.number().int().min(1).max(400),
    since: z.number().int().nullable(),
    waitMs: z.number().int().min(0).max(LIMITS.tailWaitMaxMs),
  }),
  output: z.discriminatedUnion("state", [
    z.object({ state: z.literal("unknown") }),
    z.object({ state: z.literal("unchanged"), rev: z.number().int() }),
    z.object({ state: z.literal("view"), view: liveView }),
  ]),
});

// Full plain text for Copy. `complete: false` when the daemon trimmed or capped it. null = not held.
export const fullOutput = defineRpc({
  name: "morphise.run.output",
  input: z.object({ runId }),
  output: z.object({ text: z.string(), complete: z.boolean() }).nullable(),
});

// Send to the agent. `fallback` is the row the user is looking at, used only when the
// daemon no longer holds the run (plugin reloaded, run evicted).
export const send = defineRpc({
  name: "morphise.run.send",
  input: z.object({ agentId, runId, fallback: runRow.optional() }),
  output: z.object({ delivery: z.enum(["turn", "steered"]) }),
});
