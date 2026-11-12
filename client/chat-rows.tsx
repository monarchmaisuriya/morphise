import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";
import { type ChatLook, commandTokens, diffLines, type DiffLine, foldLines, mcpName, relativePath, rowStartsOpen, shellProgram, thinkingSteps, TOOL_KINDS, type ToolKind, toolVerb, wordDiff } from "../shared/chat-view";
import { imageType } from "../shared/files";
import { Icon, type Tokens, useTokens } from "./ui/kit";
import { withAlpha } from "./ui/hues";
import { usePulse } from "./ui/pulse";
import { isMac } from "./web";

// Morphise's own chat rows, drawn in place of Paseo's when the Chat settings ask. Every kind of
// row shares one design: an icon column, a label, what it acted on, and quiet facts on the right;
// opening one shows its details below. Prompts and replies are never drawn here, so Paseo's Fork
// and Copy on them always stay.

export const TOOL_ROW_KIND = "tool-call";
export const THINKING_ROW_KIND = "thinking";
export const NOTICE_ROW_KIND = "notice";

export const toolRowSchema = z.object({
  kind: z.enum(TOOL_KINDS),
  detail: z.string(),
  name: z.string(),
  subject: z.string(),
  path: z.string().optional(),
  status: z.enum(["running", "completed", "failed", "canceled"]),
  error: z.string(),
  body: z.string(),
  bodyKind: z.enum(["output", "diff", "content"]),
  facts: z.array(z.string()),
  style: z.enum(["cards", "compact"]),
});
export const thinkingRowSchema = z.object({ text: z.string(), streaming: z.boolean() });
export const noticeRowSchema = z.object({ level: z.enum(["info", "warning", "error"]), title: z.string(), message: z.string() });

type ToolData = z.output<typeof toolRowSchema>;

// What rows can do beyond drawing: read files on the daemon, open the Details panel, and know the
// chat's workspace folder (for relative paths). Null in the settings preview.
export interface RowActions {
  readImage(path: string): Promise<{ ok: true; dataUri: string } | { ok: false; reason: string }>;
  reveal(path: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  openDetails(agentId: string, details: { title: string; body: string; bodyKind: ToolData["bodyKind"]; path: string | null }): Promise<{ ok: true } | { ok: false; reason: string }>;
  workspaceFolder(agentId: string): string | null;
}

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

// Paseo leaves 16pt under every plugin row (getGapBetweenStreamItems returns SPACING[4] = 16 for
// them, checked in Paseo 0.16's app), while its own tool, thought and plan rows sit with no gap.
// Rows take most of it back, so a run of tool calls reads as one list, as Paseo's own do. The
// spacing setting decides how much stays.
const PASEO_ROW_GAP = 16;

const KIND_ICONS: Record<ToolKind, string> = {
  shell: "SquareTerminal",
  read: "FileText",
  edit: "FilePen",
  search: "Search",
  fetch: "Globe",
  sub_agent: "Bot",
  other: "Plug",
};

// Icons for common programs a shell row runs.
const PROGRAM_ICONS: Record<string, string> = {
  git: "GitBranch",
  gh: "Github",
  npm: "Package",
  npx: "Package",
  pnpm: "Package",
  yarn: "Package",
  bun: "Package",
  node: "Hexagon",
  deno: "Hexagon",
  python: "Code",
  python3: "Code",
  pip: "Package",
  uv: "Package",
  pytest: "FlaskConical",
  vitest: "FlaskConical",
  jest: "FlaskConical",
  docker: "Container",
  kubectl: "Ship",
  helm: "Ship",
  curl: "Globe",
  wget: "Globe",
  rg: "Search",
  grep: "Search",
  find: "Search",
  fd: "Search",
  ls: "FolderOpen",
  tree: "FolderTree",
  cat: "FileText",
  head: "FileText",
  tail: "FileText",
  sed: "Replace",
  awk: "Replace",
  make: "Hammer",
  cargo: "Hammer",
  go: "Hammer",
  tsc: "Hammer",
  psql: "Database",
  mysql: "Database",
  sqlite3: "Database",
  "redis-cli": "Database",
  ssh: "Server",
  scp: "Server",
  rm: "Trash2",
  mv: "FolderInput",
  cp: "Copy",
  mkdir: "FolderPlus",
  echo: "MessageSquare",
};

const SIZES = { small: 11, medium: 12, large: 14 } as const;
const STRENGTH = { full: 1, soft: 0.85, faded: 0.65, dim: 0.45 } as const;

function metrics(look: ChatLook) {
  const text = SIZES[look.textSize];
  const code = SIZES[look.codeSize];
  const gap = look.density === "compact" ? 2 : look.density === "spacious" ? 10 : 5;
  return { text, code, line: Math.round(code * 1.55), rowHeight: Math.round(text * 2.1), gap, pull: gap - PASEO_ROW_GAP };
}

const clock = (at: Date) => at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function StatusMark({ t, status, accent }: { t: Tokens; status: ToolData["status"]; accent: string }) {
  const pulse = usePulse(status === "running");
  if (status === "running") return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent, opacity: pulse }} />;
  if (status === "failed") return <Icon name="CircleX" size={13} color={t.c.statusDanger} />;
  if (status === "canceled") return <Icon name="CircleSlash" size={13} color={t.c.foregroundMuted} />;
  return null;
}

