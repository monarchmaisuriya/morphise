// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): shared/update.ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** One exact revision: a full Git commit, or an npm version. Shaped so it can never read as a CLI flag. */
export const revisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("git"), commit: z.string().regex(/^[0-9a-f]{40}$/) }),
  z.object({ kind: z.literal("npm"), version: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]*$/) }),
]);
export type Revision = z.output<typeof revisionSchema>;

/** What `paseo plugin update --check` found for this plugin's install, in the dashboard's terms. */
export const updateStatusSchema = z.object({
  /** "local": installed from a folder, which only reloads; "error": the check failed (offline, CLI missing). */
  state: z.enum(["update", "current", "local", "error"]),
  /** Short commit (Git) or version (npm) installed and offered. */
  current: z.string().optional(),
  target: z.string().optional(),
  /** The exact revision offered; Update installs this one, not whatever is newest by then. */
  revision: revisionSchema.optional(),
  /** Where to review the change (a compare link for Git). */
  links: z.array(z.string()).default([]),
  error: z.string().optional(),
});
export type UpdateStatus = z.output<typeof updateStatusSchema>;

export const checkUpdate = defineRpc({ name: "polish.update.check", input: z.object({}), output: updateStatusSchema });

/** Applies the update the user reviewed; Paseo then installs it and restarts the plugin. */
export const applyUpdate = defineRpc({ name: "polish.update.apply", input: z.object({ target: revisionSchema }), output: z.object({ error: z.string().optional() }) });
