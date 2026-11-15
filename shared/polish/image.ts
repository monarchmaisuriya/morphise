// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): shared/image.ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Reads an image the agent produced on the daemon machine, so any client can show it. */
export const readImage = defineRpc({
  name: "polish.image.read",
  input: z.object({ path: z.string().min(1), variant: z.enum(["thumbnail", "original"]).optional() }),
  output: z.object({ dataUrl: z.string() }),
});

/** Reads an image an agent-written page names; the daemon serves it only from inside the folder of the agent that made the page. */
export const readPageImage = defineRpc({
  name: "polish.page.image",
  input: z.object({ path: z.string().min(1), agentId: z.string().min(1) }),
  output: z.object({ dataUrl: z.string() }),
});
