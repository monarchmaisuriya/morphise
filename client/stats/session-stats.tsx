// Session stats in the app: one Stats button in each workspace's top bar (beside the reminder button) whose popover
// shows the open chat's readings, a Stats panel, and the rows the Agents details pane shows. Readings come from the
// daemon (`morphise.stats.read`), which reads the chat's own log; they refresh every 2 s while something on screen
// shows them. After Harness Stats by kogekiplay (MIT, see NOTICE.md).
import { type AgentRef, type PluginAgentPanelProps, type PluginButtonContentProps, type PluginButtonIconProps, type PluginButtonRegistration, type PluginClientContext, useAgent, useAgents } from "@getpaseo/plugin/client";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { cacheHitShare, outputSpeed, type StatsReadResult, statsRead, timeToFirstToken, totalTokens, type TurnReading } from "../../shared/stats";
import type { ChatTools } from "../../shared/activity";
import { chatName } from "../../shared/chat-status";
import { activityRows, cacheHitTone, formatDuration, formatShare, formatSpeed, formatTokens, headerLabel, paceLine, rankedUses, timeLine, timeSplit, tokenParts, toolsRows, topTokenParts, turnRows, usageRows } from "../../shared/stats-format";
import { BLUE, PURPLE, withAlpha } from "../ui/hues";
import { formatElapsed } from "../../shared/time-text";
import { type Chats, chatForWorkspace } from "../chats";
import { createValueStore, type ValueStore, useValue } from "../profile-store";
import { createStatsCache } from "./cache";
import { Button, Card, Icon, STAT_ROW_GAP, StatTile, Tag, type Tokens, useTokens } from "../ui/kit";

export const STATS_PANEL_ID = "stats";
const REFRESH_MS = 2000;

export type StatsReader = (agentId: string, turns?: boolean) => Promise<StatsReadResult>;

// One reader, with one cache, per app connection, shared by the pills, the panel and the details pane.
const readers = new WeakMap<PluginClientContext, StatsReader>();
export function statsReader(client: PluginClientContext): StatsReader {
  let read = readers.get(client);
  if (!read) readers.set(client, (read = createStatsCache((agentId, turns) => client.rpc(statsRead, turns ? { agentId, turns } : { agentId })).read));
  return read;
}

