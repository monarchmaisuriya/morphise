import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { calendarRead } from "../shared/work-calendar";
import { runtimePoints, workspaceRuntime } from "../shared/sidebar-runtime";
import { durationText } from "../shared/calendar-layout";
import { useTooltip } from "./web";
import type { Tokens } from "./ui/kit";

export type SidebarRuntime = { status: "loading" | "failed"; error?: string } | { status: "ready"; hostId: string; at: number; recordingSince: number; pruned: number; workspaces: ReturnType<typeof workspaceRuntime> };

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

const ZERO = Array<number>(24).fill(0);
export function RuntimeStrip({ value, hostId, workspaceId, t }: { value: SidebarRuntime; hostId: string; workspaceId: string; t: Tokens }) {
  const observed = value.status === "ready" && value.hostId === hostId ? value.workspaces.get(workspaceId) : null;
  const partial = value.status === "ready" && (value.recordingSince > value.at - 86400000 || value.pruned > 0 || observed?.uncertain);
  const available = value.status === "ready" && value.hostId === hostId && !(partial && !observed?.total);
  const label = !available ? `24-hour agent runtime unavailable${value.status === "failed" ? `: ${value.error}` : partial ? ": incomplete coverage with no confirmed runtime" : " on this host or while loading"}` : `Last 24 hours: ${durationText(observed?.total ?? 0)} summed recorded agent runtime; ${partial ? "partial coverage; observation gaps may exist" : "observation gaps may exist"}; hourly shape normalized per workspace; refreshed ${new Date(value.at).toLocaleTimeString()}`;
  const tooltip = useTooltip(label, t.c);
  const points = useMemo(() => runtimePoints(observed?.bins ?? ZERO), [observed?.bins]);
  return <View ref={tooltip} testID={`workspace-runtime-${hostId}-${workspaceId}`} accessibilityLabel={label} style={{ width: 66, height: 18, marginTop: 2 }}>
    {!available ? <Text style={[t.text.meta, { fontSize: 10, textAlign: "right" }]}>—</Text> : points.slice(1).map((point, index) => {
      const previous = points[index]!, dx = point.x - previous.x, dy = point.y - previous.y;
      return <View key={index} style={{ position: "absolute", left: (point.x + previous.x) / 2 - Math.hypot(dx, dy) / 2, top: (point.y + previous.y) / 2, width: Math.hypot(dx, dy), height: 1.5, borderRadius: 1, backgroundColor: t.c.accent, opacity: partial ? 0.6 : 0.85, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
    })}
  </View>;
}
