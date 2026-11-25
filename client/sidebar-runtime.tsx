import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { calendarRead } from "../shared/work-calendar";
import { workspaceRuntime } from "../shared/sidebar-runtime";
import { durationText } from "../shared/calendar-layout";
import { useTooltip } from "./web";
import { Button, type Tokens } from "./ui/kit";

export type SidebarRuntime = { status: "loading" } | { status: "failed"; error?: string } | { status: "ready"; hostId: string; at: number; recordingSince: number; pruned: number; workspaces: ReturnType<typeof workspaceRuntime> };

export function useSidebarRuntime(hostId: string | null, now: Date): SidebarRuntime {
  const read = useRpc(calendarRead);
  const minute = Math.floor(+now / 60000);
  const [value, setValue] = useState<{ key: string; state: SidebarRuntime } | null>(null);
  const pending = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => { generation.current++; pending.current = null; }, [hostId]);
  useEffect(() => {
    if (!hostId || pending.current === hostId) return;
    const request = generation.current;
    pending.current = hostId;
    const at = +now;
    void read({ from: at - 86400000, to: at }).then((result) => {
      if (generation.current === request) setValue({ key: hostId, state: { status: "ready", hostId, at, recordingSince: result.recordingSince, pruned: result.pruned, workspaces: workspaceRuntime(result.intervals, at) } });
    }, (error) => { if (generation.current === request) setValue({ key: hostId, state: { status: "failed", error: String(error) } }); }).finally(() => { if (generation.current === request) pending.current = null; });
  }, [hostId, minute, read]);
  useEffect(() => () => { generation.current++; }, []);
  return value?.key === hostId ? value.state : { status: "loading" };
}

export function RuntimeStrip({ value, hostId, workspaceId, t }: { value: SidebarRuntime; hostId: string; workspaceId: string; t: Tokens }) {
  const observed = value.status === "ready" && value.hostId === hostId ? value.workspaces.get(workspaceId) : null;
  const partial = value.status === "ready" && (value.recordingSince > value.at - 86400000 || value.pruned > 0 || observed?.uncertain);
  const available = value.status === "ready" && value.hostId === hostId && !(partial && !observed?.total);
  const label = !available ? "24-hour agent runtime unavailable" : `Last 24 hours: ${durationText(observed?.total ?? 0)} summed recorded agent runtime; parallel agents count separately; ${partial ? "partial coverage; observation gaps may exist" : "observation gaps may exist"}; refreshed ${new Date(value.at).toLocaleTimeString()}`;
  const tooltip = useTooltip(label, t.c);
  if (!available || !observed?.total) return null;
  const minutes = Math.floor(observed.total / 60000);
  const duration = minutes < 1 ? "<1m" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return <View ref={tooltip} testID={`workspace-runtime-${hostId}-${workspaceId}`} accessibilityLabel={label} style={{ marginTop: 1 }}>
    <Text numberOfLines={1} style={[t.text.meta, { fontSize: 10, textAlign: "right" }]}>{partial ? "~" : ""}{duration} / 24h</Text>
  </View>;
}

export function RuntimeDetails({ value, hostId, workspaceId, t, interactive = false }: { value: SidebarRuntime; hostId: string; workspaceId: string; t: Tokens; interactive?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (value.status === "loading") return <Text style={t.text.meta}>Loading recorded activity…</Text>;
  if (value.status === "failed") return <View style={{ gap: 4 }}><Text style={t.text.meta}>Recorded activity is unavailable.</Text><Text style={t.text.meta}>{value.error}</Text></View>;
  if (value.hostId !== hostId) return <Text style={t.text.meta}>Activity is unavailable for this host. No local history is substituted.</Text>;
  const observed = value.workspaces.get(workspaceId);
  const from = value.at - 86400000;
  const reasons = [
    ...(value.recordingSince > from ? [`Recording began ${new Date(value.recordingSince).toLocaleString()}, after this window started.`] : []),
    ...(value.pruned > 0 ? ["Older records have been removed. This workspace's total may be incomplete."] : []),
    ...(observed?.uncertain ? ["Uncertain or interrupted observations were excluded."] : []),
  ];
  return <View testID="workspace-activity-details" style={{ gap: 6 }}>
    <Text style={t.text.heading}>{observed?.total ? `${durationText(observed.total)} recorded` : "No confirmed runtime recorded"}</Text>
    <Text style={t.text.meta}>Across this workspace's agents in the last 24 hours. Not human work time.</Text>
    {reasons.length ? <Text style={t.text.body}>Incomplete recording · may undercount work (~)</Text> : null}
    <Text style={t.text.meta}>Window ends {new Date(value.at).toLocaleString()}</Text>
    {interactive ? <View style={{ alignSelf: "flex-start" }}><Button t={t} size="sm" variant="ghost" label={expanded ? "Hide activity explanation" : "How this is counted"} onPress={() => setExpanded(!expanded)} /></View> : null}
    {expanded || !interactive ? <View style={{ gap: 6 }}>
      {reasons.length ? <Text style={t.text.meta}>The ~ marker means incomplete coverage, not an estimated duration.</Text> : null}
      {reasons.map((reason) => <Text key={reason} style={t.text.meta}>{reason}</Text>)}
      <Text style={t.text.meta}>Parallel agents count separately: two agents working for 5 min add 10 min. Uncertain observations are excluded. This is not human work time.</Text>
      <Text style={t.text.meta}>Observation gaps may be missing even without the ~ marker.</Text>
      <Text style={t.text.meta}>Window: {new Date(from).toLocaleString()} to {new Date(value.at).toLocaleString()}</Text>
      <Text style={t.text.meta}>Snapshot cutoff: {new Date(value.at).toLocaleString()}. Updates about once a minute; checkpoint refresh does not refresh activity.</Text>
    </View> : null}
  </View>;
}
