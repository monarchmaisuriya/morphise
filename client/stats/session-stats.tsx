// Session stats in the app: one Stats button in each workspace's top bar (beside the reminder button) whose popover
// shows the open chat's readings, a Stats panel, and the rows the Agents details pane shows. Readings come from the
// daemon (`morphise.stats.read`), which reads the chat's own log; they refresh every 2 s while something on screen
// shows them. After Harness Stats by kogekiplay (MIT, see NOTICE.md).
import type { PluginAgentPanelProps, PluginButtonContentProps, PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { cacheHitShare, type StatsReadResult, statsRead } from "../../shared/stats";
import { activityRows, headerLabel, type Row, usageRows } from "../../shared/stats-format";
import { type Chats, chatForWorkspace } from "../chats";
import { createValueStore, type ValueStore, useValue } from "../profile-store";
import { createStatsCache } from "./cache";
import { Button, Icon, Tag, type Tokens, useTokens } from "../ui/kit";

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

// The chat open in Morphise's sidebar view, which knows it (top-bar buttons are told only their workspace); null when
// that view is not in use, and the stats button then shows the workspace's first open chat.
export const openChat = createValueStore<string | null>(null);

// A reading as tiles, two to a row: the label small, the value large.
function Tiles({ t, rows }: { t: Tokens; rows: readonly Row[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexBasis: "47%", flexGrow: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.c.surface1, gap: 2 }}>
          <Text style={[t.text.small, { color: t.c.foregroundMuted }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={{ color: t.c.foreground, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ t, icon, title }: { t: Tokens; icon: string; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon name={icon} size={13} color={t.c.foregroundMuted} />
      <Text style={[t.text.small, { color: t.c.foregroundMuted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 }]}>{title}</Text>
    </View>
  );
}

// Every reading as tiles under Activity and Usage, with the cache hit as a bar; or why there is no reading.
export function StatsTiles({ t, result }: { t: Tokens; result: StatsReadResult | null }) {
  if (!result) return <Text style={t.text.small}>Reading the chat's log…</Text>;
  if (result.status === "error") return <Text style={[t.text.small, { color: t.c.statusDanger }]}>This chat's log could not be read: {result.error}</Text>;
  if (result.status === "unavailable") return <Text style={t.text.small}>{result.reason}</Text>;
  const hit = cacheHitShare(result.stats);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <SectionTitle t={t} icon="Activity" title="Activity" />
        <Tiles t={t} rows={activityRows(result.stats)} />
      </View>
      <View style={{ gap: 6 }}>
        <SectionTitle t={t} icon="Database" title="Usage" />
        {hit !== null ? (
          <View accessibilityLabel={`Cache hit ${Math.round(hit * 100)}%`} style={{ height: 4, borderRadius: 2, backgroundColor: t.c.surface2, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, hit * 100)}%`, height: 4, backgroundColor: t.c.statusSuccess }} />
          </View>
        ) : null}
        <Tiles t={t} rows={usageRows(result.stats)} />
      </View>
      {result.partial ? <Text style={t.text.small}>Still reading a long log; the numbers grow as it goes.</Text> : null}
    </View>
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
      <View style={{ width: 340, maxWidth: "100%", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="Gauge" size={16} color={t.c.foreground} />
          <Text style={[t.text.body, { fontWeight: "600", flexShrink: 0 }]}>Session stats</Text>
          <Text style={[t.text.small, { color: t.c.foregroundMuted, flex: 1, textAlign: "right" }]} numberOfLines={1}>
            {chatId ? list.get(chatId)?.title ?? "" : ""}
          </Text>
        </View>
        {open.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {open.map(([id, chat]) => (
              <Tag key={id} t={t} label={chat.title} on={id === chatId} onPress={() => setPicked(id)} />
            ))}
          </ScrollView>
        ) : null}
        {chatId ? <StatsTiles t={t} result={result} /> : <Text style={t.text.small}>Open a chat in this workspace to see its stats.</Text>}
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
    const result = useSessionStats(read, props.params.agentId);
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <StatsTiles t={t} result={result} />
        <Text style={[t.text.small, { color: t.c.foregroundMuted }]}>From the chat's own log on the daemon's computer; times come from its timestamps, so they are estimates.</Text>
      </View>
    );
  };
}