// The latest reading for a chat, refreshed every 2 s (or `every` ms) while mounted; `turns` adds the per-turn numbers.
export function useSessionStats(read: StatsReader, agentId: string | null, { every = REFRESH_MS, turns = false }: { every?: number; turns?: boolean } = {}): StatsReadResult | null {
  const [result, setResult] = useState<StatsReadResult | null>(null);
  useEffect(() => {
    if (!agentId) return;
    let alive = true;
    const tick = () =>
      void read(agentId, turns).then(
        (next) => alive && setResult(next),
        (error: unknown) => alive && setResult({ status: "error", error: error instanceof Error ? error.message : String(error) }),
      );
    tick();
    const timer = setInterval(tick, every);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [read, agentId, every, turns]);
  return result;
}

export function StatsRows({ t, result, kinds }: { t: Tokens; result: StatsReadResult | null; kinds: readonly ("activity" | "tools" | "usage")[] }) {
  if (!result) return <Text style={t.text.small}>Reading the chat's log…</Text>;
  if (result.status === "error") return <Text style={[t.text.small, { color: t.c.statusDanger }]}>This chat's log could not be read: {result.error}</Text>;
  if (result.status === "unavailable") return <Text style={t.text.small}>{result.reason}</Text>;
  const rows = kinds.flatMap((kind) => (kind === "activity" ? activityRows(result.stats) : kind === "tools" ? toolsRows(result.tools) : usageRows(result.stats)));
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

// The chat open in Morphise's sidebar view, which knows it (top-bar buttons are told only their workspace); null when
// that view is not in use, and the stats button then shows the workspace's first open chat.
export const openChat = createValueStore<string | null>(null);

// A labelled number: small muted label, the value below; `size` "hero" for the two headline readings.
function Figure({ t, label, value, tone, size = "small", align = "left" }: { t: Tokens; label: string; value: string; tone?: string; size?: "hero" | "small"; align?: "left" | "right" }) {
  return (
    <View style={{ gap: 2, alignItems: align === "right" ? "flex-end" : "flex-start", flexShrink: 1 }}>
      <Text style={[t.text.small, { color: t.c.foregroundMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ color: tone ?? t.c.foreground, fontSize: size === "hero" ? 24 : 15, fontWeight: "600", fontVariant: ["tabular-nums"] }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// One bar split into coloured parts by share (0 to 1 each).
function StackedBar({ t, parts, height, label }: { t: Tokens; parts: readonly { share: number; color: string }[]; height: number; label: string }) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", height, borderRadius: height / 2, overflow: "hidden", backgroundColor: t.c.surface2 }}>
      {parts.map((part, index) => (part.share > 0 ? <View key={index} style={{ width: `${part.share * 100}%`, minWidth: 2, backgroundColor: part.color }} /> : null))}
    </View>
  );
}

const Divider = ({ t }: { t: Tokens }) => <View style={{ height: 1, backgroundColor: t.c.border }} />;

const USES_SHOWN = 5;
// The Stats panel puts its two cards side by side from this width.
const PANEL_WIDE = 760;

// Skills and MCP tools together, most used first: name (with "skill" for skills), a bar by count, failures, when
// last used, and the count.
// `columns`: 2 lays the rows out in two columns (the wide Stats panel).
function UseList({ t, tools, shown = USES_SHOWN, columns = 1 }: { t: Tokens; tools: ChatTools; shown?: number; columns?: 1 | 2 }) {
  const [all, setAll] = useState(false);
  const uses = rankedUses(tools);
  if (!uses.length) return <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>No skills or MCP tools used in this chat.</Text>;
  const max = Math.max(...uses.map((use) => use.count));
  const now = new Date();
  const visible = all ? uses : uses.slice(0, shown);
  const half = Math.ceil(visible.length / 2);
  const groups = columns === 2 && visible.length > 3 ? [visible.slice(0, half), visible.slice(half)] : [visible];
  const row = (use: (typeof uses)[number]) => {
    const ago = formatElapsed(new Date(use.lastAt).toISOString(), now);
    return (
      <View key={`${use.kind}:${use.name}`} accessibilityLabel={`${use.name}, ${use.kind === "skill" ? "skill" : "MCP tool"}, used ${use.count} times`} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 }}>
        <Text style={[t.text.body, { flex: 1 }]} numberOfLines={1} ellipsizeMode="middle">
          {use.name}
          {use.kind === "skill" ? <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>  skill</Text> : null}
        </Text>
        {use.failures ? <Text style={[t.text.small, { color: t.c.statusDanger }]}>{use.failures} failed</Text> : null}
        <Text style={[t.text.small, { color: t.c.foregroundMuted, fontVariant: ["tabular-nums"] }]}>{ago ? (ago === "now" ? "now" : ago) : ""}</Text>
        <View style={{ width: 56, height: 4, borderRadius: 2, backgroundColor: t.c.surface2 }}>
          <View style={{ width: `${(use.count / max) * 100}%`, minWidth: 3, height: 4, borderRadius: 2, backgroundColor: PURPLE }} />
        </View>
        <Text style={[t.text.body, { minWidth: 28, textAlign: "right", fontVariant: ["tabular-nums"] }]}>{use.count}</Text>
      </View>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 24 }}>
        {groups.map((group, index) => (
          <View key={index} style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {group.map(row)}
          </View>
        ))}
      </View>
      {uses.length > shown ? <Button t={t} variant="ghost" label={all ? "Show less" : `Show ${uses.length - shown} more`} onPress={() => setAll(!all)} /> : null}
    </View>
  );
}

// A chat's readings, summary first (after the design picked on 2026-11-17): total tokens and cache hit, a bar of where
// the tokens went, the turn numbers, model time against tool time, the tool counts, and the skills and MCP tools
// used; or why there is no reading.
// `wide` (the Stats panel with room): a dashboard of headline tiles and cards (see below).
// `children`: more cards for the panel, placed after the token and time readings and before the tools.
export function StatsTiles({ t, result, wide = false, children }: { t: Tokens; result: StatsReadResult | null; wide?: boolean; children?: ReactNode }) {
  if (!result || result.status !== "ready") return <NoReading t={t} result={result} />;
  const { stats, tools } = result;
  const hit = cacheHitShare(stats);
  const hitTone = hitColor(t, hit);
  const partColor = partColors(t);
  const parts = tokenParts(stats);
  const split = timeSplit(stats);
  const chips: [string, string, string | null][] = [
    ["Prompts", String(tools.prompts), null],
    ["Shell", String(tools.shellCalls), null],
    ["MCP", String(tools.mcpCalls), tools.mcpFailures ? `${tools.mcpFailures} failed` : null],
    ["Skills", String(tools.skillCalls), null],
    ["Reads", String(tools.fileReads), null],
    ["Writes", String(tools.fileWrites), null],
  ];
  const summary = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <Figure t={t} size="hero" label="Total tokens" value={formatTokens(totalTokens(stats))} />
        <Figure t={t} size="hero" label="Cache hit" value={formatShare(hit)} tone={hitTone} align="right" />
      </View>
      <View style={{ gap: 6 }}>
        <StackedBar t={t} height={8} label={parts.map((part) => `${part.label} ${formatTokens(part.tokens)}`).join(", ")} parts={parts.map((part) => ({ share: part.share, color: partColor[part.key] }))} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
          {parts.map((part) => (
            <View key={part.key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: partColor[part.key] }} />
              <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>{part.label}</Text>
              <Text style={[t.text.small, { color: t.c.foreground, fontVariant: ["tabular-nums"] }]}>{formatTokens(part.tokens)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
  const pace = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Figure t={t} label="Turns" value={String(stats.turns)} />
        <Figure t={t} label="Steps" value={String(stats.steps)} />
        <Figure t={t} label="First token" value={formatDuration(timeToFirstToken(stats))} />
        <Figure t={t} label="Speed" value={formatSpeed(outputSpeed(stats))} />
      </View>
      {split ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>
              <Text style={{ color: BLUE }}>●</Text> Model {formatDuration(stats.modelMs)}
            </Text>
            <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>
              <Text style={{ color: t.c.foregroundMuted }}>●</Text> Tools {formatDuration(stats.toolMs)}
            </Text>
          </View>
          <StackedBar t={t} height={6} label={`Model time ${formatDuration(stats.modelMs)}, tool time ${formatDuration(stats.toolMs)}`} parts={[{ share: split.modelShare, color: BLUE }, { share: 1 - split.modelShare, color: withAlpha(t.c.foregroundMuted, 0.45) ?? t.c.foregroundMuted }]} />
        </View>
      ) : null}
    </View>
  );
  const toolsPart = (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {chips.map(([label, value, alert]) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 24, paddingHorizontal: 8, borderRadius: 6, backgroundColor: t.c.surface1 }}>
            <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>{label}</Text>
            <Text style={[t.text.small, { color: t.c.foreground, fontWeight: "600", fontVariant: ["tabular-nums"] }]}>{value}</Text>
            {alert ? <Text style={[t.text.small, { color: t.c.statusDanger }]}>{alert}</Text> : null}
          </View>
        ))}
      </View>
      <UseList t={t} tools={tools} shown={wide ? 10 : USES_SHOWN} />
    </View>
  );
  const partial = result.partial ? <Text style={t.text.small}>Still reading a long log; the numbers grow as it goes.</Text> : null;
  if (wide) {
    // The panel as a dashboard: the headline numbers in a row, where the tokens and the time went side by side (the
    // same height), then every tool count and the skills and MCP tools used across the full width.
    const legend = (
      <View style={{ gap: 8 }}>
        {parts.map((part) => (
          <View key={part.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: partColor[part.key] }} />
            <Text style={[t.text.body, { flex: 1, color: t.c.foregroundMuted }]}>{part.label}</Text>
            <Text style={[t.text.small, { fontVariant: ["tabular-nums"] }]}>{`${Math.round(part.share * 1000) / 10}%`}</Text>
            <Text style={[t.text.body, { minWidth: 64, textAlign: "right", fontWeight: "600", fontVariant: ["tabular-nums"] }]}>{formatTokens(part.tokens)}</Text>
          </View>
        ))}
      </View>
    );
    const timeRow = (label: string, ms: number, share: number, color: string) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
        <Text style={[t.text.body, { flex: 1, color: t.c.foregroundMuted }]}>{label}</Text>
        <Text style={[t.text.small, { fontVariant: ["tabular-nums"] }]}>{`${Math.round(share * 100)}%`}</Text>
        <Text style={[t.text.body, { minWidth: 64, textAlign: "right", fontWeight: "600", fontVariant: ["tabular-nums"] }]}>{formatDuration(ms)}</Text>
      </View>
    );
    const toolColor = withAlpha(t.c.foregroundMuted, 0.45) ?? t.c.foregroundMuted;
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: STAT_ROW_GAP }}>
          <StatTile t={t} label="Total tokens" value={formatTokens(totalTokens(stats))} />
          <StatTile t={t} label="Cache hit" value={formatShare(hit)} tone={hitTone} />
          <StatTile t={t} label="Turns" value={String(stats.turns)} />
          <StatTile t={t} label="Model steps" value={String(stats.steps)} />
          <StatTile t={t} label="First token" value={formatDuration(timeToFirstToken(stats))} />
          <StatTile t={t} label="Output speed" value={formatSpeed(outputSpeed(stats))} />
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "stretch" }}>
          <Card t={t} title="Where the tokens went" icon="Database" side>
            <StackedBar t={t} height={10} label={parts.map((part) => `${part.label} ${formatTokens(part.tokens)}`).join(", ")} parts={parts.map((part) => ({ share: part.share, color: partColor[part.key] }))} />
            {legend}
          </Card>
          <Card t={t} title="Where the time went" icon="Clock" side>
            {split ? (
              <>
                <StackedBar t={t} height={10} label={`Model time ${formatDuration(stats.modelMs)}, tool time ${formatDuration(stats.toolMs)}`} parts={[{ share: split.modelShare, color: BLUE }, { share: 1 - split.modelShare, color: toolColor }]} />
                <View style={{ gap: 8 }}>
                  {timeRow("Model", stats.modelMs, split.modelShare, BLUE)}
                  {timeRow("Tools", stats.toolMs, 1 - split.modelShare, toolColor)}
                </View>
              </>
            ) : (
              <Text style={t.text.small}>No timings in this chat's log yet.</Text>
            )}
          </Card>
        </View>
        {children}
        <Card t={t} title="Tools" icon="Wrench">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {chips.map(([label, value, alert]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 6, backgroundColor: t.c.surface1 }}>
                <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>{label}</Text>
                <Text style={[t.text.small, { color: t.c.foreground, fontWeight: "600", fontVariant: ["tabular-nums"] }]}>{value}</Text>
                {alert ? <Text style={[t.text.small, { color: t.c.statusDanger }]}>{alert}</Text> : null}
              </View>
            ))}
          </View>
          <UseList t={t} tools={tools} shown={20} columns={2} />
        </Card>
        {partial}
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {summary}
      <Divider t={t} />
      {pace}
      {children}
      <Divider t={t} />
      {toolsPart}
      {partial}
    </View>
  );
}