function Facts({ t, facts, size }: { t: Tokens; facts: string[]; size: number }) {
  return (
    <>
      {facts.map((fact) => {
        const diff = /^\+(\d+) −(\d+)$/.exec(fact);
        const added = /^\+(\d+)$/.exec(fact);
        return diff ? (
          <Text key={fact} style={{ fontSize: size - 1, fontFamily: MONO }}>
            <Text style={{ color: t.c.statusSuccess }}>+{diff[1]}</Text> <Text style={{ color: t.c.statusDanger }}>−{diff[2]}</Text>
          </Text>
        ) : added ? (
          <Text key={fact} style={{ fontSize: size - 1, fontFamily: MONO, color: t.c.statusSuccess }}>
            {fact}
          </Text>
        ) : (
          <Text key={fact} style={{ fontSize: size - 1, color: fact === "Not applied" ? t.c.statusDanger : t.c.foregroundMuted }}>
            {fact}
          </Text>
        );
      })}
    </>
  );
}

// A command with its program, flags and strings coloured.
function Command({ t, command, size, accent, colored }: { t: Tokens; command: string; size: number; accent: string; colored: boolean }) {
  if (!colored) return <>{command}</>;
  return (
    <>
      {commandTokens(command).map((token, index) => (
        <Text
          key={index}
          style={{
            fontSize: size,
            color: token.kind === "program" ? accent : token.kind === "flag" || token.kind === "operator" ? t.c.foregroundMuted : token.kind === "string" ? t.c.statusSuccess : t.c.foreground,
            fontWeight: token.kind === "program" ? "600" : "400",
          }}
        >
          {token.text}
        </Text>
      ))}
    </>
  );
}

// A tinted line background: the colour drawn faint behind the row.
function Tint({ color, strength = 0.12 }: { color: string; strength?: number }) {
  return <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: color, opacity: strength }} />;
}

// Lines that wrap, or scroll sideways when wrapping is off.
function Lines({ wrap, children }: { wrap: boolean; children: ReactNode }) {
  return wrap ? <View>{children}</View> : <ScrollView horizontal nestedScrollEnabled>{<View>{children}</View>}</ScrollView>;
}

