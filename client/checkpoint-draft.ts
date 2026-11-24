import type { Checkpoint, CheckpointFields } from "../shared/work-checkpoints";

export interface CheckpointDraft { baseline: Checkpoint; fields: CheckpointFields; }
export const checkpointDirty = (value: CheckpointDraft) => JSON.stringify(value.fields) !== JSON.stringify(value.baseline.fields);
export function createCheckpointDrafts() {
  const drafts = new Map<string, CheckpointDraft>();
  return {
    get(key: string) { return drafts.get(key); },
    set(key: string, value: CheckpointDraft) { if (checkpointDirty(value)) drafts.set(key, structuredClone(value)); else drafts.delete(key); },
    saved(key: string, submitted: CheckpointDraft, result: Checkpoint) {
      const current = drafts.get(key);
      if (!current || current.baseline.revision !== submitted.baseline.revision) return;
      if (JSON.stringify(current.fields) === JSON.stringify(submitted.fields)) drafts.delete(key);
      else drafts.set(key, { baseline: structuredClone(result), fields: structuredClone(current.fields) });
    },
    clear(key: string) { drafts.delete(key); },
  };
}
