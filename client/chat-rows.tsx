import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { type ReactNode, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { z } from "zod";
import { type ChatLook, chatLook, relativePath } from "../shared/chat-view";
import { createValueStore, useValue, type ValueStore } from "./profile-store";
import { Icon, type Tokens, useTokens } from "./ui/kit";

// What Morphise's chat rows can do beyond drawing, and the turn recap row. The rows themselves are
// Chat Polish's design (client/polish/rows/); prompts and replies are never drawn here, so Paseo's
// Fork and Copy on them always stay.

// Read files on the daemon, open the Details panel, and know the chat's workspace folder (for
// relative paths). Null in the settings preview.
export interface RowActions {
  readImage(path: string): Promise<{ ok: true; dataUri: string } | { ok: false; reason: string }>;
  reveal(path: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  openDetails(agentId: string, details: { title: string; body: string; bodyKind: "output" | "diff" | "content"; path: string | null }): Promise<{ ok: true } | { ok: false; reason: string }>;
  workspaceFolder(agentId: string): string | null;
}

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

// Paseo leaves 16pt under every plugin row (getGapBetweenStreamItems returns SPACING[4] = 16 for
// them, checked in Paseo 0.16's app), while its own tool, thought and plan rows sit with no gap.
// The recap takes most of it back; the spacing setting decides how much stays.
const PASEO_ROW_GAP = 16;

const SIZES = { small: 11, medium: 12, large: 14 } as const;

function metrics(look: ChatLook) {
  const text = SIZES[look.textSize];
  const code = SIZES[look.codeSize];
  const gap = look.density === "compact" ? 2 : look.density === "spacious" ? 10 : 5;
  return { text, code, rowHeight: Math.round(text * 2.1), pull: gap - PASEO_ROW_GAP };
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

// The chat look the recap rows draw with, set by the chat-row section whenever the Chat settings
// change. The recap's renderer is registered once and reads it here, so it never goes missing while
// the chat rows re-register (Paseo would show "Plugin timeline item unavailable" meanwhile).
export const recapLook: ValueStore<ChatLook> = createValueStore(chatLook(undefined));

// The turn recap, drawn like Chat Polish's recap row (see NOTICE.md): one quiet line that hugs its
// content, without a fill, faded until hovered or open; it opens to the files and failed commands.
// `look` is fixed for the settings preview; the chat passes none and follows recapLook.
export function createRecapRow(actions: RowActions | null, fixedLook?: ChatLook) {
  return function RecapRow({ agentId, item, theme, layout }: PluginTimelineItemProps<z.output<typeof recapRowSchema>>) {
    const liveLook = useValue(recapLook);
    const look = fixedLook ?? liveLook;
    const t = useTokens(theme, layout.compact);
    const m = metrics(look);
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const recap = item.data;
    const added = recap.files.reduce((sum, file) => sum + file.added, 0);
    const removed = recap.files.reduce((sum, file) => sum + file.removed, 0);
    const folder = actions?.workspaceFolder(agentId) ?? null;
    const canOpen = recap.files.length > 0 || recap.failed.length > 0 || !!recap.error;
    const size = m.text - 1;
    const muted = { fontSize: size, color: t.c.foregroundMuted };
    const lead = recap.outcome === "canceled" ? "Stopped after" : recap.outcome === "failed" ? "Failed after" : "Worked";
    const parts: ReactNode[] = [];
    if (recap.seconds !== null) parts.push(<Text key="time" style={muted}>{`${lead} ${duration(recap.seconds)}`}</Text>);
    else if (recap.outcome !== "completed") parts.push(<Text key="time" style={{ ...muted, color: t.c.statusDanger }}>{recap.outcome === "failed" ? "Failed" : "Stopped"}</Text>);
    if (recap.files.length)
      parts.push(
        <View key="files" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: size, color: t.c.foreground }}>{`${recap.files.length} ${recap.files.length === 1 ? "file" : "files"}`}</Text>
          {added ? <Text style={{ fontSize: size, fontFamily: MONO, color: t.c.statusSuccess }}>+{added}</Text> : null}
          {removed ? <Text style={{ fontSize: size, fontFamily: MONO, color: t.c.statusDanger }}>−{removed}</Text> : null}
        </View>,
      );
    if (recap.calls) parts.push(<Text key="calls" style={muted}>{`${recap.calls} ${recap.calls === 1 ? "call" : "calls"}`}</Text>);
    if (recap.failed.length)
      parts.push(
        <View key="failed" style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.statusDanger }} />
          <Text style={{ fontSize: size, color: t.c.statusDanger }}>{`${recap.failed.length} failed`}</Text>
        </View>,
      );
    const icon = recap.outcome === "failed" ? "CircleX" : recap.outcome === "canceled" ? "CircleStop" : "FileDiff";
    return (
      <View style={{ marginBottom: m.pull }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Turn recap: ${[recap.seconds !== null ? `${lead} ${duration(recap.seconds)}` : recap.outcome, recap.files.length ? `${recap.files.length} files, +${added} −${removed}` : null, recap.calls ? `${recap.calls} calls` : null, recap.failed.length ? `${recap.failed.length} failed` : null].filter(Boolean).join(", ")}`}
          disabled={!canOpen}
          onPress={() => setOpen(!open)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: m.rowHeight, alignSelf: "flex-start", paddingHorizontal: 4, opacity: hovered || open ? 1 : 0.85 }}
        >
          <View style={{ width: 16, alignItems: "center" }}>
            <Icon name={icon} size={m.text + 1} color={recap.outcome === "failed" ? t.c.statusDanger : look.accent ?? t.c.foregroundMuted} />
          </View>
          {parts.flatMap((part, index) => (index ? [<Text key={`dot${index}`} style={muted}>·</Text>, part] : [part]))}
          {canOpen ? <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={t.c.foregroundMuted} /> : null}
        </Pressable>
        {open ? (
          <View style={{ marginLeft: 28, marginTop: 2, gap: 4 }}>
            {recap.error ? <Text selectable style={{ fontSize: m.code, color: t.c.statusDanger }}>{recap.error}</Text> : null}
            {recap.files.map((file) => (
              <View key={file.path} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={{ flexShrink: 1, fontSize: m.code, fontFamily: MONO, color: t.c.foreground }} numberOfLines={1}>
                  {look.paths === "relative" ? relativePath(file.path, folder) : file.path}
                </Text>
                {file.added ? <Text style={{ fontSize: size, fontFamily: MONO, color: t.c.statusSuccess }}>+{file.added}</Text> : null}
                {file.removed ? <Text style={{ fontSize: size, fontFamily: MONO, color: t.c.statusDanger }}>−{file.removed}</Text> : null}
              </View>
            ))}
            {recap.failed.map((command, index) => (
              <View key={index} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.statusDanger }} />
                <Text style={{ flexShrink: 1, fontSize: m.code, fontFamily: MONO, color: t.c.foreground }} numberOfLines={1}>
                  {command.command}
                </Text>
                {command.exitCode !== null ? <Text style={{ fontSize: size, color: t.c.statusDanger }}>exit {command.exitCode}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };
}
