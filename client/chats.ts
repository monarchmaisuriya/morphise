import { chatIndicator, type ChatStatusFields, isListedChat } from "../shared/chat-status";
import type { Indicator } from "../shared/profile";
import type { ChatTransition } from "../shared/rules";

// Open chats as the app sees them in the SDK agent list: titles for follow-up tasks and pills,
// workspaces for header buttons, and status changes for automation rules.

export interface ChatInfo {
  title: string;
  workspaceId: string;
  indicator: Indicator;
  // `provider/model`, the form Paseo's agent config takes.
  model: string;
}

export type Chats = ReadonlyMap<string, ChatInfo>;

type Change = { snapshot: readonly { agent: unknown }[] } | { message: { type: string; payload?: unknown } };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readChat(value: unknown): { id: string; info: ChatInfo | null } | null {
  const agent = record(value);
  if (!agent || typeof agent.id !== "string") return null;
  const status = agent.status as ChatStatusFields["status"];
  if (!isListedChat({ status, parentAgentId: typeof agent.parentAgentId === "string" ? agent.parentAgentId : null })) return { id: agent.id, info: null };
  const indicator = chatIndicator({
    status,
    requiresAttention: agent.requiresAttention === true,
    attentionReason: (agent.attentionReason ?? null) as ChatStatusFields["attentionReason"],
  });
  const title = typeof agent.title === "string" && agent.title ? agent.title : typeof agent.provider === "string" ? agent.provider : "Chat";
  const provider = typeof agent.provider === "string" ? agent.provider : "";
  // Empty when the model is unknown: Paseo's agent config needs both parts.
  const model = provider && typeof agent.model === "string" && agent.model ? `${provider}/${agent.model}` : "";
  return { id: agent.id, info: { title, workspaceId: typeof agent.workspaceId === "string" ? agent.workspaceId : "", indicator, model } };
}

const same = (left: ChatInfo | undefined, right: ChatInfo | null) =>
  left?.title === right?.title && left?.workspaceId === right?.workspaceId && left?.indicator === right?.indicator && left?.model === right?.model;

// A snapshot replaces the list without reporting transitions (nothing "entered" a status);
// updates report each chat that entered a different status.
export function reduceChats(current: Chats, change: Change): { chats: Chats; transitions: ChatTransition[] } {
  if ("snapshot" in change) {
    const chats = new Map<string, ChatInfo>();
    for (const { agent } of change.snapshot) {
      const read = readChat(agent);
      if (read?.info) chats.set(read.id, read.info);
    }
    return { chats, transitions: [] };
  }
  const payload = record(change.message.payload);
  if (change.message.type !== "agent_update" || !payload) return { chats: current, transitions: [] };
  if (payload.kind === "remove" && typeof payload.agentId === "string" && current.has(payload.agentId)) {
    const chats = new Map(current);
    chats.delete(payload.agentId);
    return { chats, transitions: [] };
  }
  if (payload.kind !== "upsert") return { chats: current, transitions: [] };
  const read = readChat(payload.agent);
  if (!read) return { chats: current, transitions: [] };
  const before = current.get(read.id);
  if (same(before, read.info)) return { chats: current, transitions: [] };
  const chats = new Map(current);
  if (read.info) chats.set(read.id, read.info);
  else chats.delete(read.id);
  const transitions = read.info && before && before.indicator !== read.info.indicator ? [{ agentId: read.id, to: read.info.indicator }] : [];
  return { chats, transitions };
}

// The chat a workspace-level "Remind me" is about: the one in focus if it belongs to that
// workspace, otherwise the workspace's first open chat.
export function chatForWorkspace(chats: Chats, workspaceId: string, focusedAgentId: string | null): string | null {
  if (focusedAgentId && chats.get(focusedAgentId)?.workspaceId === workspaceId) return focusedAgentId;
  for (const [agentId, chat] of chats) if (chat.workspaceId === workspaceId) return agentId;
  return null;
}
