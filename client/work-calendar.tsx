import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { calendarRange, calendarRead, calendarTotals, type WorkInterval } from "../shared/work-calendar";
import { calendarLayout, durationText, HOUR_HEIGHT } from "../shared/calendar-layout";
import { Button, IconButton, PopoverHost, Segmented, Select, useTokens } from "./ui/kit";
import type { WorkspaceList } from "./workspaces";

function CalendarBody({ client, theme, compact, workspaces, openChat }: { client: PluginClientContext; theme: PluginTheme; compact: boolean; workspaces: WorkspaceList; openChat: ((id: string) => void) | null }) {
  const t = useTokens(theme, compact);
  const [width, setWidth] = useState(0);
  const [choice, setChoice] = useState<"day" | "week" | null>(null), [date, setDate] = useState(() => new Date());
  const mode = choice ?? (width && width <= 640 ? "day" : "week");
  const [provider, setProvider] = useState(""), [workspace, setWorkspace] = useState(""), [project, setProject] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false), [coverage, setCoverage] = useState(false), [fullDay, setFullDay] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<View>(null);
  const eventRefs = useRef(new Map<string, View>());
  const origin = useRef<string | null>(null);
  useEffect(() => { if (selectedId) detailRef.current?.focus(); }, [selectedId]);
  const closeDetails = () => { setSelectedId(null); if (origin.current) eventRefs.current.get(origin.current)?.focus(); };
  const [data, setData] = useState<{ recordingSince: number; pruned: number; intervals: WorkInterval[] } | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState({ from: -1, to: -1, at: 0 });
  const { from, to } = calendarRange(date, mode);
  useEffect(() => {
    let alive = true; setLoading(true); setError(null); setData(null); setSelectedId(null);
    client.rpc(calendarRead, { from, to }).then((value) => { if (alive) { setData(value); setSnapshot({ from, to, at: Date.now() }); } }, (error) => { if (alive) { setData(null); setError(error instanceof Error ? error.message : String(error)); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [client, from, to, refresh]);
  useEffect(() => setSelectedId(null), [provider, workspace, project]);
  const currentData = snapshot.from === from && snapshot.to === to ? data : null;
  const intervals = (currentData?.intervals ?? []).filter((value) => (!provider || value.provider === provider) && (!workspace || value.workspaceId === workspace) && (!project || workspaces.get(value.workspaceId ?? "")?.project === project));
  const grid = calendarLayout(intervals, from, to, snapshot.at, fullDay);
  const totals = calendarTotals(intervals, from, to, snapshot.at);
  const selected = currentData ? intervals.find((value) => value.id === selectedId) : null;
  const move = (amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount * (mode === "week" ? 7 : 1)); setDate(next); };
  const filterCount = Number(!!provider) + Number(!!workspace) + Number(!!project);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date().toDateString();
  const clockChange = grid.days.some((day) => day.hours !== 24);
  const rangeLabel = mode === "day" ? new Date(from).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" }) : `${new Date(from).toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${new Date(to - 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1, backgroundColor: t.c.surface0 }}>
    <ScrollView contentContainerStyle={{ padding: compact ? 12 : 20, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 180, gap: 3 }}><Text accessibilityRole="header" style={t.text.title}>Agent work calendar</Text><Text style={t.text.meta}>{timezone} · observed agent runtime, not human work hours</Text></View>
        <Button t={t} size="sm" variant="ghost" label={filtersOpen ? "Hide calendar filters" : `Filters${filterCount ? ` (${filterCount})` : ""}`} onPress={() => setFiltersOpen(!filtersOpen)} />
        <IconButton t={t} icon="RefreshCw" label="Refresh calendar" disabled={loading} onPress={() => setRefresh((value) => value + 1)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <IconButton t={t} icon="ChevronLeft" label="Previous" onPress={() => move(-1)} /><IconButton t={t} icon="ChevronRight" label="Next" onPress={() => move(1)} />
        <Button t={t} size="sm" variant="secondary" label="Today" onPress={() => setDate(new Date())} />
        <Text style={[t.text.heading, { flex: 1, minWidth: 160 }]}>{rangeLabel}</Text>
        <Segmented<"day" | "week"> t={t} label="Calendar range" value={mode} onChange={setChoice} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} />
      </View>
      {filtersOpen ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 10, backgroundColor: t.c.surface1, borderRadius: t.radius.row }}>
        <Select t={t} label="Calendar provider" value={provider} onChange={setProvider} options={[{ value: "", label: "All providers" }, ...[...new Set(currentData?.intervals.map((value) => value.provider) ?? [])].map((value) => ({ value, label: value }))]} />
        <Select t={t} label="Calendar project" value={project} onChange={setProject} options={[{ value: "", label: "All projects" }, ...[...new Set([...workspaces.values()].map((value) => value.project).filter(Boolean))].map((value) => ({ value, label: value }))]} />
        <Select t={t} label="Calendar workspace" value={workspace} onChange={setWorkspace} options={[{ value: "", label: "All workspaces" }, ...[...new Set(currentData?.intervals.map((value) => value.workspaceId).filter((value): value is string => !!value) ?? [])].map((value) => ({ value, label: workspaces.get(value)?.name ?? value }))]} />
        {filterCount ? <Button t={t} size="sm" variant="ghost" label="Clear calendar filters" onPress={() => { setProvider(""); setWorkspace(""); setProject(""); }} /> : null}
      </View> : null}
      {error ? <View style={{ gap: 6 }}><Text accessibilityRole="alert" style={t.text.danger}>{error}</Text><Button t={t} size="sm" label="Retry calendar" onPress={() => setRefresh((value) => value + 1)} /></View> : null}
      {loading ? <Text accessibilityLiveRegion="polite" style={t.text.meta}>Loading calendar…</Text> : null}
      {currentData ? <>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Text style={[t.text.body, { flex: 1, minWidth: 180 }]}>{durationText(totals.agentMs)} summed agent time · {durationText(totals.elapsedMs)} elapsed coverage</Text>
          <Button t={t} size="sm" variant="ghost" label={coverage ? "Hide calendar coverage" : "Show calendar coverage"} onPress={() => setCoverage(!coverage)} />
          <Button t={t} size="sm" variant="ghost" label={fullDay ? "Focus working hours" : "Show all hours"} onPress={() => setFullDay(!fullDay)} />
        </View>
        <Text style={t.text.meta}>Last refreshed {clock(snapshot.at)} · snapshot, not a live clock · No historical backfill</Text>
        {coverage ? <Text style={t.text.meta}>Recording since {new Date(currentData.recordingSince).toLocaleString()}. Up to 90 days / 20,000 observations; {currentData.pruned} older records removed. {intervals.filter((value) => value.uncertain).length} uncertain observations excluded from totals. Parallel agents count separately; elapsed coverage merges overlaps. Observation gaps may be missing. Small event blocks have a minimum hit size, not extra runtime. On clock-change days, columns use elapsed hours and show local clock labels, including repeated hours.</Text> : null}
        {selected ? <View ref={detailRef} focusable accessibilityLabel={`Details for ${selected.title}`} testID="calendar-event-details" style={{ padding: 12, gap: 6, backgroundColor: t.c.surface1, borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.row }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text accessibilityRole="header" selectable style={[t.text.heading, { flex: 1 }]}>{selected.title}</Text><IconButton t={t} icon="X" label="Close event details" onPress={closeDetails} /></View>
          <Text style={t.text.body}>{workspaces.get(selected.workspaceId ?? "")?.project ?? "Unknown / removed project"} · {workspaces.get(selected.workspaceId ?? "")?.name ?? "Unknown / removed workspace"} · {selected.provider}</Text>
          <Text selectable style={t.text.meta}>{new Date(selected.startAt).toString()} → {new Date(selected.endAt ?? snapshot.at).toString()}</Text>
          <Text style={t.text.body}>{selected.outcome}{selected.endAt === null ? " at last refresh" : ""} · {selected.uncertain ? "Uncertain observation · not counted" : durationText(Math.max(0, Math.min(selected.endAt ?? snapshot.at, snapshot.at) - selected.startAt))}</Text>
          {openChat ? <View style={{ alignSelf: "flex-start" }}><Button t={t} size="sm" variant="secondary" label={`Open ${selected.title}`} onPress={() => openChat(selected.agentId)} /></View> : null}
        </View> : null}
        {!intervals.length ? <Text style={t.text.meta}>{currentData.intervals.length ? "No intervals match these filters." : to <= currentData.recordingSince ? "This range is before recording began. No historical backfill is available." : "No recorded work in this range. Work while recording was inactive may be missing."}</Text> : null}
        <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }} style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.row }}>
          <View testID="calendar-time-grid" style={{ flex: 1, minWidth: mode === "week" ? 900 : Math.max(260, (width || 360) - 44) }}>
            <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
              <View style={{ width: 48 }} />
              {grid.days.map((day) => <View key={day.from} style={{ flex: 1, minWidth: 115, padding: 8, gap: 2, borderLeftWidth: 1, borderColor: t.c.border }}><Text accessibilityRole="header" style={[t.text.meta, new Date(day.from).toDateString() === today ? { color: t.c.accent } : null]}>{new Date(day.from).toLocaleDateString(undefined, { weekday: "short" })}</Text><Text style={t.text.heading}>{new Date(day.from).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text></View>)}
            </View>
            <View style={{ flexDirection: "row", height: grid.height + 16 }}>
              <View style={{ width: 48, backgroundColor: t.c.surface1 }}>{Array.from({ length: Math.ceil(grid.endHour - grid.startHour) }, (_, index) => <Text key={index} style={[t.text.meta, { position: "absolute", top: index * HOUR_HEIGHT + 4, left: 6, fontSize: 10 }]}>{clockChange ? `+${grid.startHour + index}h` : clock(from + (grid.startHour + index) * 3600000)}</Text>)}</View>
              {grid.days.map((day) => {
                const lanes = Math.max(1, ...day.blocks.map((block) => block.lanes));
                return <ScrollView key={day.from} horizontal style={{ flex: 1, minWidth: 115, borderLeftWidth: 1, borderColor: t.c.border }} contentContainerStyle={{ flexGrow: 1 }}>
                  <View style={{ flex: 1, minWidth: Math.max(115, lanes * 90), height: grid.height + 16, backgroundColor: t.c.surface0 }}>
                    {Array.from({ length: Math.ceil(grid.endHour - grid.startHour) }, (_, index) => {
                      const elapsedHour = grid.startHour + index;
                      return <View key={index} style={{ position: "absolute", left: 0, right: 0, top: index * HOUR_HEIGHT, height: HOUR_HEIGHT, borderTopWidth: 1, borderColor: t.c.border, backgroundColor: elapsedHour >= day.hours ? t.c.surface1 : "transparent" }}>{clockChange ? <Text style={[t.text.meta, { fontSize: 9, paddingLeft: 4, paddingTop: 2 }]}>{elapsedHour < day.hours ? clock(day.from + elapsedHour * 3600000) : ""}</Text> : null}</View>;
                    })}
                    {day.blocks.map((block) => {
                      const color = block.interval.uncertain ? t.c.foregroundMuted : block.interval.outcome === "failed" ? t.c.statusDanger : block.interval.outcome === "running" ? t.c.accent : t.c.foreground;
                      const eventKey = `${day.from}:${block.interval.id}`;
                      return <Pressable key={block.interval.id} ref={(node) => { if (node) eventRefs.current.set(eventKey, node); else eventRefs.current.delete(eventKey); }} testID={`calendar-event-${block.interval.id}`} accessibilityRole="button" accessibilityLabel={`${block.interval.title}, ${clock(block.start)} to ${clock(block.end)}, ${block.interval.uncertain ? "uncertain, not counted" : durationText(block.end - block.start)}, ${block.interval.outcome}`} accessibilityState={{ selected: selectedId === block.interval.id }} onPress={() => { origin.current = eventKey; setSelectedId(block.interval.id); }} style={{ position: "absolute", left: `${block.lane / block.lanes * 100}%`, width: `${100 / block.lanes}%`, top: Math.min(grid.height - block.height + 12, block.top - grid.startHour * HOUR_HEIGHT) + 4, height: block.height, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: selectedId === block.interval.id ? t.c.surface2 : t.c.surface1, borderWidth: 1, borderColor: selectedId === block.interval.id ? t.c.accent : t.c.border, borderRadius: 4, overflow: "hidden" }}>
                        <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: "600" }}>{block.interval.title}</Text>
                        {block.height >= 45 ? <Text numberOfLines={1} style={[t.text.meta, { fontSize: 10 }]}>{clock(block.start)} · {block.interval.provider}</Text> : null}
                        {block.height >= 64 ? <Text numberOfLines={1} style={[t.text.meta, { fontSize: 10 }]}>{block.interval.uncertain ? "Uncertain" : durationText(block.end - block.start)}</Text> : null}
                      </Pressable>;
                    })}
                  </View>
                </ScrollView>;
              })}
            </View>
          </View>
        </ScrollView>
      </> : null}
    </ScrollView>
  </View>;
}

export function WorkCalendar(props: Parameters<typeof CalendarBody>[0]) { return <PopoverHost><CalendarBody {...props} /></PopoverHost>; }
