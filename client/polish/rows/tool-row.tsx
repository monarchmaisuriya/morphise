// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (ToolItem, ToolDetail)
// Morphise adds: its fold rules, long output folded to its first and last lines with Show all,
// changed words marked in diffs, the picture of an image read, paths relative to the workspace,
// and Copy, Details, Open file and Show in Finder under the details.
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { foldLines, rowStartsOpen, wordDiff } from "../../../shared/chat-view";
import type { RowActions } from "../../chat-rows";
import { Icon } from "../../ui/kit";
import { isMac } from "../../web";
import { useT } from "../i18n";
import { usePrefs } from "../prefs";
import { gutterDigits } from "./diff";
import { useRowSetup } from "./look";
import { detailBody, shownTarget, type ToolData, type ToolDetailData } from "./model";
import { alpha, CodeLine, Expand, PMONO, Prose, Row, Scroll, type Styles, toneColor, useDisclosure, useEnter, useIndent, useSpacing, useStyles } from "./row";

/** Rows inside an open merged run sit flush in its list, without the timeline spacing. */
export type Nestable = { nested?: boolean };

function ShowAll({ s, hidden, onPress }: { s: Styles; hidden: number; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={s.action}>Show all · {hidden} more lines</Text>
    </Pressable>
  );
}

/** Output or file content, folded to its first and last `keep` lines until Show all; code is colored line by line. */
function LongText({ s, text, keep, wrap, code, theme, color }: { s: Styles; text: string; keep: number | null; wrap: boolean; code: boolean; theme: PluginTheme; color: string }) {
  const [all, setAll] = useState(false);
  const folded = foldLines(text, all ? null : keep);
  const lines = (part: string[]) =>
    code ? (
      part.map((line, i) => <CodeLine key={i} text={line || " "} theme={theme} style={s.code} />)
    ) : (
      <Text {...PMONO} style={[s.code, { color }]} selectable>
        {part.join("\n")}
      </Text>
    );
  return (
    <>
      <Scroll nowrap={!wrap}>
        <View style={s.blockBody}>{lines(folded.head)}</View>
      </Scroll>
      {folded.hidden ? <ShowAll s={s} hidden={folded.hidden} onPress={() => setAll(true)} /> : null}
      {folded.tail.length ? (
        <Scroll nowrap={!wrap}>
          <View style={[s.blockBody, { paddingTop: 0 }]}>{lines(folded.tail)}</View>
        </Scroll>
      ) : null}
    </>
  );
}

type DiffRow = { sign: " " | "+" | "-"; text: string; n?: number };

/** Word-level changes: each removed line paired with the added line at the same place in the run of additions that follows it. */
function changedWords(lines: readonly DiffRow[]) {
  const pairs = new Map<number, ReturnType<typeof wordDiff>>();
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]!.sign !== "-" || (index > 0 && lines[index - 1]!.sign === "-")) continue;
    let end = index;
    while (end < lines.length && lines[end]!.sign === "-") end++;
    let addEnd = end;
    while (addEnd < lines.length && lines[addEnd]!.sign === "+") addEnd++;
    for (let offset = 0; offset < Math.min(end - index, addEnd - end); offset++) {
      const words = wordDiff(lines[index + offset]!.text, lines[end + offset]!.text);
      pairs.set(index + offset, words);
      pairs.set(end + offset, words);
    }
  }
  return pairs;
}

function Diff({ s, lines, theme, keep, wrap, numbers }: { s: Styles; lines: DiffRow[]; theme: PluginTheme; keep: number | null; wrap: boolean; numbers: boolean }) {
  const c = theme.colors;
  const [all, setAll] = useState(false);
  const shown = !all && keep !== null && lines.length > keep + 2 ? lines.slice(0, keep) : lines;
  const pairs = changedWords(lines);
  const numberDigits = gutterDigits(lines, numbers);
  const lineStyle = wrap ? { flex: 1, minWidth: 0 } : { flexGrow: 1, flexShrink: 0 };
  return (
    <>
      <Scroll nowrap={!wrap}>
        <View style={{ paddingVertical: 6, flexGrow: 1 }}>
          {shown.map((l, i) => {
            const color = l.sign === "+" ? c.statusSuccess : l.sign === "-" ? c.statusDanger : undefined;
            const words = pairs.get(i);
            const parts = words ? (l.sign === "-" ? words.before : words.after) : undefined;
            return (
              <View key={i} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingVertical: 1, backgroundColor: color ? alpha(color, 0.12) : undefined }}>
                <Text {...PMONO} style={[s.code, { color: color ?? c.foregroundMuted, width: s.code.fontSize, flexShrink: 0, marginRight: -6 }]}>{l.sign}</Text>
                {numberDigits ? <Text {...PMONO} style={s.gutter}>{String(l.n ?? "").padStart(numberDigits, " ")}</Text> : null}
                {/* Added and removed lines read in their color, their changed words marked; context lines keep the highlight theme. */}
                {color ? (
                  <Text {...PMONO} selectable style={[s.code, lineStyle, { color }]}>
                    {parts ? parts.map((part, j) => <Text key={j} style={part.changed ? { backgroundColor: alpha(color, 0.3), borderRadius: 2 } : null}>{part.text}</Text>) : l.text}
                  </Text>
                ) : (
                  <CodeLine text={l.text} theme={theme} style={[s.code, lineStyle]} />
                )}
              </View>
            );
          })}
        </View>
      </Scroll>
      {shown.length < lines.length ? <ShowAll s={s} hidden={lines.length - shown.length} onPress={() => setAll(true)} /> : null}
    </>
  );
}

