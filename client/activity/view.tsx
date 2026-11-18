// The Workbench's Activity tab: how agents were used, counted from their own logs on the daemon (`morphise.activity.
// summary`): KPI tiles with the change on the week before, a daily heatmap, agent creations, the last 168 hours,
// provider and project rankings, insights, the top skills, MCP tools and models, and a workspace's open terminals.
// Sections and metrics after Activity by koinzhang (koinzhang/paseo-plugins, activity/, MIT, see NOTICE.md):
// client/global-surface.tsx, client/ranking-bars.tsx and client/workspace/terminals-section.tsx at 83a1c90.
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ACTIVITY_METRICS, type ActivityMetric, type ActivitySummary, activitySummary } from "../../shared/activity";
import { BLUE, PURPLE, tileColor, withAlpha } from "../ui/hues";
import { WorkspacePicker } from "../board/workspace-picker";
import type { ValueStore } from "../profile-store";
import { Button, Card, Icon, IconButton, PopoverHost, Segmented, Select, STAT_ROW_GAP, StatTile, type Tokens, useTokens } from "../ui/kit";
import type { WorkspaceList } from "../workspaces";
import { Terminals } from "./terminals";
import { fontSize, radius } from "../../shared/design/tokens";

const INDEXING_POLL_MS = 3000;
const POLL_MS = 15_000;
const WIDE = 900;
const METRIC_LABELS: Record<ActivityMetric, string> = { sessions: "Sessions", prompts: "Prompts", skills: "Skills", mcp: "MCP" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ALL = "all";

// `stale`: why the last refresh failed, while the summary before it stays on screen.
type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; summary: ActivitySummary; stale: string | null };

// The summary for the filters, asked for again every 3 s while the daemon is still indexing, then every 15 s.
function useActivity(client: PluginClientContext, provider: string | null, workspaceId: string | null, attempt: number): Load {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      client
        .rpc(activitySummary, { provider, workspaceId, tzOffsetMinutes: -new Date().getTimezoneOffset() })
        .then(
          (summary) => {
            if (!alive) return;
            setLoad({ status: "ready", summary, stale: null });
            const indexing = summary.indexing.done + summary.indexing.errors < summary.indexing.total;
            timer = setTimeout(ask, indexing ? INDEXING_POLL_MS : POLL_MS);
          },
          (error: unknown) => {
            if (!alive) return;
            const reason = error instanceof Error ? error.message : String(error);
            setLoad((current) => (current.status === "ready" ? { ...current, stale: reason } : { status: "error", error: reason }));
            timer = setTimeout(ask, POLL_MS);
          },
        );
    };
    ask();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client, provider, workspaceId, attempt]);
  return load;
}

const localParts = (utcMs: number) => new Date(utcMs - new Date(utcMs).getTimezoneOffset() * 60_000);
const hourLabel = (utcMs: number) => {
  const local = localParts(utcMs);
  return `${WEEKDAYS[local.getUTCDay()]} ${String(local.getUTCHours()).padStart(2, "0")}:00`;
};
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

function MetricPicker({ t, value, onChange, label }: { t: Tokens; value: ActivityMetric; onChange(value: ActivityMetric): void; label: string }) {
  return <Segmented t={t} label={label} value={value} onChange={onChange} options={ACTIVITY_METRICS.map((metric) => ({ value: metric, label: METRIC_LABELS[metric] }))} />;
}

// A 14-day trend as small bars, today last.
function MiniBars({ t, values, color }: { t: Tokens; values: readonly number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <View accessibilityLabel={`Last 14 days: ${values.join(", ")}`} style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 28 }}>
      {values.map((value, index) => (
        <View key={index} style={{ flex: 1, height: Math.max(2, (value / max) * 28), borderRadius: radius.sm, backgroundColor: value ? (index === values.length - 1 ? color : withAlpha(color, 0.55) ?? color) : t.c.surface2 }} />
      ))}
    </View>
  );
}

