import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Animated, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";
import { type ChatLook, diffLines, foldLines, startsOpen, TOOL_KINDS, type ToolKind, toolVerb } from "../shared/chat-view";
import { Icon, type Tokens, useTokens } from "./ui/kit";
import { usePulse } from "./ui/pulse";

// Morphise's own chat rows, drawn in place of Paseo's when the Chat settings ask: tool calls as
// cards or single lines that open to show their output, diff or error, and thinking as a card
// that is open while it streams. Sizes and spacing follow the Chat settings' look options.

export const TOOL_ROW_KIND = "tool-call";
export const THINKING_ROW_KIND = "thinking";

export const toolRowSchema = z.object({
  kind: z.enum(TOOL_KINDS),
  detail: z.string(),
  name: z.string(),
  subject: z.string(),
  status: z.enum(["running", "completed", "failed", "canceled"]),
  error: z.string(),
  body: z.string(),
  bodyKind: z.enum(["output", "diff", "content"]),
  facts: z.array(z.string()),
  style: z.enum(["cards", "compact"]),
});
export const thinkingRowSchema = z.object({ text: z.string(), streaming: z.boolean() });

type ToolData = z.output<typeof toolRowSchema>;

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

const KIND_ICONS: Record<ToolKind, string> = {
  shell: "SquareTerminal",
  read: "FileText",
  edit: "FilePen",
  search: "Search",
  fetch: "Globe",
  sub_agent: "Bot",
  other: "Wrench",
};

// Text sizes and spacing for the look options.
function metrics(look: ChatLook) {
  const base = look.textSize === "small" ? 11 : look.textSize === "large" ? 14 : 12;
  const pad = look.density === "compact" ? 2 : look.density === "spacious" ? 8 : 4;
  return { text: base, mono: base, line: Math.round(base * 1.5), pad, headerHeight: base + 14 + pad };
}

const clock = (at: Date) => at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function StatusMark({ t, status }: { t: Tokens; status: ToolData["status"] }) {
  const pulse = usePulse(status === "running");
  if (status === "running") return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.c.foreground, opacity: pulse }} />;
  if (status === "failed") return <Icon name="CircleX" size={13} color={t.c.statusDanger} />;
  if (status === "canceled") return <Icon name="CircleSlash" size={13} color={t.c.foregroundMuted} />;
  return <Icon name="Check" size={13} color={t.c.foregroundMuted} />;
}

function Fact({ t, text, size }: { t: Tokens; text: string; size: number }) {
  // "+12 −3" reads in the diff colours; the rest are muted.
  const diff = /^\+(\d+) −(\d+)$/.exec(text);
  return (
    <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: t.c.surface2 }}>
      {diff ? (
        <>
          <Text style={{ fontSize: size - 1, color: t.c.statusSuccess, fontFamily: MONO }}>+{diff[1]}</Text>
          <Text style={{ fontSize: size - 1, color: t.c.statusDanger, fontFamily: MONO }}>−{diff[2]}</Text>
        </>
      ) : (
        <Text style={{ fontSize: size - 1, color: t.c.foregroundMuted }}>{text}</Text>
      )}
    </View>
  );
}

// A tinted line background: the colour drawn faint behind the row.
function Tint({ color }: { color: string }) {
  return <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: color, opacity: 0.12 }} />;
}