// Why a chat has no reading yet: still reading, the log could not be read, or there is no log.
function NoReading({ t, result }: { t: Tokens; result: Exclude<StatsReadResult, { status: "ready" }> | null }) {
  if (!result) return <Text style={t.text.small}>Reading the chat's log…</Text>;
  if (result.status === "error") return <Text style={[t.text.small, { color: t.c.statusDanger }]}>This chat's log could not be read: {result.error}</Text>;
  return <Text style={t.text.small}>{result.reason}</Text>;
}

const hitColor = (t: Tokens, hit: number | null) => (hit === null ? undefined : { good: t.c.statusSuccess, fair: t.c.statusWarning, poor: t.c.statusDanger }[cacheHitTone(hit)]);
const partColors = (t: Tokens) => ({ cacheRead: t.c.statusSuccess, cacheWrite: t.c.statusWarning, output: PURPLE, newInput: t.c.foregroundMuted });

const GLANCE_TOOLS = 3;

// The popover: a glance, not the whole panel. Total tokens and cache hit, one bar with its two biggest parts named,
// the pace in a line or two, and the three most used skills and MCP tools; every other reading is in the panel.
function StatsGlance({ t, result }: { t: Tokens; result: StatsReadResult | null }) {
  if (!result || result.status !== "ready") return <NoReading t={t} result={result} />;
  const { stats, tools } = result;
  const hit = cacheHitShare(stats);
  const partColor = partColors(t);
  const parts = tokenParts(stats);
  const time = timeLine(stats);
  const uses = rankedUses(tools).slice(0, GLANCE_TOOLS);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <Figure t={t} size="hero" label="Total tokens" value={formatTokens(totalTokens(stats))} />
        <Figure t={t} size="hero" label="Cache hit" value={formatShare(hit)} tone={hitColor(t, hit)} align="right" />
      </View>
      <View style={{ gap: 6 }}>
        <StackedBar t={t} height={8} label={parts.map((part) => `${part.label} ${formatTokens(part.tokens)}`).join(", ")} parts={parts.map((part) => ({ share: part.share, color: partColor[part.key] }))} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          {topTokenParts(stats, 2).map((part) => (
            <View key={part.key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: partColor[part.key] }} />
              <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>{part.label}</Text>
              <Text style={[t.text.small, { color: t.c.foreground, fontVariant: ["tabular-nums"] }]}>{formatTokens(part.tokens)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={[t.text.small, { color: t.c.foregroundMuted, fontVariant: ["tabular-nums"] }]} numberOfLines={1}>
          {paceLine(stats)}
        </Text>
        {time ? (
          <Text style={[t.text.small, { color: t.c.foregroundMuted, fontVariant: ["tabular-nums"] }]} numberOfLines={1}>
            {time}
          </Text>
        ) : null}
      </View>
      {uses.length ? (
        <>
          <Divider t={t} />
          <View style={{ gap: 6 }}>
            <Text style={t.text.meta}>Most used</Text>
            {uses.map((use) => (
              <View key={`${use.kind}:${use.name}`} accessibilityLabel={`${use.name}, ${use.kind === "skill" ? "skill" : "MCP tool"}, used ${use.count} times`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[t.text.body, { flex: 1 }]} numberOfLines={1} ellipsizeMode="middle">
                  {use.name}
                  {use.kind === "skill" ? <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>  skill</Text> : null}
                </Text>
                {use.failures ? <Text style={[t.text.small, { color: t.c.statusDanger }]}>{use.failures} failed</Text> : null}
                <Text style={[t.text.body, { fontVariant: ["tabular-nums"] }]}>{use.count}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {result.partial ? <Text style={t.text.small}>Still reading a long log; the numbers grow as it goes.</Text> : null}
    </View>
  );
}

const TURN_ROWS = 10;
// A turn whose opening line had no timestamp has no start time (0).
const clock = (ms: number) => (ms > 0 ? new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "-");

// The Stats page's turns: one bar per turn (its tokens, split as the token bar is), the picked turn's numbers above
// (the latest until one is pressed), and a table, most recent first. Hidden without turns (or from an older daemon).
function TurnsCard({ t, turns, wide }: { t: Tokens; turns: readonly TurnReading[] | undefined; wide: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (!turns?.length) return null;
  const partColor = partColors(t);
  const rows = turnRows(turns);
  const shown = rows.find((row) => row.turn === picked) ?? rows[0];
  const max = Math.max(1, ...turns.map((turn) => totalTokens(turn)));
  const height = 96;
  const columns: [label: string, value: (row: (typeof rows)[number]) => string][] = wide
    ? [["Started", (row) => clock(row.startAt)], ["Took", (row) => row.took], ["Steps", (row) => String(row.steps)], ["Tokens", (row) => row.tokens], ["Cache hit", (row) => row.cacheHit], ["Model", (row) => row.model], ["Tools", (row) => row.tools]]
    : [["Took", (row) => row.took], ["Tokens", (row) => row.tokens], ["Cache hit", (row) => row.cacheHit]];
  const cell = [t.text.small, { flex: 1, textAlign: "right" as const, fontVariant: ["tabular-nums" as const] }];
  const visible = all ? rows : rows.slice(0, TURN_ROWS);
  return (
    <Card t={t} title={turns[0].turn > 1 ? `Turns (the last ${turns.length})` : "Turns"} icon="ListOrdered" right={<Text style={t.text.meta}>{`${turns.length} ${turns.length === 1 ? "turn" : "turns"}`}</Text>}>
      <Text style={[t.text.meta, { fontVariant: ["tabular-nums"] }]} numberOfLines={1}>
        {`Turn ${shown.turn} · started ${clock(shown.startAt)} · took ${shown.took} · ${shown.steps} steps · ${shown.tokens} tokens · ${shown.cacheHit} cache hit`}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: turns.length > 60 ? 1 : 3, height }}>
        {turns.map((turn) => {
          const total = totalTokens(turn);
          const on = turn.turn === shown.turn;
          return (
            <Pressable key={turn.turn} accessibilityRole="button" accessibilityLabel={`Turn ${turn.turn}: ${formatTokens(total)} tokens, took ${formatDuration(turn.endAt > turn.startAt ? turn.endAt - turn.startAt : null)}`} onPress={() => setPicked(turn.turn)} style={{ flex: 1, maxWidth: 28, height, justifyContent: "flex-end" }}>
              <View style={{ height: Math.max(2, (total / max) * height), borderRadius: 2, overflow: "hidden", opacity: on ? 1 : 0.55, flexDirection: "column-reverse", backgroundColor: t.c.surface2 }}>
                {tokenParts(turn).map((part) => (part.share > 0 ? <View key={part.key} style={{ height: `${part.share * 100}%`, minHeight: 1, backgroundColor: partColor[part.key] }} /> : null))}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: t.c.border }}>
          <Text style={[t.text.meta, { width: 56 }]}>Turn</Text>
          {columns.map(([label]) => (
            <Text key={label} style={[t.text.meta, { flex: 1, textAlign: "right" }]} numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
        {visible.map((row) => (
          <Pressable key={row.turn} accessibilityRole="button" accessibilityLabel={`Turn ${row.turn}, ${row.tokens} tokens, took ${row.took}`} onPress={() => setPicked(row.turn)} style={{ flexDirection: "row", gap: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: row.turn === shown.turn ? t.c.surface1 : undefined }}>
            <Text style={[t.text.body, { width: 56, fontVariant: ["tabular-nums"] }]}>{row.turn}</Text>
            {columns.map(([label, value]) => (
              <Text key={label} style={cell} numberOfLines={1}>
                {value(row)}
              </Text>
            ))}
          </Pressable>
        ))}
      </View>
      {rows.length > TURN_ROWS ? <Button t={t} variant="ghost" label={all ? "Show fewer turns" : `Show all ${rows.length} turns`} onPress={() => setAll(!all)} /> : null}
    </Card>
  );
}

const SUB_AGENT_ROWS = 10;
// Sub-agents read their own logs less often than the chat on screen.
const SUB_AGENT_REFRESH_MS = 10_000;

// One sub-agent: its name, tokens, cache hit and turns, and a bar of its tokens against the busiest sub-agent's
// (`onTokens` reports its total up, for that bar and the card's sum).
function SubAgentRow({ t, read, agent, max, onTokens }: { t: Tokens; read: StatsReader; agent: AgentRef; max: number; onTokens(id: string, tokens: number): void }) {
  const name = useAgent(agent, (item) => chatName(item)) ?? "Sub-agent";
  const result = useSessionStats(read, agent.id, { every: SUB_AGENT_REFRESH_MS });
  const tokens = result?.status === "ready" ? totalTokens(result.stats) : 0;
  useEffect(() => onTokens(agent.id, tokens), [agent.id, tokens, onTokens]);
  const ready = result?.status === "ready" ? result : null;
  const hit = ready ? cacheHitShare(ready.stats) : null;
  return (
    <View accessibilityLabel={ready ? `${name}: ${formatTokens(tokens)} tokens, ${formatShare(hit)} cache hit, ${ready.stats.turns} turns` : name} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
      <Text style={[t.text.body, { flex: 1 }]} numberOfLines={1}>
        {name}
      </Text>
      {ready ? (
        <>
          <Text style={[t.text.small, { color: t.c.foregroundMuted, fontVariant: ["tabular-nums"] }]}>{`${ready.stats.turns} ${ready.stats.turns === 1 ? "turn" : "turns"}`}</Text>
          <Text style={[t.text.small, { color: hitColor(t, hit) ?? t.c.foregroundMuted, minWidth: 48, textAlign: "right", fontVariant: ["tabular-nums"] }]}>{formatShare(hit)}</Text>
          <View style={{ width: 72, height: 4, borderRadius: 2, backgroundColor: t.c.surface2 }}>
            <View style={{ width: `${max > 0 ? (tokens / max) * 100 : 0}%`, minWidth: 3, height: 4, borderRadius: 2, backgroundColor: PURPLE }} />
          </View>
          <Text style={[t.text.body, { minWidth: 56, textAlign: "right", fontWeight: "600", fontVariant: ["tabular-nums"] }]}>{formatTokens(tokens)}</Text>
        </>
      ) : (
        <Text style={[t.text.small, { color: result?.status === "error" ? t.c.statusDanger : t.c.foregroundMuted }]} numberOfLines={1}>
          {!result ? "Reading…" : result.status === "error" ? "Log unreadable" : result.status === "unavailable" ? result.reason : ""}
        </Text>
      )}
    </View>
  );
}

// The chat's sub-agents (separate Paseo agents with their own logs, so not in this chat's numbers), latest first.
// Hidden when it has none.
function SubAgentsCard({ t, read, agentId }: { t: Tokens; read: StatsReader; agentId: string }) {
  const subs = useAgents({ where: (agent) => agent.parentAgentId === agentId, orderBy: ["lastActivityAt", "desc"] });
  const [tokens, setTokens] = useState<ReadonlyMap<string, number>>(new Map());
  const [all, setAll] = useState(false);
  const [onTokens] = useState(() => (id: string, count: number) => setTokens((previous) => (previous.get(id) === count ? previous : new Map(previous).set(id, count))));
  if (!subs.length) return null;
  const listed = subs.map((agent) => tokens.get(agent.id) ?? 0);
  const sum = listed.reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...listed);
  const visible = all ? subs : subs.slice(0, SUB_AGENT_ROWS);
  // Only listed rows read their logs, so the sum is shown only when every sub-agent is listed.
  const summary = visible.length === subs.length ? `${subs.length} · ${formatTokens(sum)} tokens` : String(subs.length);
  return (
    <Card t={t} title="Sub-agents" icon="Bot" right={<Text style={[t.text.meta, { fontVariant: ["tabular-nums"] }]}>{summary}</Text>}>
      <View style={{ gap: 6 }}>
        {visible.map((agent) => (
          <SubAgentRow key={agent.key} t={t} read={read} agent={agent} max={max} onTokens={onTokens} />
        ))}
      </View>
      {subs.length > SUB_AGENT_ROWS ? <Button t={t} variant="ghost" label={all ? "Show fewer" : `Show all ${subs.length}`} onPress={() => setAll(!all)} /> : null}
    </Card>
  );
}

// The Stats button in one workspace's top bar. Its icon polls the chat on screen and writes the label (tokens and cache
// hit); its popover picks among the workspace's open chats.
export function addStatsHeaderButton(client: PluginClientContext, read: StatsReader, chats: ValueStore<Chats>, workspaceId: string): () => void {
  let registration: PluginButtonRegistration | null = null;
  const useDefaultChat = () => chatForWorkspace(useValue(chats), workspaceId, useValue(openChat));
  function StatsButtonIcon(props: PluginButtonIconProps) {
    const result = useSessionStats(read, useDefaultChat());
    const label = headerLabel(result);
    useEffect(() => registration?.update({ label }), [label]);
    return <Icon name="Gauge" size={props.size} color={props.color} />;
  }
  function StatsPopover(props: PluginButtonContentProps) {
    const t = useTokens(props.theme, props.layout.compact);
    const list = useValue(chats);
    const fallback = useDefaultChat();
    const [picked, setPicked] = useState<string | null>(null);
    const open = [...list].filter(([, chat]) => chat.workspaceId === workspaceId && !chat.closed);
    const chatId = picked && list.has(picked) ? picked : fallback;
    const result = useSessionStats(read, chatId);
    return (
      // Paseo's popover pads its content; the parts here add no padding of their own.
      <View style={{ width: 420, maxWidth: "100%", gap: 12 }}>
        {open.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {open.map(([id, chat]) => (
              <Tag key={id} t={t} label={chat.title} on={id === chatId} onPress={() => setPicked(id)} />
            ))}
          </ScrollView>
        ) : null}
        {chatId ? <StatsGlance t={t} result={result} /> : <Text style={t.text.small}>Open a chat in this workspace to see its stats.</Text>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: t.c.border, paddingTop: 8 }}>
          <Text style={[t.text.small, { flex: 1, color: t.c.foregroundMuted }]}>From the chat's own log; times are estimates.</Text>
          {chatId ? (
            <Button
              t={t}
              variant="ghost"
              icon="PanelRight"
              label="Open panel"
              onPress={() => {
                props.close();
                client.openPanel(STATS_PANEL_ID, { workspaceId, agentId: chatId });
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }
  registration = client.addHeaderButton({ id: "morphise-stats", workspaceId, button: { title: "Session stats", label: "Stats", icon: StatsButtonIcon, behavior: { kind: "popover", Content: StatsPopover } } });
  return () => registration?.remove();
}

// The Stats panel for a chat: every reading at once.
export function createStatsPanel(read: StatsReader) {
  return function StatsPanel(props: PluginAgentPanelProps) {
    const t = useTokens(props.theme, props.layout.compact);
    const result = useSessionStats(read, props.params.agentId, { turns: true });
    const [width, setWidth] = useState(0);
    const wide = !props.layout.compact && width >= PANEL_WIDE;
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.inset, gap: 12, width: "100%", maxWidth: 1400 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <StatsTiles t={t} result={result} wide={wide}>
          <TurnsCard t={t} turns={result?.status === "ready" ? result.turns : undefined} wide={wide} />
          <SubAgentsCard t={t} read={read} agentId={props.params.agentId} />
        </StatsTiles>
        <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>From the chat's own log on the daemon's computer; times come from its timestamps, so they are estimates.</Text>
      </ScrollView>
    );
  };
}
