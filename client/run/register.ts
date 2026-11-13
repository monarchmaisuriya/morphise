// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/index.client.tsx (the slash command and renderer)
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RUN_KIND, RUN_VERSION, runRow } from "../../shared/run/row";
import { start } from "../../shared/run/rpc";
import { commandFromArgs, errorMessage, shortCommand } from "../../shared/run/text";
import { RunRowView } from "./run-row";

// `/run <command>` in any chat, on every platform, and the card each run draws in the chat
// ("run" rows, which the daemon appends). Not `/sh`, so Shell Yeah can be installed
// beside Morphise. Returns cleanup.
export function registerRun(client: PluginClientContext): () => void {
  const stops = [
    client.addSlashCommand({
      name: "run",
      description: "Run a shell command in this chat's folder. The agent sees the output only if you send it.",
      argumentHint: "<command>",
      context: "agent",
      async onSubmit({ args, agent, rpc }) {
        const command = commandFromArgs(args);
        if (!command) throw new Error("Type a command after /run, like /run git status.");
        // The composer already cleared the box, so a failure names the command: the
        // toast is all the user has left of what they typed.
        try {
          await rpc(start, { agentId: agent.id, command });
        } catch (error) {
          throw new Error(`Couldn't run "${shortCommand(command)}": ${errorMessage(error)}`, { cause: error });
        }
      },
    }),
    client.addTimelineRenderer({ kind: RUN_KIND, version: RUN_VERSION, schema: runRow, Component: RunRowView }),
  ];
  return () => stops.forEach((stop) => void stop());
}