function DiffView({ t, body, size, wrap, keep }: { t: Tokens; body: string; size: number; wrap: boolean; keep: number | null }) {
  const [all, setAll] = useState(false);
  const lines = diffLines(body);
  const shown = !all && keep !== null && lines.length > keep + 2 ? lines.slice(0, keep) : lines;
  const width = Math.max(2, String(Math.max(0, ...lines.map((line) => line.newLine ?? line.oldLine ?? 0))).length) * (size * 0.62) + 10;
  // Word-level changes: each removed line paired with the added line at the same place in the
  // run of additions that follows it.
  const pairs = new Map<number, ReturnType<typeof wordDiff>>();
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].kind !== "remove" || (index > 0 && lines[index - 1].kind === "remove")) continue;
    let end = index;
    while (end < lines.length && lines[end].kind === "remove") end++;
    let addEnd = end;
    while (addEnd < lines.length && lines[addEnd].kind === "add") addEnd++;
    for (let offset = 0; offset < Math.min(end - index, addEnd - end); offset++) {
      const words = wordDiff(lines[index + offset].text, lines[end + offset].text);
      pairs.set(index + offset, words);
      pairs.set(end + offset, words);
    }
  }
  const lineText = (line: DiffLine, index: number) => {
    const words = pairs.get(index);
    if (!words || (line.kind !== "add" && line.kind !== "remove")) return line.text || " ";
    const parts = line.kind === "remove" ? words.before : words.after;
    const color = line.kind === "add" ? t.c.statusSuccess : t.c.statusDanger;
    // A theme colour in a form withAlpha cannot read gets an underline instead of a fill.
    const fill = withAlpha(color, 0.33);
    const changed = fill ? { backgroundColor: fill, borderRadius: 2 } : { textDecorationLine: "underline" as const };
    return parts.map((part, at) => (
      <Text key={at} style={part.changed ? changed : null}>
        {part.text}
      </Text>
    ));
  };
  return (
    <View>
      <Lines wrap={wrap}>
        {shown.map((line, index) => {
          const color = line.kind === "add" ? t.c.statusSuccess : line.kind === "remove" ? t.c.statusDanger : null;
          return (
            <View key={index} style={{ flexDirection: "row" }}>
              {color ? <Tint color={color} /> : null}
              <Text style={{ width, textAlign: "right", paddingRight: 8, fontSize: size - 1, lineHeight: size * 1.6, color: t.c.foregroundMuted, fontFamily: MONO }}>{line.kind === "hunk" ? "⋯" : line.newLine ?? line.oldLine ?? ""}</Text>
              <Text style={{ width: size, fontSize: size, lineHeight: size * 1.6, color: color ?? t.c.foregroundMuted, fontFamily: MONO }}>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}</Text>
              <Text selectable style={{ flex: wrap ? 1 : undefined, paddingRight: 12, fontSize: size, lineHeight: size * 1.6, color: line.kind === "hunk" ? t.c.foregroundMuted : t.c.foreground, fontFamily: MONO }}>
                {line.kind === "hunk" ? "" : lineText(line, index)}
              </Text>
            </View>
          );
        })}
      </Lines>
      {shown.length < lines.length ? <ShowAll t={t} hidden={lines.length - shown.length} onPress={() => setAll(true)} /> : null}
    </View>
  );
}

function ShowAll({ t, hidden, onPress }: { t: Tokens; hidden: number; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ alignSelf: "flex-start", marginVertical: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: t.c.surface2 }}>
      <Text style={{ fontSize: 11, color: t.c.foregroundMuted }}>Show all · {hidden} more lines</Text>
    </Pressable>
  );
}

function TextBody({ t, body, size, line, wrap, keep }: { t: Tokens; body: string; size: number; line: number; wrap: boolean; keep: number | null }) {
  const [all, setAll] = useState(false);
  const folded = foldLines(body, all ? null : keep);
  const style = { fontSize: size, lineHeight: line, color: t.c.foreground, fontFamily: MONO, paddingRight: 12 } as const;
  return (
    <View>
      <Lines wrap={wrap}>
        <Text selectable style={style}>
          {folded.head.join("\n")}
        </Text>
      </Lines>
      {folded.hidden ? <ShowAll t={t} hidden={folded.hidden} onPress={() => setAll(true)} /> : null}
      {folded.tail.length ? (
        <Lines wrap={wrap}>
          <Text selectable style={style}>
            {folded.tail.join("\n")}
          </Text>
        </Lines>
      ) : null}
    </View>
  );
}

// A picture for a read of an image file, read on the daemon when the row opens.
function ImagePreview({ t, path, actions }: { t: Tokens; path: string; actions: RowActions }) {
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
  if (!state) return <Text style={t.text.small}>Loading the picture...</Text>;
  if ("reason" in state) return <Text style={t.text.small}>No picture: {state.reason}</Text>;
  return <Image source={{ uri: state.uri }} accessibilityLabel={`Picture of ${path}`} resizeMode="contain" style={{ width: "100%", maxWidth: 520, height: 260, borderRadius: 6, backgroundColor: t.c.surface0 }} />;
}