function Kpis({ t, summary }: { t: Tokens; summary: ActivitySummary }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: STAT_ROW_GAP }}>
      {summary.kpis.map((kpi) => {
        const tone = kpi.change === null || kpi.change === 0 ? t.c.foregroundMuted : kpi.change > 0 ? t.c.statusSuccess : t.c.statusDanger;
        const badge =
          kpi.change !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: withAlpha(tone, 0.14) ?? t.c.surface2 }}>
              <Icon name={kpi.change > 0 ? "TrendingUp" : kpi.change < 0 ? "TrendingDown" : "Minus"} size={11} color={tone} />
              <Text style={[t.text.small, { color: tone, fontVariant: ["tabular-nums"] }]}>{`${kpi.change > 0 ? "+" : ""}${kpi.change}%`}</Text>
            </View>
          ) : null;
        return (
          <StatTile
            key={kpi.label}
            t={t}
            label={kpi.label}
            value={kpi.value}
            badge={badge}
            footer={
              <Text style={t.text.small} numberOfLines={1}>
                {kpi.trend ? "Last 14 days" : kpi.detail ? `${kpi.detail} of the last 7 days` : ""}
                {kpi.change !== null ? " · vs the week before" : ""}
              </Text>
            }
          >
            {kpi.trend ? <MiniBars t={t} values={kpi.trend} color={BLUE} /> : null}
          </StatTile>
        );
      })}
    </View>
  );
}

const HEAT_LEVELS = [0.22, 0.45, 0.7, 1];