export function ToolDetail({ data, theme }: { data: ToolDetailData; theme: PluginTheme }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const t = useT();
  const { look } = useRowSetup();
  const prefs = usePrefs();
  const wrap = prefs.diffWrap === "on";
  switch (data.kind) {
    case "output":
      return (
        <View style={s.block}>
          {data.command ? (
            <View style={[s.blockHead, !data.text && { borderBottomWidth: 0 }]}>
              <Text {...PMONO} style={[s.code, { color: c.foregroundMuted, fontSize: s.code.fontSize + 0.5 }]}>$</Text>
              <CodeLine text={data.command} theme={theme} shell style={[s.code, { flex: 1, fontSize: s.code.fontSize + 0.5 }]} />
              {data.cwd ? <Text {...PMONO} style={[s.code, { color: c.foregroundMuted, fontSize: s.code.fontSize - 0.5 }]}>{data.cwd.split("/").pop()}</Text> : null}
            </View>
          ) : null}
          {data.text ? <LongText s={s} text={data.text} keep={look.outputLines} wrap={wrap} code={false} theme={theme} color={c.foregroundMuted} /> : null}
        </View>
      );
    case "file":
      return (
        <View style={s.block}>
          <LongText s={s} text={data.text} keep={look.codeLines} wrap={wrap} code theme={theme} color={c.foreground} />
        </View>
      );
    case "diff":
      return (
        <View style={s.block}>
          <Diff s={s} lines={data.lines} theme={theme} keep={look.codeLines} wrap={wrap} numbers={prefs.diffLineNumbers} />
        </View>
      );
    case "io":
      return (
        <View style={s.block}>
          {(["input", "output"] as const).map((k, i) => (
            <View key={k} style={[s.blockBody, i === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <Text style={s.label}>{t(k === "input" ? "chat.input" : "chat.output")}</Text>
              <Scroll nowrap={!wrap}>
                {data[k].split("\n").map((line, i) => (
                  <CodeLine key={i} text={line} theme={theme} style={s.code} />
                ))}
              </Scroll>
            </View>
          ))}
        </View>
      );
    case "list":
      return (
        <View style={s.ruled}>
          {data.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {it.icon ? <Icon name={it.icon} size={13} color={toneColor(c, it.tone)} /> : null}
              {it.shell ? (
                <CodeLine text={it.text} theme={theme} shell style={[s.code, { flexShrink: 1 }]} />
              ) : (
                <Text {...PMONO} numberOfLines={1} style={[s.code, { flexShrink: 1 }]}>
                  {it.text}
                </Text>
              )}
            </View>
          ))}
        </View>
      );
    case "prose":
      return (
        <View style={s.ruled}>
          <Prose theme={theme} text={data.text} />
        </View>
      );
    case "text":
      return (
        <View style={s.ruled}>
          <Scroll>
            <Text style={s.small} selectable>
              {data.text}
            </Text>
          </Scroll>
        </View>
      );
  }
}

/** A picture for a read of an image file, read on the daemon when the row opens. */
function ImagePreview({ s, path, actions, theme }: { s: Styles; path: string; actions: RowActions; theme: PluginTheme }) {
  const [state, setState] = useState<{ uri: string } | { reason: string } | null>(null);
  useEffect(() => {
    let alive = true;
    actions.readImage(path).then(
      (result) => alive && setState(result.ok ? { uri: result.dataUri } : { reason: result.reason }),
      (error: unknown) => alive && setState({ reason: String(error) }),
    );
    return () => {
      alive = false;
    };
  }, [actions, path]);
  if (!state) return <Text style={s.small}>Loading the picture...</Text>;
  if ("reason" in state) return <Text style={s.small}>No picture: {state.reason}</Text>;
  return <Image source={{ uri: state.uri }} accessibilityLabel={`Picture of ${path}`} resizeMode="contain" style={{ width: "100%", maxWidth: 520, height: 260, borderRadius: 8, backgroundColor: theme.colors.surface1 }} />;
}