function BodyAction({ t, icon, label, onPress }: { t: Tokens; icon: string; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: pressed || hovered ? t.c.surface2 : "transparent" })}>
      <Icon name={icon} size={12} color={t.c.foregroundMuted} />
      <Text style={{ fontSize: 11, color: t.c.foregroundMuted }}>{label}</Text>
    </Pressable>
  );
}

// The opened part of a tool row: the error, then the picture, diff, output or content (folded to
// its first and last lines when long), with Copy, Details, and for files Reveal.
function ToolBody({ t, data, look, agentId, actions, path }: { t: Tokens; data: ToolData; look: ChatLook; agentId: string; actions: RowActions | null; path: string | null }) {
  const toast = useToast();
  const m = metrics(look);
  const image = actions && look.images && data.detail === "read" && path && imageType(path) ? path : null;
  const report = (what: string) => (result: { ok: boolean; reason?: string }) => (result.ok ? null : toast.error(`Could not ${what}: ${result.reason ?? ""}`));
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
      {data.error ? (
        <View style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, overflow: "hidden" }}>
          <Tint color={t.c.statusDanger} />
          <Text selectable style={{ fontSize: m.code, lineHeight: m.line, color: t.c.statusDanger, fontFamily: MONO }}>
            {data.error}
          </Text>
        </View>
      ) : null}
      {image && actions ? <ImagePreview t={t} path={image} actions={actions} /> : null}
      {data.body && !image ? (
        <ScrollView nestedScrollEnabled style={{ maxHeight: 440 }}>
          {data.bodyKind === "diff" ? <DiffView t={t} body={data.body} size={m.code} wrap={look.wrap} keep={look.codeLines} /> : <TextBody t={t} body={data.body} size={m.code} line={m.line} wrap={look.wrap} keep={data.bodyKind === "content" ? look.codeLines : look.outputLines} />}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, marginLeft: -6 }}>
        {data.body || data.error ? <BodyAction t={t} icon="Copy" label="Copy" onPress={() => void copyText(data.body || data.error).then(() => toast.show("Copied"), (error: unknown) => toast.error(String(error)))} /> : null}
        {actions && data.body ? <BodyAction t={t} icon="PanelRight" label="Details" onPress={() => void actions.openDetails(agentId, { title: `${toolVerb(data) || data.name} ${data.subject}`.trim(), body: data.body, bodyKind: data.bodyKind, path }).then(report("open the details"))} /> : null}
        {actions && path ? <BodyAction t={t} icon="FileSearch" label="Open file" onPress={() => void actions.openDetails(agentId, { title: path, body: "", bodyKind: "content", path }).then(report("open the file"))} /> : null}
        {actions && path && Platform.OS === "web" ? <BodyAction t={t} icon="FolderOpen" label={isMac() ? "Show in Finder" : "Show in folder"} onPress={() => void actions.reveal(path).then(report("show the file"), (error: unknown) => toast.error(String(error)))} /> : null}
      </View>
    </View>
  );
}


// The shared frame of every Morphise row: the icon column, the header line, and (opened) the
// details. Cards sit on a soft fill; lines have none. Faded rows come to full strength on hover.
function RowFrame({ t, look, card, icon, iconColor, header, open, onToggle, canOpen, body, label }: { t: Tokens; look: ChatLook; card: boolean; icon: ReactNode; iconColor?: string; header: ReactNode; open: boolean; onToggle(): void; canOpen: boolean; body: ReactNode; label: string }) {
  const m = metrics(look);
  const [hovered, setHovered] = useState(false);
  const strength = hovered || open ? 1 : STRENGTH[look.strength];
  return (
    <View style={{ marginBottom: m.pull, marginTop: card ? 1 : 0, borderRadius: 8, backgroundColor: card ? t.c.surface1 : "transparent", overflow: "hidden", opacity: strength }}>
      <Pressable
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        disabled={!canOpen}
        onPress={onToggle}
        style={({ pressed, hovered: over }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: m.rowHeight, paddingHorizontal: card ? 10 : 4, borderRadius: card ? 0 : 6, backgroundColor: !card && (pressed || over) ? t.c.surface1 : card && (pressed || over) ? t.c.surface2 : "transparent" })}
      >
        {look.labels !== "label" ? <View style={{ width: 16, alignItems: "center" }}>{icon}</View> : null}
        {header}
        {canOpen ? <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={iconColor ?? t.c.foregroundMuted} /> : null}
      </Pressable>
      {open ? <View style={card ? { borderTopWidth: 1, borderTopColor: t.c.border, backgroundColor: t.c.surface0 } : { marginLeft: look.labels !== "label" ? 28 : 4, marginTop: 2, borderRadius: 8, backgroundColor: t.c.surface1 }}>{body}</View> : null}
    </View>
  );
}