// 52 weeks as columns of 7 days, Sunday on top, sized to the card's width; four strengths of one hue by the day's share
// of the busiest day, with a legend.
function Heatmap({ t, summary }: { t: Tokens; summary: ActivitySummary }) {
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const { cells, firstDay } = summary.heatmap;
  const max = Math.max(1, ...cells);
  const start = dayDate(firstDay).getTime();
  const weeks = Math.ceil(cells.length / 7);
  const gap = 3;
  // Wide enough for "Wed" at 12px on one line.
  const labelColumn = 32;
  const cell = width ? Math.max(9, Math.min(16, Math.floor((width - labelColumn - gap * weeks) / weeks))) : 11;
  const shade = (value: number) => {
    if (value <= 0) return t.c.surface2;
    const level = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(value / max) * 4)));
    return withAlpha(BLUE, HEAT_LEVELS[level - 1]) ?? BLUE;
  };
  const months = Array.from({ length: weeks }, (_, week) => {
    const date = new Date(start + week * 7 * 86_400_000);
    // The first column is usually mid-month; its label would be cut off by the next one.
    return week > 0 && date.getUTCDate() <= 7 ? MONTHS[date.getUTCMonth()] : "";
  });
  const activeDays = cells.filter((value) => value > 0).length;
  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View style={{ flexDirection: "row", gap }}>
          <View style={{ width: labelColumn - gap, gap, paddingTop: 16 }}>
            {WEEKDAYS.map((name, index) => (
              <Text key={name} style={[t.text.small, { height: cell, lineHeight: cell, fontSize: fontSize.sm }]}>
                {index % 2 ? name : ""}
              </Text>
            ))}
          </View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", gap, height: 12 }}>
              {months.map((month, week) => (
                <Text key={week} style={[t.text.small, { width: cell, overflow: "visible", fontSize: fontSize.sm }]} numberOfLines={1}>
                  {month}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap }}>
              {Array.from({ length: weeks }, (_, week) => (
                <View key={week} style={{ gap }}>
                  {Array.from({ length: 7 }, (_, weekday) => {
                    const index = week * 7 + weekday;
                    if (index >= cells.length) return <View key={weekday} style={{ width: cell, height: cell }} />;
                    const day = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
                    return <View key={weekday} accessibilityLabel={`${day}: ${cells[index]}`} style={{ width: cell, height: cell, borderRadius: radius.base, backgroundColor: shade(cells[index]) }} />;
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={[t.text.small, { flex: 1 }]}>{`${activeDays} active ${activeDays === 1 ? "day" : "days"} in the last year`}</Text>
        <Text style={t.text.small}>Less</Text>
        {[0, ...HEAT_LEVELS].map((level, index) => (
          <View key={index} style={{ width: 10, height: 10, borderRadius: radius.sm, backgroundColor: level ? withAlpha(BLUE, level) ?? BLUE : t.c.surface2 }} />
        ))}
        <Text style={t.text.small}>More</Text>
      </View>
    </View>
  );
}

function Legend({ t, keys }: { t: Tokens; keys: readonly string[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {keys.map((key) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: radius.sm, backgroundColor: tileColor(key) }} />
          <Text style={t.text.small}>{key}</Text>
        </View>
      ))}
    </View>
  );
}

// Agents created per day over 30 days, stacked by provider.
function Creations({ t, summary }: { t: Tokens; summary: ActivitySummary }) {
  const providers = [...new Set(summary.creations.flatMap((day) => Object.keys(day.byProvider)))].sort();
  const max = Math.max(1, ...summary.creations.map((day) => Object.values(day.byProvider).reduce((a, b) => a + b, 0)));
  const height = 90;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height }}>
        {summary.creations.map((day) => {
          const total = Object.values(day.byProvider).reduce((a, b) => a + b, 0);
          return (
            <View key={day.day} accessibilityLabel={`${day.day}: ${total} created`} style={{ flex: 1, height: Math.max(2, (total / max) * height), justifyContent: "flex-end", borderRadius: radius.sm, overflow: "hidden", backgroundColor: total ? undefined : t.c.surface2 }}>
              {providers.map((provider) => (day.byProvider[provider] ? <View key={provider} style={{ height: `${(day.byProvider[provider] / total) * 100}%`, backgroundColor: tileColor(provider) }} /> : null))}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={t.text.small}>{summary.creations[0]?.day.slice(5)}</Text>
        <Text style={t.text.small}>Today</Text>
      </View>
      {providers.length ? <Legend t={t} keys={providers} /> : <Text style={t.text.small}>No agents created in the last 30 days.</Text>}
    </View>
  );
}

// The last 168 hours as bars of one metric; pressing a bar shows all four for that hour.
function Hours({ t, summary }: { t: Tokens; summary: ActivitySummary }) {
  const [metric, setMetric] = useState<ActivityMetric>("prompts");
  const [picked, setPicked] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const max = Math.max(1, ...summary.hourly.map((hour) => hour.values[metric]));
  const last = summary.hourly.length - 1;
  const shown = summary.hourly[picked ?? last];
  const height = 80;
  return (
    <View style={{ gap: 8 }}>
      <MetricPicker t={t} value={metric} onChange={setMetric} label="Metric for the last 168 hours" />
      {shown ? (
        // The bars are 4px wide, too narrow to tap on a phone, so the hour can also be stepped with these buttons.
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={[t.text.meta, { flex: 1, fontVariant: ["tabular-nums"] }]} numberOfLines={1}>
            {`${hourLabel(shown.hour)}: ${shown.values.sessions} sessions · ${shown.values.prompts} prompts · ${shown.values.skills} skills · ${shown.values.mcp} MCP`}
          </Text>
          <IconButton t={t} size="sm" icon="ChevronLeft" label="Earlier hour" disabled={(picked ?? last) === 0} onPress={() => setPicked(Math.max(0, (picked ?? last) - 1))} />
          <IconButton t={t} size="sm" icon="ChevronRight" label="Later hour" disabled={(picked ?? last) === last} onPress={() => setPicked(Math.min(last, (picked ?? last) + 1))} />
        </View>
      ) : null}
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 1, height }}>
            {summary.hourly.map((hour, index) => (
              <Pressable key={hour.hour} accessibilityRole="button" accessibilityLabel={`${hourLabel(hour.hour)}: ${hour.values[metric]} ${METRIC_LABELS[metric].toLowerCase()}`} onPress={() => setPicked(index)} style={{ width: 4, height, justifyContent: "flex-end" }}>
                <View style={{ height: Math.max(1, (hour.values[metric] / max) * height), borderRadius: radius.sm, backgroundColor: index === (picked ?? summary.hourly.length - 1) ? t.c.foreground : hour.values[metric] ? t.c.accent : t.c.surface2 }} />
              </Pressable>
            ))}
          </View>
          {/* Day names at each local midnight, placed over the bars' row so they are not cut to the bar's width. */}
          <View style={{ height: 14 }}>
            {summary.hourly.map((hour, index) => {
              const local = localParts(hour.hour);
              return local.getUTCHours() === 0 ? (
                <Text key={hour.hour} style={[t.text.small, { position: "absolute", left: index * 5, width: 40 }]} numberOfLines={1}>
                  {WEEKDAYS[local.getUTCDay()]}
                </Text>
              ) : null;
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const SHOWN_ROWS = 5;

// One ranked row: name, value with its share of the whole, and a bar against the largest.
function RankRow({ t, rank, label, value, share, max, color, detail }: { t: Tokens; rank?: number; label: string; value: number; share: number; max: number; color: string; detail?: string | null }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {rank !== undefined ? <Text style={[t.text.small, { width: 16, textAlign: "right", fontVariant: ["tabular-nums"] }]}>{rank}</Text> : null}
        <Text style={[t.text.body, { flex: 1 }]} numberOfLines={1} ellipsizeMode="middle">
          {label}
        </Text>
        {detail ? <Text style={[t.text.small, { color: t.c.statusDanger }]}>{detail}</Text> : null}
        <Text style={[t.text.small, { fontVariant: ["tabular-nums"] }]}>{`${Math.round(share * 100)}%`}</Text>
        <Text style={[t.text.body, { minWidth: 36, textAlign: "right", fontWeight: "600", fontVariant: ["tabular-nums"] }]}>{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.surface2, overflow: "hidden", marginLeft: rank !== undefined ? 24 : 0 }}>
        <View style={{ width: `${(value / max) * 100}%`, minWidth: 3, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

function Ranking({ t, title, icon, rows, side }: { t: Tokens; title: string; icon: string; rows: ActivitySummary["rankings"]["providers"]; side: boolean }) {
  const [metric, setMetric] = useState<ActivityMetric>("sessions");
  const [all, setAll] = useState(false);
  const sorted = rows.filter((row) => row.values[metric] > 0).sort((a, b) => b.values[metric] - a.values[metric] || a.label.localeCompare(b.label));
  const max = Math.max(1, ...sorted.map((row) => row.values[metric]));
  const total = sorted.reduce((sum, row) => sum + row.values[metric], 0) || 1;
  return (
    <Card t={t} title={title} icon={icon} side={side}>
      <MetricPicker t={t} value={metric} onChange={setMetric} label={`Metric for ${title}`} />
      {sorted.length ? null : <Text style={t.text.small}>Nothing counted yet.</Text>}
      {(all ? sorted : sorted.slice(0, SHOWN_ROWS)).map((row) => (
        <RankRow key={row.key} t={t} label={row.label} value={row.values[metric]} share={row.values[metric] / total} max={max} color={BLUE} />
      ))}
      {sorted.length > SHOWN_ROWS ? <Button t={t} variant="ghost" label={all ? "Show less" : `Show ${sorted.length - SHOWN_ROWS} more`} onPress={() => setAll(!all)} /> : null}
    </Card>
  );
}

const INSIGHT_ICONS: Record<string, string> = {
  "Active days": "CalendarCheck",
  "Busiest day": "Flame",
  "Longest streak": "Zap",
  "Peak weekday": "CalendarDays",
  Workspaces: "FolderGit2",
  "Coding share": "Code",
  "Multi-turn share": "MessagesSquare",
  "Average session": "Timer",
  "Peak hour": "Clock",
  "Current streak": "TrendingUp",
  "Prompts per active day": "MessageSquare",
  "Longest session": "Hourglass",
  "Commands run": "SquareTerminal",
  "Files edited": "FilePen",
  "Files read": "FileSearch",
  "MCP failure rate": "PlugZap",
  "Tools tried": "Wrench",
  "Models used": "Brain",
};

function Insights({ t, summary, side }: { t: Tokens; summary: ActivitySummary; side: boolean }) {
  return (
    <Card t={t} title="Insights" icon="Lightbulb" side={side}>
      {/* When the card is stretched to its column's height, the tile rows share the extra height. */}
      <View style={{ flexGrow: 1, flexDirection: "row", flexWrap: "wrap", alignContent: "stretch", gap: 8 }}>
        {summary.insights.map((row) => (
          <View key={row.label} style={{ flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.lg, backgroundColor: t.c.surface1 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(BLUE, 0.16) ?? t.c.surface2 }}>
              <Icon name={INSIGHT_ICONS[row.label] ?? "Sparkles"} size={15} color={BLUE} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={t.text.small} numberOfLines={1}>
                {row.label}
              </Text>
              <Text style={{ color: t.c.foreground, fontSize: fontSize.content, fontWeight: "600", fontVariant: ["tabular-nums"] }} numberOfLines={1}>
                {row.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function TopLists({ t, summary, side }: { t: Tokens; summary: ActivitySummary; side: boolean }) {
  const [kind, setKind] = useState<"skills" | "mcp" | "models">("skills");
  const rows = summary.top[kind];
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  return (
    <Card t={t} title="Most used" icon="ListOrdered" side={side}>
      <Segmented<"skills" | "mcp" | "models"> t={t} label="Show skills, MCP tools or models" value={kind} onChange={setKind} options={[{ value: "skills", label: "Skills" }, { value: "mcp", label: "MCP tools" }, { value: "models", label: "Models" }]} />
      {rows.length ? null : <Text style={t.text.small}>{kind === "skills" ? "No skills used yet." : kind === "mcp" ? "No MCP tools used yet." : "No prompts counted yet."}</Text>}
      {/* When the card is stretched to its column's height, the rows spread over it. */}
      <View style={{ flexGrow: 1, justifyContent: "space-between", gap: 12 }}>
        {rows.map((row, index) => (
          <RankRow key={row.name} t={t} rank={index + 1} label={row.name} value={row.count} share={row.count / total} max={max} color={PURPLE} detail={row.detail && row.detail !== "prompts" ? row.detail : null} />
        ))}
      </View>
    </Card>
  );
}

export function ActivityView({ client, theme, compact, workspaces }: { client: PluginClientContext; theme: PluginTheme; compact: boolean; workspaces: ValueStore<WorkspaceList> }) {
  const t = useTokens(theme, compact);
  const [provider, setProvider] = useState<string>(ALL);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const load = useActivity(client, provider === ALL ? null : provider, workspaceId, attempt);
  const summary = load.status === "ready" ? load.summary : null;
  const providerOptions = [{ value: ALL, label: "All providers", icon: "Cpu" }, ...(summary?.providers ?? (provider === ALL ? [] : [provider])).map((name) => ({ value: name, label: name, icon: "Cpu" }))];
  const wide = width >= WIDE;
  const indexing = summary ? summary.indexing.done + summary.indexing.errors < summary.indexing.total : false;

  return (
    <PopoverHost>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.inset, gap: 12 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {/* Both filters size to their content, side by side; the indexing note sits at the far end. */}
          <View>
            <Select t={t} label="Provider" value={provider} options={providerOptions} onChange={setProvider} />
          </View>
          <View style={{ maxWidth: compact ? "100%" : 360 }}>
            <WorkspacePicker t={t} workspaces={workspaces} value={workspaceId} onChange={setWorkspaceId} none={{ label: "All workspaces", icon: "Layers", choice: true }} includeClosed width={compact ? 320 : 440} />
          </View>
          <View style={{ flex: 1 }} />
          {load.status === "ready" && load.stale ? (
            <Text style={t.text.danger} numberOfLines={2}>
              Could not refresh: {load.stale}
            </Text>
          ) : null}
          {summary && (indexing || summary.indexing.errors) ? (
            <Text style={t.text.meta}>
              {indexing ? `Indexing ${summary.indexing.done} of ${summary.indexing.total} chats` : ""}
              {summary.indexing.errors ? `${indexing ? " · " : ""}${summary.indexing.errors} unreadable` : ""}
            </Text>
          ) : null}
        </View>
        {load.status === "loading" ? <Text style={t.text.meta}>Reading activity…</Text> : null}
        {load.status === "error" ? (
          <View style={{ gap: 8, alignItems: "flex-start" }}>
            <Text style={t.text.danger}>Activity could not be read: {load.error}</Text>
            <Button t={t} variant="ghost" icon="RotateCcw" label="Try again" onPress={() => setAttempt((count) => count + 1)} />
          </View>
        ) : null}
        {summary ? (
          summary.kpis[0].value === "0" && summary.rankings.providers.length === 0 ? (
            <Text style={t.text.meta}>No activity yet. Activity counts Claude Code and Codex chats from their own logs.</Text>
          ) : (
            <>
              <Kpis t={t} summary={summary} />
              <Card t={t} title="Daily activity" icon="CalendarDays" right={<Text style={t.text.small}>prompts, skills, MCP and new agents per day</Text>}>
                <Heatmap t={t} summary={summary} />
              </Card>
              <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
                <Card t={t} title="Agents created" icon="Bot" side={wide} right={<Text style={t.text.small}>last 30 days</Text>}>
                  <Creations t={t} summary={summary} />
                </Card>
                <Card t={t} title="Last 168 hours" icon="Clock" side={wide}>
                  <Hours t={t} summary={summary} />
                </Card>
              </View>
              {wide ? (
                // Two columns that stack on their own and end level: the taller column sets the height, and the other's
                // last card grows to meet it, spreading its own rows or tiles rather than leaving empty space.
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
                    <Ranking t={t} title="Providers" icon="Cpu" rows={summary.rankings.providers} side={false} />
                    <Insights t={t} summary={summary} side />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
                    <Ranking t={t} title="Projects" icon="Folder" rows={summary.rankings.projects} side={false} />
                    <TopLists t={t} summary={summary} side />
                  </View>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <Ranking t={t} title="Providers" icon="Cpu" rows={summary.rankings.providers} side={false} />
                  <Ranking t={t} title="Projects" icon="Folder" rows={summary.rankings.projects} side={false} />
                  <Insights t={t} summary={summary} side={false} />
                  <TopLists t={t} summary={summary} side={false} />
                </View>
              )}
            </>
          )
        ) : null}
        {workspaceId ? <Terminals client={client} t={t} workspaceId={workspaceId} /> : null}
        <Text style={t.text.small}>Counted from Claude Code and Codex logs on the daemon's computer. Other providers' chats count as sessions only. Tool calls inside sub-agents are not counted.</Text>
      </ScrollView>
    </PopoverHost>
  );
}
