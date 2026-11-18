import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { StepsOptions } from "../shared/steps";
import { TURN_RECAP_KIND } from "../shared/chat-view";
import { RecapRow, recapRowSchema } from "./chat-rows";
import { registerRowRenderers } from "./polish/rows/register";
import { reminderRowSchema } from "../shared/reminder-contracts";
import type { BoardDeps } from "./board/deps";
import { createReminderRow } from "./task-surfaces";

/**
 * Every row renderer whose rows come from settings-driven parts of Morphise (the daemon's turn recaps and reminder rows, and the chat
 * rows the timeline transformers make), registered once and synchronously when Morphise starts, before any setting has arrived. Paseo
 * caches a row's renderer lookup against an array it changes in place, so a renderer registered after a row first draws leaves that row
 * "Plugin timeline item unavailable" until the chat reloads. Renderers draw only rows that exist; settings decide which rows exist.
 */
export function registerRenderers(client: PluginClientContext, deps: { tasks: BoardDeps; steps: () => StepsOptions }): () => void {
  const removers = [
    client.addTimelineRenderer({ kind: TURN_RECAP_KIND, version: 1, schema: recapRowSchema, Component: RecapRow }),
    client.addTimelineRenderer({ kind: "reminder", version: 1, schema: reminderRowSchema, Component: createReminderRow(deps.tasks) }),
    registerRowRenderers(client, deps.steps),
  ];
  return () => removers.forEach((remove) => void remove());
}
