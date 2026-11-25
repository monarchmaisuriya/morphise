import { type AgentRef, useAgent, useRpc, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { statsRead, statsSettings, totalTokens, type StatsReadResult } from "../shared/stats";
import { formatTokens } from "../shared/stats-format";
import type { Tokens } from "./ui/kit";
import { DetailFact } from "./detail-fact";

function AgentUsageRow({ reference, t }: { reference: AgentRef; t: Tokens }) {
  const agent = useAgent(reference, (value) => ({ title: value.title, provider: value.provider, model: value.model, status: value.status, parent: value.parentAgentId }));
  return agent ? <View testID={`workspace-agent-${reference.key}`} style={{ gap: 2, paddingVertical: 6 }}><Text selectable style={[t.text.body, { fontSize: 12, fontWeight: "600" }]}>{agent.title || "Unnamed chat"}</Text><DetailFact t={t} label="Provider" value={agent.provider} /><DetailFact t={t} label="Model" value={agent.model || "Unavailable"} /><DetailFact t={t} label="State" value={`${agent.status}${agent.parent ? " · subagent" : " · chat"}`} /></View> : null;
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
  return <View testID="workspace-latest-chat-tokens" style={{ gap: 4, paddingTop: 10, borderTopWidth: 1, borderColor: t.c.border }}>
    <Text style={t.text.heading}>Token usage</Text>
    <DetailFact t={t} label="Chat" value={name || "Unavailable"} />
    <DetailFact t={t} label="Scope" value="Latest chat · session lifetime" />
    <Text style={t.text.meta}>Not workspace-wide or limited to 24 hours.</Text>
    {reference.hostId !== hostId ? <Text style={t.text.meta}>Usage unavailable on this host.</Text> : setting.status !== "ready" ? <Text style={t.text.meta}>Usage settings unavailable or loading.</Text> : !enabled ? <Text style={t.text.meta}>Token stats are disabled in Settings.</Text> : !value ? <Text style={t.text.meta}>Reading token usage…</Text> : value.status === "ready" ? <>
      <DetailFact t={t} label="Total tokens" value={`${formatTokens(totalTokens(value.stats))} (${totalTokens(value.stats).toLocaleString()})`} />
      <DetailFact t={t} label="Input" value={value.stats.inputTokens.toLocaleString()} />
      <DetailFact t={t} label="Output" value={value.stats.outputTokens.toLocaleString()} />
      <DetailFact t={t} label="Cache read" value={value.stats.cachedTokens.toLocaleString()} />
      <DetailFact t={t} label="Cache write" value={value.stats.cacheWriteTokens.toLocaleString()} />
      <DetailFact t={t} label="Turns" value={value.stats.turns} />
      <Text style={t.text.meta}>Total = input + output. Cache reads/writes are already part of input.</Text>
      {value.partial ? <Text style={t.text.meta}>Partial log reading · counts may increase on the next read.</Text> : null}
      <Text style={t.text.meta}>Provider log counters, not a bill or context-window size. Reopen Info to refresh.</Text>
    </> : <Text style={t.text.meta}>{value.status === "unavailable" ? value.reason : `Token usage unavailable: ${value.error}`}</Text>}
  </View>;
}

export function WorkspaceUsage({ agents, rootCount, subCount, runningCount, projectCount, latest, hostId, t }: { agents: readonly AgentRef[]; rootCount: number; subCount: number; runningCount: number; projectCount: number; latest: AgentRef | null; hostId: string | null; t: Tokens }) {
  return <View style={{ padding: 10, gap: 6, borderTopWidth: 1, borderColor: t.c.border }}>
    <Text style={t.text.heading}>Agents & models</Text>
    <DetailFact t={t} label="This workspace" value={`${rootCount} chats · ${subCount} subagents · ${runningCount} working`} />
    <DetailFact t={t} label="This project" value={`${projectCount} open workspaces on this host`} />
    <Text style={t.text.meta}>Project count includes background workspaces.</Text>
    {!agents.length ? <Text style={t.text.meta}>No agents listed in this workspace.</Text> : null}
    {agents.map((reference) => <AgentUsageRow key={reference.key} reference={reference} t={t} />)}
    {latest ? <LatestChatTokens reference={latest} hostId={hostId} t={t} /> : null}
  </View>;
}
