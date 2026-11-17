import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// Remove project in "Your groups". The plugin SDK has no call for it, so the daemon side runs Paseo's CLI
// (`paseo project delete`), which deletes the project and its workspaces; worktrees Paseo made go with them.

// Paseo's project ids (prj_<hex>); one word the CLI cannot read as an option.
const PROJECT_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function checkProjectId(id: string): string | null {
  return PROJECT_ID.test(id) ? null : "Not a project id";
}

const removeResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), removedWorkspaceIds: z.array(z.string()) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type RemoveProjectResult = z.output<typeof removeResult>;

export const removeProject = defineRpc({ name: "morphise.project.remove", input: z.object({ projectId: z.string().max(200) }), output: removeResult });
