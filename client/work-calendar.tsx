import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { calendarDays, calendarRange, calendarRead, calendarTotals, clippedInterval, type WorkInterval } from "../shared/work-calendar";
import { Button, PopoverHost, Segmented, Select, useTokens } from "./ui/kit";
import type { WorkspaceList } from "./workspaces";

function CalendarBody({ client, theme, compact, workspaces, openChat }: { client: PluginClientContext; theme: PluginTheme; compact: boolean; workspaces: WorkspaceList; openChat: ((id: string) => void) | null }) {
  const t = useTokens(theme, compact);
  const [mode, setMode] = useState<"day" | "week">("week"), [date, setDate] = useState(() => new Date());
  const [provider, setProvider] = useState(""), [workspace, setWorkspace] = useState("");
  const [project, setProject] = useState("");
  const [data, setData] = useState<{ recordingSince: number; pruned: number; intervals: WorkInterval[] } | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState({ from: -1, to: -1, at: 0 });
  const [coverage, setCoverage] = useState(false);
  const { from, to } = calendarRange(date, mode), start = new Date(from);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null); setData(null);
    client.rpc(calendarRead, { from, to }).then((value) => { if (alive) { setData(value); setSnapshot({ from, to, at: Date.now() }); } }, (error) => { if (alive) { setData(null); setError(error instanceof Error ? error.message : String(error)); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [client, from, to, refresh]);
  const currentData = snapshot.from === from && snapshot.to === to ? data : null;
  const now = snapshot.at, intervals = (currentData?.intervals ?? []).filter((value) => (!provider || value.provider === provider) && (!workspace || value.workspaceId === workspace) && (!project || workspaces.get(value.workspaceId ?? "")?.project === project));
  const days = calendarDays(intervals, from, to, now);
  const totals = calendarTotals(intervals, from, to, now);
  const hours = (ms: number) => `${(ms / 3600000).toFixed(2)} h`;
  const move = (amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount * (mode === "week" ? 7 : 1)); setDate(next); };
  return <ScrollView style={{ flex: 1, backgroundColor: t.c.surface0 }} contentContainerStyle={{ padding: t.inset, gap: 12 }}>
    <Text style={t.text.title}>Agent work calendar</Text><Text style={t.text.meta}>Observed agent runtime, not human work hours. Local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. No historical backfill.</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Segmented<"day" | "week"> t={t} label="Calendar range" value={mode} onChange={setMode} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} /><Button t={t} variant="ghost" label="Previous" onPress={() => move(-1)} /><Button t={t} variant="ghost" label="Today" onPress={() => setDate(new Date())} /><Button t={t} variant="ghost" label="Next" onPress={() => move(1)} /><Button t={t} variant="ghost" label="Refresh calendar" disabled={loading} onPress={() => setRefresh((value) => value + 1)} /></View>
    <Text style={t.text.heading}>{start.toLocaleDateString()} - {new Date(to - 1).toLocaleDateString()}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Select t={t} label="Calendar provider" value={provider} onChange={setProvider} options={[{ value: "", label: "All providers" }, ...[...new Set(data?.intervals.map((value) => value.provider) ?? [])].map((value) => ({ value, label: value }))]} /><Select t={t} label="Calendar workspace" value={workspace} onChange={setWorkspace} options={[{ value: "", label: "All workspaces / projects" }, ...[...new Set(data?.intervals.map((value) => value.workspaceId).filter((value): value is string => !!value) ?? [])].map((value) => ({ value, label: workspaces.get(value)?.name ?? value }))]} /></View>
    <Select t={t} label="Calendar project" value={project} onChange={setProject} options={[{ value: "", label: "All projects" }, ...[...new Set([...workspaces.values()].map((value) => value.project).filter(Boolean))].map((value) => ({ value, label: value }))]} />
    {error ? <Text accessibilityRole="alert" style={t.text.danger}>{error}</Text> : null}{loading ? <Text style={t.text.meta}>Loading calendar…</Text> : null}
    {currentData ? <>
      <Text style={t.text.meta}>Last refreshed {new Date(snapshot.at).toLocaleString()} · snapshot, not a live clock</Text>
      <Text style={t.text.heading}>{hours(totals.agentMs)} summed agent time · {hours(totals.elapsedMs)} elapsed coverage</Text>
      <Button t={t} variant="ghost" label={coverage ? "Hide calendar coverage" : "Show calendar coverage"} onPress={() => setCoverage(!coverage)} />
      {coverage ? <Text style={t.text.meta}>Recording since {new Date(currentData.recordingSince).toLocaleString()}. Shows up to 90 days / 20,000 intervals; older terminal records are pruned on the next recorded event. {currentData.pruned} older records removed. {intervals.filter((value) => value.uncertain).length} uncertain observations in this filtered range, excluded from totals. Parallel agents count separately in summed time; elapsed coverage merges overlaps. Neither measures human work hours. Periods when the plugin was not observing may be missing.</Text> : null}
    </> : null}
    {!loading && currentData && !intervals.length ? <View style={{ gap: 8 }}><Text style={t.text.body}>{currentData.intervals.length ? "No intervals match these filters." : to <= currentData.recordingSince ? "This range is before recording began. No historical backfill is available." : "No recorded work in this range. Work while recording was inactive may be missing."}</Text>{provider || workspace || project ? <Button t={t} variant="ghost" label="Clear calendar filters" onPress={() => { setProvider(""); setWorkspace(""); setProject(""); }} /> : null}</View> : null}
    {currentData ? days.filter((day) => day.intervals.length).map((day) => <View key={day.from} style={{ gap: 8 }}><Text accessibilityRole="header" style={t.text.heading}>{new Date(day.from).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</Text>{[...day.intervals].sort((a, b) => a.startAt - b.startAt).map((value) => { const span = clippedInterval(value, day.from, day.to, now); return <View key={value.id} style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.row, padding: 12, gap: 4 }}>
      <Text style={t.text.heading}>{value.title}</Text><Text style={t.text.meta}>{workspaces.get(value.workspaceId ?? "")?.project ?? "Unknown / removed project"} · {value.provider}</Text><Text style={t.text.body}>{new Date(Math.max(day.from, value.startAt)).toLocaleTimeString()} → {new Date(Math.min(day.to, value.endAt ?? now, now)).toLocaleTimeString()}{value.endAt === null ? " · Running at last refresh" : ""}</Text><Text style={t.text.meta}>{value.outcome}{value.uncertain ? " · uncertain, not counted" : ` · ${hours(span?.ms ?? 0)}`}</Text>{openChat ? <Button t={t} variant="ghost" label={`Open ${value.title}`} onPress={() => openChat(value.agentId)} /> : null}
    </View>; })}</View>) : null}
  </ScrollView>;
}

export function WorkCalendar(props: Parameters<typeof CalendarBody>[0]) { return <PopoverHost><CalendarBody {...props} /></PopoverHost>; }
