import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const workId = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
export const checkpointFields = z.strictObject({ goal: z.string().max(2000), verified: z.string().max(2000), blocked: z.string().max(2000), next: z.string().max(2000) });
export type CheckpointFields = z.infer<typeof checkpointFields>;
export const EMPTY_CHECKPOINT: CheckpointFields = { goal: "", verified: "", blocked: "", next: "" };
export const checkpointSchema = z.object({ workspaceId: workId, revision: z.number().int().nonnegative(), fields: checkpointFields, author: z.string(), updatedAt: z.string().nullable() });
export type Checkpoint = z.infer<typeof checkpointSchema>;
export const checkpointRead = defineRpc({ name: "work.checkpoint.read", input: z.object({ workspaceId: workId }), output: checkpointSchema });
export const checkpointSave = defineRpc({ name: "work.checkpoint.save", input: z.object({ workspaceId: workId, revision: z.number().int().nonnegative(), fields: checkpointFields }), output: checkpointSchema });
