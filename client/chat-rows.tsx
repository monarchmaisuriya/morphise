import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Animated, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";
import { TOOL_KINDS, type ToolKind } from "../shared/chat-view";
import { Icon, type Tokens, useTokens } from "./ui/kit";
import { usePulse } from "./ui/pulse";

// Morphise's own chat rows, drawn in place of Paseo's when the Chat settings ask: a tool call as
// one line that opens to show its output, and thinking folded to one line that opens to show it.

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
});
export const thinkingRowSchema = z.object({ text: z.string() });

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

function StatusMark({ t, status }: { t: Tokens; status: z.output<typeof toolRowSchema>["status"] }) {
  const pulse = usePulse(status === "running");
  if (status === "running") return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.c.foreground, opacity: pulse }} />;
  if (status === "failed") return <Icon name="CircleX" size={12} color={t.c.statusDanger} />;
  if (status === "canceled") return <Icon name="CircleSlash" size={12} color={t.c.foregroundMuted} />;
  return <Icon name="Check" size={12} color={t.c.foregroundMuted} />;
}

// A tool call in one line: what ran and on what, with its status. Pressing it shows the output,
// diff or error, when there is one.
export function ToolRow({ item, theme, layout }: PluginTimelineItemProps<z.output<typeof toolRowSchema>>) {
  const t = useTokens(theme, layout.compact);
  const [open, setOpen] = useState(false);
  const data = item.data;
  const more = data.body || data.error;
  return (
    <View style={{ gap: 4, paddingVertical: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${data.name}${data.subject ? `: ${data.subject}` : ""}, ${data.status}`}
        disabled={!more}
        onPress={() => setOpen(!open)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26, paddingHorizontal: 6, borderRadius: 6, backgroundColor: pressed || hovered ? t.c.surface1 : "transparent" })}
      >
        <Icon name={KIND_ICONS[data.kind]} size={13} color={t.c.foregroundMuted} />
        <Text style={{ fontSize: 12, color: t.c.foregroundMuted }}>{data.name}</Text>
        <Text style={{ flex: 1, fontSize: 12, color: t.c.foreground, fontFamily: data.subject ? MONO : undefined }} numberOfLines={1}>
          {data.subject}
        </Text>
        <StatusMark t={t} status={data.status} />
        {more ? <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={t.c.foregroundMuted} /> : null}
      </Pressable>
      {open && more ? (
        <ScrollView nestedScrollEnabled style={{ maxHeight: 320, marginLeft: 27, borderRadius: 8, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }} contentContainerStyle={{ padding: 10, gap: 6 }}>
          {data.error ? (
            <Text selectable style={{ fontSize: 12, lineHeight: 18, color: t.c.statusDanger, fontFamily: MONO }}>
              {data.error}
            </Text>
          ) : null}
          {data.body ? (
            <Text selectable style={{ fontSize: 12, lineHeight: 18, color: t.c.foreground, fontFamily: MONO }}>
              {data.body}
            </Text>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

// Thinking folded to one line with its opening words; pressing it shows all of it.
export function ThinkingRow({ item, theme, layout }: PluginTimelineItemProps<z.output<typeof thinkingRowSchema>>) {
  const t = useTokens(theme, layout.compact);
  const [open, setOpen] = useState(false);
  const firstLine = item.data.text.trim().split("\n")[0] ?? "";
  return (
    <View style={{ gap: 4, paddingVertical: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Hide the thinking" : "Show the thinking"}
        onPress={() => setOpen(!open)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26, paddingHorizontal: 6, borderRadius: 6, backgroundColor: pressed || hovered ? t.c.surface1 : "transparent" })}
      >
        <Icon name="Brain" size={13} color={t.c.foregroundMuted} />
        <Text style={{ fontSize: 12, color: t.c.foregroundMuted }}>Thinking</Text>
        <Text style={{ flex: 1, fontSize: 12, color: t.c.foregroundMuted, fontStyle: "italic" }} numberOfLines={1}>
          {open ? "" : firstLine}
        </Text>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={t.c.foregroundMuted} />
      </Pressable>
      {open ? (
        <View style={{ marginLeft: 27, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: t.c.border }}>
          <Markdown>{item.data.text}</Markdown>
        </View>
      ) : null}
    </View>
  );
}