export function createToolRow(look: ChatLook, actions: RowActions | null) {
  return function ToolRow({ agentId, item, timestamp, theme, layout }: PluginTimelineItemProps<ToolData>) {
    const t = useTokens(theme, layout.compact);
    const data = item.data;
    const m = metrics(look);
    const accent = look.accent ?? t.c.foreground;
    const detailLines = data.body ? data.body.split("\n").length : 0;
    // The user's own open or fold wins; until then the rules decide, so a running call that
    // finishes folds by itself.
    const [chosen, setChosen] = useState<boolean | null>(null);
    const open = chosen ?? rowStartsOpen(look, data.kind, data.status, detailLines);
    const fullPath = data.path ?? data.subject;
    const canOpen = !!(data.body || data.error) || (data.detail === "read" && !!imageType(fullPath));
    const isFile = data.detail === "read" || data.detail === "edit" || data.detail === "write";
    const path = isFile && fullPath.startsWith("/") ? fullPath : null;
    const shown = isFile && look.paths === "relative" ? relativePath(data.subject, actions?.workspaceFolder(agentId) ?? null) : data.subject;
    const mcp = data.detail === "unknown" ? mcpName(data.name) : null;
    const program = data.detail === "shell" ? shellProgram(data.subject) : "";
    const iconName = data.detail === "shell" ? PROGRAM_ICONS[program] ?? KIND_ICONS.shell : KIND_ICONS[data.kind];
    const label = mcp ? mcp.action : toolVerb(data) || data.name;
    const iconColor = data.status === "failed" ? t.c.statusDanger : look.accent ?? t.c.foregroundMuted;
    return (
      <RowFrame
        t={t}
        look={look}
        card={data.style === "cards"}
        label={`${label}${shown ? ` ${shown}` : ""}, ${data.status}`}
        icon={<Icon name={iconName} size={m.text + 2} color={iconColor} />}
        open={open}
        canOpen={canOpen}
        onToggle={() => setChosen(!open)}
        header={
          <>
            {look.labels !== "icon" ? <Text style={{ fontSize: m.text, color: t.c.foregroundMuted }}>{label}</Text> : null}
            <Text style={{ flex: 1, fontSize: m.text, color: t.c.foreground, fontFamily: data.detail === "shell" || isFile || data.detail === "search" ? MONO : undefined }} numberOfLines={1}>
              {data.detail === "shell" ? <Command t={t} command={shown} size={m.text} accent={accent} colored={look.commandColors} /> : mcp ? <Text style={{ color: t.c.foregroundMuted }}>{mcp.service}</Text> : shown}
            </Text>
            <Facts t={t} facts={data.facts} size={m.text} />
            {look.timestamps ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{clock(timestamp)}</Text> : null}
            <StatusMark t={t} status={data.status} accent={look.accent ?? t.c.foreground} />
          </>
        }
        body={<ToolBody t={t} data={data} look={look} agentId={agentId} actions={actions} path={path} />}
      />
    );
  };
}

