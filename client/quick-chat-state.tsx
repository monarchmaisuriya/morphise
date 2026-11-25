import { useAgent, useAgents } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { chatIndicator } from "../shared/chat-status";
import { STATUS_TITLES } from "../shared/arrange";
import { SidebarStatusMark } from "./sidebar-status-mark";
import type { Tokens } from "./ui/kit";

export function QuickChatState({ agentId, hostId, archivedAt, t }: { agentId: string; hostId: string; archivedAt?: string | null; t: Tokens }) {
  const refs = useAgents({ hosts: [hostId], where: (agent) => agent.hostId === hostId && agent.id === agentId });
  const agent = useAgent(refs[0] ?? "", (value) => ({ status: value.status, requiresAttention: value.requiresAttention, attentionReason: value.attentionReason }));
  const indicator = agent ? chatIndicator(agent) : null;
  const label = archivedAt ? "Archived" : !agent ? "State unavailable" : agent.status === "initializing" ? "Starting" : indicator === "done" ? "Idle / Done" : indicator ? STATUS_TITLES[indicator] : "State unavailable";
  return <View testID={`quick-chat-state-${agentId}`} accessibilityLabel={`Chat state: ${label}`} style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 20 }}>
    {!archivedAt && indicator ? <SidebarStatusMark indicator={indicator} colors={t.c} /> : null}
    <Text style={t.text.meta}>{label}</Text>
  </View>;
}
