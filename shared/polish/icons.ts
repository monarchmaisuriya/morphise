// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): the getIconSet contract from shared/timeline.ts.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { ICON_SETS } from "./prefs";

/** One icon set's twins, Lucide name → 24px SVG markup, fetched when the Icon set choice picks it. */
export const getIconSet = defineRpc({ name: "polish.icons.get", input: z.object({ set: z.enum(ICON_SETS) }), output: z.record(z.string(), z.string()) });