function Action({ s, theme, icon, label, onPress }: { s: Styles; theme: PluginTheme; icon: string; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent" })}
    >
      <Icon name={icon} size={12} color={theme.colors.foregroundMuted} />
      <Text style={s.action}>{label}</Text>
    </Pressable>
  );
}

/** Copy, Details, Open file and Show in Finder under a row's details. */
function Actions({ s, theme, data, agentId, actions, children }: { s: Styles; theme: PluginTheme; data: ToolData; agentId: string; actions: RowActions | null; children?: ReactNode }) {
  const toast = useToast();
  const { body, bodyKind } = detailBody(data.detail);
  const path = data.path?.startsWith("/") ? data.path : null;
  const report = (what: string) => (result: { ok: boolean; reason?: string }) => (result.ok ? null : toast.error(`Could not ${what}: ${result.reason ?? ""}`));
  const copied = body || data.error;
  if (!copied && !(actions && path)) return <>{children}</>;
  return (
    <>
      {children}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, marginLeft: -6, marginTop: 4 }}>
        {copied ? <Action s={s} theme={theme} icon="Copy" label="Copy" onPress={() => void copyText(copied).then(() => toast.show("Copied"), (error: unknown) => toast.error(String(error)))} /> : null}
        {actions && body ? <Action s={s} theme={theme} icon="PanelRight" label="Details" onPress={() => void actions.openDetails(agentId, { title: `${data.verb} ${data.target ?? ""}`.trim(), body, bodyKind, path }).then(report("open the details"))} /> : null}
        {actions && path ? <Action s={s} theme={theme} icon="FileSearch" label="Open file" onPress={() => void actions.openDetails(agentId, { title: path, body: "", bodyKind: "content", path }).then(report("open the file"))} /> : null}
        {actions && path && Platform.OS === "web" ? <Action s={s} theme={theme} icon="FolderOpen" label={isMac() ? "Show in Finder" : "Show in folder"} onPress={() => void actions.reveal(path).then(report("show the file"), (error: unknown) => toast.error(String(error)))} /> : null}
      </View>
    </>
  );
}

const detailLines = (detail: ToolDetailData | undefined) => (detail ? detailBody(detail).body.split("\n").length : 0);

export function ToolItem({ item, theme, layout, agentId, timestamp, nested }: PluginTimelineItemProps<ToolData> & Nestable) {
  const d = item.data;
  const s = useStyles(theme);
  const { failedOpen } = usePrefs();
  const { look, actions } = useRowSetup();
  const picture = !!(d.image && d.path && look.images && actions);
  const opens = !!d.detail || picture;
  const [open, toggle] = useDisclosure(opens && rowStartsOpen(look, d.kind, d.status, detailLines(d.detail), failedOpen));
  const enter = useEnter(d.status === "running");
  const spacing = useSpacing(nested);
  const indent = useIndent("tool");
  const c = theme.colors;
  const target = shownTarget(d, look.paths, d.path ? actions?.workspaceFolder(agentId) ?? null : null);
  return (
    <Animated.View style={[spacing, enter, d.status === "canceled" ? { opacity: 0.55 } : null]}>
      <Row
        theme={theme}
        compact={layout.compact}
        kind="tool"
        icon={d.icon}
        iconColor={d.status === "failed" ? c.statusDanger : undefined}
        verb={d.verb}
        target={target}
        mono={d.mono}
        shell={d.shell}
        meta={d.meta}
        metaColor={d.metaTone ? toneColor(c, d.metaTone) : undefined}
        pulsing={d.status === "running"}
        struck={d.status === "canceled"}
        open={open}
        onToggle={opens ? toggle : undefined}
        time={nested ? undefined : timestamp}
      />
      {d.error ? (
        <Text style={[s.small, { color: c.statusDanger, paddingLeft: indent }]} numberOfLines={open ? undefined : 2}>
          {d.error}
        </Text>
      ) : null}
      {opens ? (
        <Expand open={open} style={[s.detail, { paddingLeft: indent, marginBottom: 12, gap: 8 }]}>
          <Actions s={s} theme={theme} data={d} agentId={agentId} actions={actions}>
            {picture && actions ? <ImagePreview s={s} path={d.path!} actions={actions} theme={theme} /> : d.detail ? <ToolDetail data={d.detail} theme={theme} /> : null}
          </Actions>
        </Expand>
      ) : null}
    </Animated.View>
  );
}