// Thinking in the same row design: "Thinking" with its current heading while it streams,
// "Thought" with its first heading (or line) and how long it took once done; opened, its steps
// one under the other.
export function createThinkingRow(look: ChatLook) {
  return function ThinkingRow({ item, timestamp, theme, layout }: PluginTimelineItemProps<z.output<typeof thinkingRowSchema>>) {
    const t = useTokens(theme, layout.compact);
    const m = metrics(look);
    const [chosen, setChosen] = useState<boolean | null>(null);
    const open = chosen ?? (look.reasoning === "expand" || rowStartsOpen(look, "thinking", item.data.streaming ? "running" : "completed", 0));
    const pulse = usePulse(item.data.streaming);
    // How long it thought, as seen while this row was on screen.
    const startedAt = useRef<number | null>(item.data.streaming ? Date.now() : null);
    const [took, setTook] = useState<number | null>(null);
    useEffect(() => {
      if (!item.data.streaming && startedAt.current !== null && took === null) setTook(Date.now() - startedAt.current);
    }, [item.data.streaming, took]);
    const steps = thinkingSteps(item.data.text);
    const headings = steps.filter((step) => step.title);
    const preview = item.data.streaming ? headings[headings.length - 1]?.title ?? "" : headings[0]?.title ?? item.data.text.trim().split("\n")[0]?.replace(/^[#*\s]+|\*+$/g, "") ?? "";
    return (
      <RowFrame
        t={t}
        look={look}
        card={false}
        label={open ? "Fold the thinking" : "Open the thinking"}
        icon={
          <Animated.View style={{ opacity: item.data.streaming ? pulse : 1 }}>
            <Icon name="Brain" size={m.text + 2} color={look.accent ?? t.c.foregroundMuted} />
          </Animated.View>
        }
        open={open}
        canOpen={!!item.data.text.trim()}
        onToggle={() => setChosen(!open)}
        header={
          <>
            {look.labels !== "icon" ? <Text style={{ fontSize: m.text, color: t.c.foregroundMuted }}>{item.data.streaming ? "Thinking" : "Thought"}</Text> : null}
            <Text style={{ flex: 1, fontSize: m.text, color: t.c.foregroundMuted }} numberOfLines={1}>
              {open ? "" : preview}
            </Text>
            {took !== null && took >= 1000 ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{Math.round(took / 1000)}s</Text> : null}
            {headings.length > 1 && !open ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{headings.length} steps</Text> : null}
            {look.timestamps ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{clock(timestamp)}</Text> : null}
          </>
        }
        body={
          <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 10, opacity: 0.9 }}>
            {steps.map((step, index) => (
              <View key={index} style={{ gap: 2 }}>
                {step.title ? <Text style={{ fontSize: m.text, fontWeight: "600", color: t.c.foreground }}>{step.title}</Text> : null}
                {step.text ? <Markdown>{step.text}</Markdown> : null}
              </View>
            ))}
          </View>
        }
      />
    );
  };
}

// Errors, Paseo's notices and context compaction, in the same row design with their colour.
export function createNoticeRow(look: ChatLook) {
  return function NoticeRow({ item, timestamp, theme, layout }: PluginTimelineItemProps<z.output<typeof noticeRowSchema>>) {
    const t = useTokens(theme, layout.compact);
    const toast = useToast();
    const m = metrics(look);
    const [open, setOpen] = useState(item.data.level === "error");
    const color = item.data.level === "error" ? t.c.statusDanger : item.data.level === "warning" ? t.c.statusWarning : t.c.foregroundMuted;
    const icon = item.data.level === "error" ? "CircleAlert" : item.data.level === "warning" ? "TriangleAlert" : item.data.title.includes("ompact") ? "Shrink" : "Info";
    const long = item.data.message.length > 120 || item.data.message.includes("\n");
    return (
      <RowFrame
        t={t}
        look={look}
        card={item.data.level !== "info"}
        label={`${item.data.title}${item.data.message ? `: ${item.data.message}` : ""}`}
        icon={<Icon name={icon} size={m.text + 2} color={color} />}
        open={open && long}
        canOpen={long}
        onToggle={() => setOpen(!open)}
        header={
          <>
            {look.labels !== "icon" ? <Text style={{ fontSize: m.text, color, fontWeight: "600" }}>{item.data.title}</Text> : null}
            <Text selectable style={{ flex: 1, fontSize: m.text, color: t.c.foregroundMuted }} numberOfLines={1}>
              {item.data.message}
            </Text>
            {look.timestamps ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{clock(timestamp)}</Text> : null}
          </>
        }
        body={
          <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6 }}>
            <Text selectable style={{ fontSize: m.code, lineHeight: m.line, color: t.c.foreground, fontFamily: MONO }}>
              {item.data.message}
            </Text>
            <View style={{ flexDirection: "row", marginLeft: -6 }}>
              <BodyAction t={t} icon="Copy" label="Copy" onPress={() => void copyText(item.data.message).then(() => toast.show("Copied"), (error: unknown) => toast.error(String(error)))} />
            </View>
          </View>
        }
      />
    );
  };
}

