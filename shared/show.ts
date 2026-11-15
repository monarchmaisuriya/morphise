// "Show in Paseo": an agent tool that asks M's Paseo app to bring something to the front (a chat, a
// terminal, a workspace, a Morphise screen), to place text in an empty message box, or to pin a
// workspace. The daemon picks the window M used last and sends it the request over `showChannel`;
// that window runs it and answers on `showResult`. Nothing is sent or pressed for M.
import { defineRpc, defineSettings, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { HIDDEN_CHARACTERS } from "./hidden-text";

export const SHOW_TOOL = "show_in_paseo";

// Host-wide and kept out of the profile, so it does not change with layouts and an older Morphise
// ignores it. Missing means on (M's choice); the daemon treats an unreadable document as off.
export const showSettings = defineSettings({
  id: "show-in-paseo",
  scope: "host",
  version: 1,
  schema: z.object({ enabled: z.boolean().optional() }),
});
export const showEnabled = (values: { enabled?: boolean }) => values.enabled !== false;

export const SHOW_ACTIONS = ["chat", "draft", "terminal", "workspace", "screen", "pin"] as const;
export const DRAFT_MAX = 2000;
// Paseo ids are letters, digits and `_ . : -`; anything else (a line break, say) could forge log lines.
const id = z.string().trim().regex(/^[\w.:-]{1,200}$/, "must be a Paseo id");

// One flat object: Paseo publishes a tool input that is not an object to agents as an empty schema.
export const showInput = z
  .object({
    action: z
      .enum(SHOW_ACTIONS, { error: () => `action must be one of ${SHOW_ACTIONS.join(", ")}` })
      .describe("chat: open an agent's chat. draft: put text in an agent's empty message box (not sent). terminal: open a terminal tab. workspace: open a workspace. screen: open a Morphise screen. pin: pin or unpin a workspace."),
    agentId: id.optional().describe("chat and draft: the agent whose chat to open or write into."),
    terminalId: id.optional().describe("terminal: the terminal to open."),
    workspaceId: id.optional().describe("workspace and pin: the workspace."),
    screen: z.enum(["workbench", "dispatch"]).optional().describe("screen: which Morphise screen."),
    view: z.enum(["agents", "board", "bookmarks"]).optional().describe("screen workbench: which view to open."),
    text: z.string().min(1).max(DRAFT_MAX).optional().describe("draft: the text to place, for the user to read and send. Never a slash command."),
    pinned: z.boolean().optional().describe("pin: true to pin, false to unpin."),
  })
  .superRefine((input, context) => {
    const need = (field: keyof typeof input) => {
      if (input[field] === undefined) context.addIssue({ code: "custom", path: [field], message: `${input.action} needs ${field}` });
    };
    if (input.action === "chat" || input.action === "draft") need("agentId");
    if (input.action === "draft") need("text");
    if (input.action === "terminal") need("terminalId");
    if (input.action === "workspace" || input.action === "pin") need("workspaceId");
    if (input.action === "screen") need("screen");
    if (input.action === "pin") need("pinned");
    if (input.action !== "draft" || input.text === undefined) return;
    // A slash command would be one Enter from running, e.g. Morphise's own `/run <command>`.
    if (input.text.trimStart().startsWith("/")) context.addIssue({ code: "custom", path: ["text"], message: "draft text cannot start with /: it would be a command" });
    if (HIDDEN_CHARACTERS.test(input.text)) context.addIssue({ code: "custom", path: ["text"], message: "draft text has hidden or control characters" });
  });
export type ShowInput = z.output<typeof showInput>;

// What the daemon asks a window to do (pin runs on the daemon and never reaches a window).
export const showRequest = z.object({
  requestId: z.string().min(1),
  input: showInput,
});
export type ShowRequest = z.output<typeof showRequest>;

// Held open by every app; `windowId` is new on each app start.
export const showChannel = defineSubscription({
  name: "show.channel",
  input: z.object({ windowId: z.string().min(1).max(100) }),
  event: showRequest,
});

// A window reports that M is using it (`inFront`), or that M left it.
export const showUsed = defineRpc({
  name: "show.used",
  input: z.object({ windowId: z.string().min(1).max(100), inFront: z.boolean() }),
  output: z.object({ ok: z.literal(true) }),
});

// A window's answer to one request.
export const showResult = defineRpc({
  name: "show.result",
  input: z.object({ requestId: z.string().min(1), ok: z.boolean(), message: z.string().max(300) }),
  output: z.object({ ok: z.literal(true) }),
});
