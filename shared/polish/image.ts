// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): shared/image.ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Reads an image the agent produced on the daemon machine, so any client can show it. */
export const readImage = defineRpc({
  name: "polish.image.read",
  input: z.object({ path: z.string().min(1), variant: z.enum(["thumbnail", "original"]).optional() }),
  output: z.object({ dataUrl: z.string() }),
});
