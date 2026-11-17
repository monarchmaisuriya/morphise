// Session stats in the app: two pills by each chat's message box (activity and usage), each opening its readings, a
// Stats panel, and the rows the Agents details pane shows. Readings come from the daemon (`morphise.stats.read`), which
// reads the chat's own log; they refresh every 2 s while something on screen shows them. After Harness Stats by
// kogekiplay (MIT, see NOTICE.md).
import type { PluginAgentPanelProps, PluginButtonContentProps, PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type StatsReadResult, statsRead } from "../../shared/stats";
import { activityRows, pillLabel, usageRows } from "../../shared/stats-format";
import { createStatsCache } from "./cache";
import { Icon, type Tokens, useTokens } from "../ui/kit";

export const STATS_PANEL_ID = "stats";
const REFRESH_MS = 2000;

export type StatsReader = (agentId: string) => Promise<StatsReadResult>;

// One reader, with one cache, per app connection, shared by the pills, the panel and the details pane.
const readers = new WeakMap<PluginClientContext, StatsReader>();
export function statsReader(client: PluginClientContext): StatsReader {
  let read = readers.get(client);
  if (!read) readers.set(client, (read = createStatsCache((agentId) => client.rpc(statsRead, { agentId })).read));
  return read;
}

// The latest reading for a chat, refreshed every 2 s while mounted.
export function useSessionStats(read: StatsReader, agentId: string | null): StatsReadResult | null {
  const [result, setResult] = useState<StatsReadResult | null>(null);
  useEffect(() => {
    if (!agentId) return;
    let alive = true;
    const tick = () =>
      void read(agentId).then(
        (next) => alive && setResult(next),
        (error: unknown) => alive && setResult({ status: "error", error: error instanceof Error ? error.message : String(error) }),
      );
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [read, agentId]);
  return result;
}

export function StatsRows({ t, result, kinds }: { t: Tokens; result: StatsReadResult | null; kinds: readonly ("activity" | "usage")[] }) {
  if (!result) return <Text style={t.text.small}>Reading the chat's log…</Text>;
  if (result.status === "error") return <Text style={[t.text.small, { color: t.c.statusDanger }]}>This chat's log could not be read: {result.error}</Text>;
  if (result.status === "unavailable") return <Text style={t.text.small}>{result.reason}</Text>;
  const rows = kinds.flatMap((kind) => (kind === "activity" ? activityRows(result.stats) : usageRows(result.stats)));
  return (
    <View style={{ gap: 4 }}>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
          <Text style={t.text.small}>{label}</Text>
          <Text style={[t.text.body, { fontVariant: ["tabular-nums"] }]}>{value}</Text>
        </View>
      ))}
      {result.partial ? <Text style={t.text.small}>Still reading a long log; the numbers grow as it goes.</Text> : null}
      <Text style={[t.text.small, { opacity: 0.7 }]}>Times come from the log's timestamps, so they are estimates.</Text>
    </View>
  );
}

// The two pills for one chat. Paseo mounts a pill's icon only for the message box on screen, so the icon polls and
// writes the pill's label; a chat off screen reads nothing.
export function addStatsPills(client: PluginClientContext, read: StatsReader, agent: { id: string; workspaceId: string }): () => void {
  const registrations: PluginButtonRegistration[] = [];
  for (const kind of ["activity", "usage"] as const) {
    let registration: PluginButtonRegistration | null = null;
    function StatsPillIcon(props: PluginButtonIconProps) {
      const result = useSessionStats(read, agent.id);
      const label = pillLabel(kind, result);
      useEffect(() => registration?.update({ label }), [label]);
      return <Icon name={kind === "activity" ? "Gauge" : "Database"} size={props.size} color={props.color} />;
    }
    function StatsPopover(props: PluginButtonContentProps) {
      const t = useTokens(props.theme, props.layout.compact);
      const result = useSessionStats(read, agent.id);
      return (
        <View style={{ width: 260, padding: 12, gap: 8 }}>
          <Text style={[t.text.body, { fontWeight: "600" }]}>{kind === "activity" ? "Session activity" : "Session usage"}</Text>
          <StatsRows t={t} result={result} kinds={[kind]} />
        </View>
      );
    }
    registration = client.addComposerPill({
      id: `morphise-stats-${kind}`,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: { title: kind === "activity" ? "Session activity" : "Session usage", label: "…", icon: StatsPillIcon, behavior: { kind: "popover", Content: StatsPopover } },
    });
    registrations.push(registration);
  }
  return () => {
    for (const registration of registrations) registration.remove();
  };
}

// The Stats panel for the open chat: every reading at once.
export function createStatsPanel(read: StatsReader) {
  return function StatsPanel(props: PluginAgentPanelProps) {
    const t = useTokens(props.theme, props.layout.compact);
    const result = useSessionStats(read, props.params.agentId);
    return (
      <View style={{ padding: 16, gap: 16 }}>
        <Text style={[t.text.body, { fontWeight: "600" }]}>Session activity</Text>
        <StatsRows t={t} result={result} kinds={["activity"]} />
        <Text style={[t.text.body, { fontWeight: "600" }]}>Session usage</Text>
        <StatsRows t={t} result={result} kinds={["usage"]} />
      </View>
    );
  };
}
