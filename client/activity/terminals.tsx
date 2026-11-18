// A workspace's open terminals on the Activity tab: name and folder, the last lines on expand, and Close (after a
// confirm, since it kills the terminal's process). After Activity by koinzhang (koinzhang/paseo-plugins, activity/,
// MIT, see NOTICE.md): client/workspace/terminals-section.tsx at 83a1c90.
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Button, Icon, type Tokens } from "../ui/kit";
import { fontSize, radius } from "../../shared/design/tokens";

type PaseoTerminal = Awaited<ReturnType<PluginClientContext["paseo"]["terminals"]["list"]>>["entries"][number];

const POLL_MS = 5000;
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });
const PREVIEW_LINES = 8;

function Row({ client, t, terminal, onClosed }: { client: PluginClientContext; t: Tokens; terminal: PaseoTerminal; onClosed(): void }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    client.paseo.terminals
      .ref(terminal)
      .capture({ stripAnsi: true })
      .then(
        (capture) => alive && setLines(capture.lines.filter((line) => line.trim()).slice(-PREVIEW_LINES)),
        (reason: unknown) => alive && setError(reason instanceof Error ? reason.message : String(reason)),
      );
    return () => {
      alive = false;
    };
  }, [client, terminal, open]);
  const close = () => {
    setError(null);
    client.paseo.terminals
      .ref(terminal)
      .kill()
      .then(onClosed, (reason: unknown) => {
        setConfirming(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  };
  return (
    <View style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.c.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${open ? "Hide" : "Show"} the last lines of ${terminal.name}`} onPress={() => setOpen(!open)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={t.c.foregroundMuted} />
          <Icon name="SquareTerminal" size={14} color={t.c.foreground} />
          <View style={{ flex: 1 }}>
            <Text style={t.text.body} numberOfLines={1}>
              {terminal.name}
            </Text>
            <Text style={t.text.small} numberOfLines={1} ellipsizeMode="head">
              {terminal.cwd}
            </Text>
          </View>
        </Pressable>
        {confirming ? (
          <>
            <Text style={t.text.danger}>Close? Its process is killed.</Text>
            <Button t={t} variant="ghost" label="Cancel" onPress={() => setConfirming(false)} />
            <Button t={t} variant="danger" label="Close" onPress={close} />
          </>
        ) : (
          <Button t={t} variant="ghost" icon="X" label="Close" onPress={() => setConfirming(true)} />
        )}
      </View>
      {open ? (
        <View style={{ padding: 8, borderRadius: radius.md, backgroundColor: t.c.surface1 }}>
          {lines === null ? <Text style={t.text.small}>Reading…</Text> : lines.length ? lines.map((line, index) => <Text key={index} style={{ color: t.c.foreground, fontSize: fontSize.sm, fontFamily: MONO }} numberOfLines={1}>{line}</Text>) : <Text style={t.text.small}>Nothing printed yet.</Text>}
        </View>
      ) : null}
      {error ? <Text style={t.text.danger}>{error}</Text> : null}
    </View>
  );
}

export function Terminals({ client, t, workspaceId }: { client: PluginClientContext; t: Tokens; workspaceId: string }) {
  const [terminals, setTerminals] = useState<PaseoTerminal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      client.paseo.workspaces
        .ref(workspaceId)
        .terminals.list()
        .then(
          (result) => {
            if (!alive) return;
            setTerminals(result.entries);
            setError(null);
            timer = setTimeout(read, POLL_MS);
          },
          (reason: unknown) => {
            if (!alive) return;
            setError(reason instanceof Error ? reason.message : String(reason));
            timer = setTimeout(read, POLL_MS);
          },
        );
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client, workspaceId, refresh]);
  return (
    <View style={{ gap: 6, padding: 14, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="SquareTerminal" size={14} color={t.c.foregroundMuted} />
        <Text style={[t.text.heading, { flex: 1 }]}>Terminals</Text>
        <Text style={t.text.small}>{terminals ? `${terminals.length} open` : ""}</Text>
      </View>
      {error ? <Text style={t.text.danger}>Terminals could not be listed: {error}</Text> : null}
      {terminals === null && !error ? <Text style={t.text.small}>Reading…</Text> : null}
      {terminals?.length === 0 ? <Text style={t.text.small}>No open terminals in this workspace.</Text> : null}
      {terminals?.map((terminal) => <Row key={terminal.id} client={client} t={t} terminal={terminal} onClosed={() => setRefresh((count) => count + 1)} />)}
    </View>
  );
}
