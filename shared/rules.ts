import type { Indicator } from "./profile";
import { doneBefore, type TaskOperation } from "./task-ops";
import type { TaskDocument } from "./tasks";

// Automations. Apps run these and apply the operations; every result is safe to apply again, so
// several open apps reach the same board.

export interface ChatTransition {
  agentId: string;
  // The status the chat just entered.
  to: Indicator;
}

// Rules fire when a chat enters a status, not while it stays there, so a card moved back by
// hand stays where it was put.
export function rulesForTransitions(document: TaskDocument, transitions: readonly ChatTransition[]): TaskOperation[] {
  const operations: TaskOperation[] = [];
  const moved = new Set<string>();
  const done = document.columns.find((column) => column.done)?.id;
  for (const rule of document.rules) {
    if (!rule.enabled || rule.when.kind !== "chat-status" || rule.then.kind !== "move") continue;
    for (const transition of transitions) {
      if (transition.to !== rule.when.status) continue;
      for (const task of document.tasks) {
        // Finished cards stay finished: a chat can need attention again after its work is done.
        if (task.links.agentId !== transition.agentId || task.archivedAt !== null || task.column === done) continue;
        if (task.column === rule.then.column || moved.has(task.id)) continue;
        moved.add(task.id);
        operations.push({ kind: "moveTask", id: task.id, column: rule.then.column });
      }
    }
  }
  return operations;
}

// One operation with a cutoff, not one per card: it is evaluated again on the newest list when
// saved, so a card moved out of Done or restored meanwhile is left alone.
export function archiveOldDone(document: TaskDocument, now: Date): TaskOperation[] {
  if (!document.archiveDone.enabled) return [];
  const cutoff = new Date(now.getTime() - document.archiveDone.days * 24 * 60 * 60 * 1000).toISOString();
  return doneBefore(document, cutoff).length ? [{ kind: "archiveDoneBefore", cutoff }] : [];
}