export const recapRowSchema = z.object({
  seconds: z.number().nullable(),
  files: z.array(z.object({ path: z.string(), added: z.number(), removed: z.number() })),
  failed: z.array(z.object({ command: z.string(), exitCode: z.number().nullable() })),
  calls: z.number(),
  outcome: z.enum(["completed", "failed", "canceled"]),
  error: z.string(),
});

const duration = (seconds: number) => (seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`);

// The recap the daemon adds after a turn (Settings, Chat, Turn recap): how long it took, files
// changed, commands that failed; opened, the list of each.
export function createRecapRow(look: ChatLook, actions: RowActions | null) {
  return function RecapRow({ agentId, item, theme, layout }: PluginTimelineItemProps<z.output<typeof recapRowSchema>>) {
    const t = useTokens(theme, layout.compact);
    const m = metrics(look);
    const [open, setOpen] = useState(false);
    const recap = item.data;
    const added = recap.files.reduce((sum, file) => sum + file.added, 0);
    const removed = recap.files.reduce((sum, file) => sum + file.removed, 0);
    const folder = actions?.workspaceFolder(agentId) ?? null;
    const color = recap.outcome === "failed" ? t.c.statusDanger : recap.failed.length ? t.c.statusWarning : look.accent ?? t.c.foregroundMuted;
    const facts = [
      recap.outcome === "canceled" ? "Stopped" : recap.outcome === "failed" ? "Failed" : "Done",
      recap.seconds !== null ? duration(recap.seconds) : null,
      recap.calls ? `${recap.calls} ${recap.calls === 1 ? "call" : "calls"}` : null,
      recap.files.length ? `${recap.files.length} ${recap.files.length === 1 ? "file" : "files"}` : null,
    ].filter(Boolean);
    return (
      <RowFrame
        t={t}
        look={look}
        card
        label={`Turn recap: ${facts.join(", ")}`}
        icon={<Icon name={recap.outcome === "failed" ? "CircleX" : "Flag"} size={m.text + 2} color={color} />}
        open={open}
        canOpen={recap.files.length > 0 || recap.failed.length > 0 || !!recap.error}
        onToggle={() => setOpen(!open)}
        header={
          <>
            <Text style={{ flex: 1, fontSize: m.text, color: t.c.foregroundMuted }} numberOfLines={1}>
              {facts.join(" · ")}
            </Text>
            {recap.files.length ? <Facts t={t} facts={[`+${added} −${removed}`]} size={m.text} /> : null}
            {recap.failed.length ? <Text style={{ fontSize: m.text - 1, color: t.c.statusWarning }}>{recap.failed.length} failed</Text> : null}
          </>
        }
        body={
          <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 4 }}>
            {recap.error ? <Text selectable style={{ fontSize: m.code, color: t.c.statusDanger }}>{recap.error}</Text> : null}
            {recap.files.map((file) => (
              <View key={file.path} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Icon name="FilePen" size={12} color={t.c.foregroundMuted} />
                <Text style={{ flex: 1, fontSize: m.code, fontFamily: MONO, color: t.c.foreground }} numberOfLines={1}>
                  {look.paths === "relative" ? relativePath(file.path, folder) : file.path}
                </Text>
                <Facts t={t} facts={[`+${file.added} −${file.removed}`]} size={m.text} />
              </View>
            ))}
            {recap.failed.map((command, index) => (
              <View key={index} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Icon name="CircleX" size={12} color={t.c.statusDanger} />
                <Text style={{ flex: 1, fontSize: m.code, fontFamily: MONO, color: t.c.foreground }} numberOfLines={1}>
                  {command.command}
                </Text>
                {command.exitCode !== null ? <Text style={{ fontSize: m.text - 1, color: t.c.statusDanger }}>exit {command.exitCode}</Text> : null}
              </View>
            ))}
          </View>
        }
      />
    );
  };
}