function DiffView({ t, body, size }: { t: Tokens; body: string; size: number }) {
  const lines = diffLines(body);
  const width = Math.max(2, String(Math.max(...lines.map((line) => line.newLine ?? line.oldLine ?? 0))).length) * (size * 0.62) + 8;
  return (
    <View>
      {lines.map((line, index) => {
        const color = line.kind === "add" ? t.c.statusSuccess : line.kind === "remove" ? t.c.statusDanger : null;
        return (
          <View key={index} style={{ flexDirection: "row" }}>
            {color ? <Tint color={color} /> : null}
            <Text style={{ width, textAlign: "right", paddingRight: 8, fontSize: size - 1, lineHeight: size * 1.6, color: t.c.foregroundMuted, fontFamily: MONO }}>{line.kind === "hunk" ? "" : line.newLine ?? line.oldLine ?? ""}</Text>
            <Text style={{ width: size, fontSize: size, lineHeight: size * 1.6, color: color ?? t.c.foregroundMuted, fontFamily: MONO }}>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}</Text>
            <Text selectable style={{ flex: 1, fontSize: size, lineHeight: size * 1.6, color: line.kind === "hunk" ? t.c.foregroundMuted : t.c.foreground, fontFamily: MONO }}>
              {line.text || " "}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// The opened part of a tool row: the error, then the output, diff or content, folded to its first
// and last lines when long, with Copy.
function ToolBody({ t, data, look }: { t: Tokens; data: ToolData; look: ChatLook }) {
  const toast = useToast();
  const [all, setAll] = useState(false);
  const m = metrics(look);
  const folded = data.bodyKind === "diff" ? null : foldLines(data.body, all ? null : look.outputLines);
  const lineStyle = { fontSize: m.mono, lineHeight: m.line, color: t.c.foreground, fontFamily: MONO } as const;
  const copy = () => void copyText(data.body || data.error).then(() => toast.show("Copied"), (error: unknown) => toast.error(String(error)));
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: t.c.border }}>
      {data.error ? (
        <View style={{ paddingLeft: 10, paddingRight: 36, paddingVertical: 8 }}>
          <Tint color={t.c.statusDanger} />
          <Text selectable style={[lineStyle, { color: t.c.statusDanger }]}>
            {data.error}
          </Text>
        </View>
      ) : null}
      {data.body ? (
        <ScrollView nestedScrollEnabled style={{ maxHeight: 420 }} contentContainerStyle={{ paddingLeft: 10, paddingRight: data.error ? 10 : 36, paddingVertical: 8 }}>
          {data.bodyKind === "diff" ? (
            <DiffView t={t} body={data.body} size={m.mono} />
          ) : folded ? (
            <>
              <Text selectable style={lineStyle}>{folded.head.join("\n")}</Text>
              {folded.hidden ? (
                <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={{ alignSelf: "flex-start", marginVertical: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: t.c.surface2 }}>
                  <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>Show all · {folded.hidden} more lines</Text>
                </Pressable>
              ) : null}
              {folded.tail.length ? <Text selectable style={lineStyle}>{folded.tail.join("\n")}</Text> : null}
            </>
          ) : null}
        </ScrollView>
      ) : null}
      {data.body || data.error ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Copy the output" onPress={copy} hitSlop={6} style={{ position: "absolute", top: 6, right: 8, padding: 4, borderRadius: 6, backgroundColor: t.c.surface1 }}>
          <Icon name="Copy" size={12} color={t.c.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function createToolRow(look: ChatLook) {
  return function ToolRow({ item, timestamp, theme, layout }: PluginTimelineItemProps<ToolData>) {
    const t = useTokens(theme, layout.compact);
    const data = item.data;
    // The user's own open or fold wins; until then the fold rule decides, so a running call that
    // finishes folds by itself.
    const [chosen, setChosen] = useState<boolean | null>(null);
    const open = chosen ?? startsOpen(look.fold, data.status);
    const more = !!(data.body || data.error);
    const m = metrics(look);
    const verb = toolVerb(data);
    const card = data.style === "cards";
    const header = (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${verb || data.name}${data.subject ? ` ${data.subject}` : ""}, ${data.status}`}
        disabled={!more}
        onPress={() => setChosen(!open)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: m.headerHeight, paddingHorizontal: card ? 10 : 6, backgroundColor: !card && (pressed || hovered) ? t.c.surface1 : "transparent", borderRadius: card ? 0 : 6 })}
      >
        <Icon name={KIND_ICONS[data.kind]} size={m.text + 2} color={data.status === "failed" ? t.c.statusDanger : t.c.foregroundMuted} />
        <Text style={{ fontSize: m.text, color: t.c.foregroundMuted }}>{verb || data.name}</Text>
        <Text style={{ flex: 1, fontSize: m.text, color: t.c.foreground, fontFamily: data.subject ? MONO : undefined }} numberOfLines={1}>
          {data.subject}
        </Text>
        {data.facts.map((fact) => (
          <Fact key={fact} t={t} text={fact} size={m.text} />
        ))}
        {look.timestamps ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{clock(timestamp)}</Text> : null}
        <StatusMark t={t} status={data.status} />
        {more ? <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={t.c.foregroundMuted} /> : null}
      </Pressable>
    );
    if (!card) {
      return (
        <View style={{ paddingVertical: m.pad / 2 }}>
          {header}
          {open && more ? (
            <View style={{ marginLeft: 28, marginTop: 2, borderRadius: 8, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1, overflow: "hidden" }}>
              <ToolBody t={t} data={data} look={look} />
            </View>
          ) : null}
        </View>
      );
    }
    return (
      <View style={{ marginVertical: m.pad, borderRadius: 10, borderWidth: 1, borderColor: data.status === "failed" ? t.c.statusDanger : t.c.border, backgroundColor: t.c.surface1, overflow: "hidden", maxWidth: 820 }}>
        {header}
        {open && more ? <ToolBody t={t} data={data} look={look} /> : null}
      </View>
    );
  };
}

// Thinking as a card: open while the model is thinking (unless the fold rule says always folded),
// folded to its opening line once done; pressing it opens or folds it.
export function createThinkingRow(look: ChatLook) {
  return function ThinkingRow({ item, timestamp, theme, layout }: PluginTimelineItemProps<z.output<typeof thinkingRowSchema>>) {
    const t = useTokens(theme, layout.compact);
    const [chosen, setChosen] = useState<boolean | null>(null);
    const open = chosen ?? startsOpen(look.fold, item.data.streaming ? "running" : "completed");
    const pulse = usePulse(item.data.streaming);
    const m = metrics(look);
    const firstLine = item.data.text.trim().split("\n")[0]?.replace(/^[#*\s]+|\*+$/g, "") ?? "";
    const words = item.data.text.trim() ? item.data.text.trim().split(/\s+/).length : 0;
    return (
      <View style={{ marginVertical: m.pad / 2, borderLeftWidth: 2, borderLeftColor: t.c.border, paddingLeft: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? "Fold the thinking" : "Open the thinking"}
          onPress={() => setChosen(!open)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: m.headerHeight }}
        >
          <Animated.View style={{ opacity: item.data.streaming ? pulse : 1 }}>
            <Icon name="Brain" size={m.text + 2} color={t.c.foregroundMuted} />
          </Animated.View>
          <Text style={{ fontSize: m.text, color: t.c.foregroundMuted, fontWeight: "600" }}>{item.data.streaming ? "Thinking" : "Thought"}</Text>
          <Text style={{ flex: 1, fontSize: m.text, color: t.c.foregroundMuted, fontStyle: "italic" }} numberOfLines={1}>
            {open ? "" : firstLine}
          </Text>
          {words ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{words} words</Text> : null}
          {look.timestamps ? <Text style={{ fontSize: m.text - 1, color: t.c.foregroundMuted }}>{clock(timestamp)}</Text> : null}
          <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={t.c.foregroundMuted} />
        </Pressable>
        {open ? (
          <View style={{ paddingBottom: m.pad, opacity: 0.85 }}>
            <Markdown>{item.data.text}</Markdown>
          </View>
        ) : null}
      </View>
    );
  };
}
