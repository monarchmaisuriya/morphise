import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { chatIndicator, type ChatStatusFields } from "./chat-status";

export const QUICK_CHAT_KEY = "morphise.quick-chat";
export function countedQuickChat(agent: ChatStatusFields & { hostId: string; workspaceId: string | null; parentAgentId: string | null; metadata: Readonly<Record<string, unknown>>; internal?: boolean; archivedAt?: string | null }, hostId: string) {
  return agent.hostId === hostId && !!agent.workspaceId && agent.parentAgentId === null && agent.metadata[QUICK_CHAT_KEY] === true && !agent.internal && !agent.archivedAt && chatIndicator(agent) !== "done";
}
export const quickChatSettings = defineSettings({ id: "quick-chat", scope: "host", version: 1, schema: z.object({ enabled: z.boolean().default(false) }) });
export const quickChatPreferences = defineSettings({ id: "quick-chat-preferences", scope: "device", version: 1, schema: z.object({
  rememberModel: z.boolean().default(true),
  lastModel: z.string().max(300).default(""),
  width: z.enum(["comfortable", "wide"]).default("comfortable"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  showDescriptions: z.boolean().default(true),
}) });
export type QuickChatPreferences = z.output<typeof quickChatPreferences.schema>;
export const QUICK_CHAT_PREFERENCES = quickChatPreferences.schema.parse({});
export function restoredQuickChatModel(manual: string | null, preferences: Pick<QuickChatPreferences, "rememberModel" | "lastModel">): string {
  return manual ?? (preferences.rememberModel ? preferences.lastModel : "");
}
const id = z.string().uuid();
const destination = z.object({ agentId: z.string(), workspaceId: z.string(), warning: z.string().nullable() });
export const quickChatList = defineRpc({ name: "quick-chat.list", input: z.object({ includeArchived: z.boolean().optional() }), output: z.object({ enabled: z.boolean(), directory: z.string(), archiveSupported: z.boolean().optional(), chats: z.array(z.object({ id: z.string(), title: z.string(), workspaceId: z.string(), directory: z.string().optional(), docsDirectory: z.string().optional(), archivedAt: z.string().nullable().optional(), provider: z.string().optional(), createdAt: z.string().optional(), updatedAt: z.string().optional() })) }) });
export const quickChatArchive = defineRpc({ name: "quick-chat.archive", input: z.object({ agentId: z.string().min(1).max(200), archived: z.boolean() }), output: z.object({ ok: z.literal(true) }) });
export type QuickChatListItem = z.output<typeof quickChatList.output>["chats"][number];
export function filteredQuickChats(chats: readonly QuickChatListItem[], options: { archived: boolean; query: string; provider: string; sort: "updated" | "created" | "title" }): QuickChatListItem[] {
  const query = options.query.trim().toLowerCase();
  const time = (value: string | undefined) => { const at = Date.parse(value || ""); return Number.isFinite(at) ? at : -Infinity; };
  return chats.filter((chat) => !!chat.archivedAt === options.archived && (!query || chat.title.toLowerCase().includes(query)) && (!options.provider || chat.provider === options.provider)).sort((a, b) => {
    if (options.sort === "title") return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    const left = time(options.sort === "created" ? a.createdAt : a.updatedAt);
    const right = time(options.sort === "created" ? b.createdAt : b.updatedAt);
    return (left === right ? 0 : left > right ? -1 : 1) || a.id.localeCompare(b.id);
  });
}
export const quickChatStart = defineRpc({ name: "quick-chat.start", input: z.object({ operationId: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/), provider: z.string().min(3).max(300).regex(/^[^\s/]+\/.+$/) }), output: z.object({ agentId: z.string(), workspaceId: z.string(), directory: z.string() }) });
export const quickChatTargets = defineRpc({ name: "quick-chat.targets", input: z.object({}), output: z.object({ targets: z.array(z.object({ id: z.string(), title: z.string(), directory: z.string() })) }) });
export const quickChatPrepare = defineRpc({ name: "quick-chat.prepare", input: z.object({ agentId: z.string().min(1).max(200), workspaceId: z.string().min(1).max(200) }), output: z.object({ previewId: id, text: z.string(), provider: z.string(), directory: z.string(), entries: z.number(), partial: z.boolean(), files: z.array(z.string()), filesPartial: z.boolean() }) });
export const quickChatContinue = defineRpc({ name: "quick-chat.continue", input: z.object({ previewId: id, text: z.string().trim().min(1).max(40000) }), output: destination });
export const quickChatRecover = defineRpc({ name: "quick-chat.recover", input: z.object({ operationId: id }), output: destination });

/** Keep ordinary entries and owned user quick chats, never unrelated hidden helpers. */
export function visibleQuickChatAgent(value: unknown): boolean {
  const agent = value as { background?: boolean; internal?: boolean; labels?: Record<string, unknown>; metadata?: Record<string, unknown> };
  return agent.internal !== true && (agent.background !== true || (agent.metadata?.[QUICK_CHAT_KEY] === true && !agent.labels?.["paseo.parent-agent-id"]));
}

export function quickChatAgentChange(message: { type: string; payload?: unknown }) {
  const payload = message.payload as { kind?: string; agent?: { id: string } } | undefined;
  return message.type === "agent_update" && payload?.kind === "upsert" && payload.agent && !visibleQuickChatAgent(payload.agent)
    ? { type: message.type, payload: { kind: "remove", agentId: payload.agent.id } }
    : message;
}
