import { type AgentRef, useAgent, useRpc, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { statsRead, statsSettings, totalTokens, type StatsReadResult } from "../shared/stats";
import { formatTokens } from "../shared/stats-format";
import { Button, type Tokens } from "./ui/kit";

function AgentUsageRow({ reference, t }: { reference: AgentRef; t: Tokens }) {
  const agent = useAgent(reference, (value) => ({ title: value.title, provider: value.provider, model: value.model, status: value.status, parent: value.parentAgentId }));
  return agent ? <View style={{ gap: 2 }}><Text style={t.text.body}>{agent.title || "Unnamed chat"}{agent.parent ? " · subagent" : ""}</Text><Text style={t.text.meta}>{agent.provider} · {agent.model || "Model unavailable"} · {agent.status}</Text></View> : null;
}

function LatestChatTokens({ reference, hostId, t }: { reference: AgentRef; hostId: string | null; t: Tokens }) {
  const read = useRpc(statsRead);
  const setting = useSettings(statsSettings);
  const enabled = setting.status === "ready" && setting.values.enabled;
  const [result, setResult] = useState<{ key: string; value: StatsReadResult } | null>(null);
  const name = useAgent(reference, (agent) => agent.title || agent.provider);
  useEffect(() => {
    if (!enabled || reference.hostId !== hostId) return;
    let alive = true;
    void read({ agentId: reference.id }).then((value) => { if (alive) setResult({ key: reference.key, value }); }, (error) => { if (alive) setResult({ key: reference.key, value: { status: "error", error: String(error) } }); });
    return () => { alive = false; };
  }, [enabled, reference.hostId, reference.id, reference.key, hostId, read]);
  const value = result?.key === reference.key ? result.value : null;
  return <View testID="workspace-latest-chat-tokens" style={{ gap: 5 }}>
    <Text style={t.text.heading}>Latest chat · session lifetime tokens</Text>
    <Text style={t.text.meta}>{name || "Chat unavailable"}. Not workspace-wide or limited to 24 hours.</Text>
    {reference.hostId !== hostId ? <Text style={t.text.meta}>Usage unavailable on this host.</Text> : setting.status !== "ready" ? <Text style={t.text.meta}>Usage settings unavailable or loading.</Text> : !enabled ? <Text style={t.text.meta}>Token stats are disabled in Settings.</Text> : !value ? <Text style={t.text.meta}>Reading token usage…</Text> : value.status === "ready" ? <>
      <Text style={t.text.body}>{formatTokens(totalTokens(value.stats))} total · {value.stats.turns} turns</Text>
      <Text selectable style={t.text.meta}>Input: {value.stats.inputTokens.toLocaleString()} · Output: {value.stats.outputTokens.toLocaleString()}</Text>
      <Text selectable style={t.text.meta}>Cache read: {value.stats.cachedTokens.toLocaleString()} · Cache write: {value.stats.cacheWriteTokens.toLocaleString()} (already included in input)</Text>
      {value.partial ? <Text style={t.text.meta}>Partial log reading · counts may increase on the next read.</Text> : null}
      <Text style={t.text.meta}>Provider log counters, not a bill or context-window size. Reopen Info to refresh.</Text>
    </> : <Text style={t.text.meta}>{value.status === "unavailable" ? value.reason : `Token usage unavailable: ${value.error}`}</Text>}
  </View>;
}

export function WorkspaceUsage({ agents, rootCount, subCount, runningCount, projectCount, latest, hostId, t }: { agents: readonly AgentRef[]; rootCount: number; subCount: number; runningCount: number; projectCount: number; latest: AgentRef | null; hostId: string | null; t: Tokens }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={{ padding: 8, gap: 7, borderTopWidth: 1, borderColor: t.c.border }}>
    <Text style={t.text.heading}>Agents & usage</Text>
    <Text style={t.text.body}>{rootCount} chats · {subCount} subagents · {runningCount} working</Text>
    <Text style={t.text.meta}>{projectCount} open workspaces in this project on this host, including background workspaces.</Text>
    {agents.length ? <Button t={t} size="sm" variant="ghost" label={expanded ? "Hide agents and models" : "Show agents and models"} onPress={() => setExpanded(!expanded)} /> : <Text style={t.text.meta}>No agents listed in this workspace.</Text>}
    {expanded ? agents.map((reference) => <AgentUsageRow key={reference.key} reference={reference} t={t} />) : null}
    {latest ? <LatestChatTokens reference={latest} hostId={hostId} t={t} /> : null}
  </View>;
}
