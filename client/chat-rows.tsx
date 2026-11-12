import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { type ReactNode, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { z } from "zod";
import { type ChatLook, relativePath } from "../shared/chat-view";
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
const STRENGTH = { full: 1, soft: 0.85, faded: 0.65, dim: 0.45 } as const;

function metrics(look: ChatLook) {
  const text = SIZES[look.textSize];
  const code = SIZES[look.codeSize];
  const gap = look.density === "compact" ? 2 : look.density === "spacious" ? 10 : 5;
  return { text, code, rowHeight: Math.round(text * 2.1), pull: gap - PASEO_ROW_GAP };
}

function Facts({ t, facts, size }: { t: Tokens; facts: string[]; size: number }) {
  return (
    <>
      {facts.map((fact) => {
        const diff = /^\+(\d+) −(\d+)$/.exec(fact);
        return diff ? (
          <Text key={fact} style={{ fontSize: size - 1, fontFamily: MONO }}>
            <Text style={{ color: t.c.statusSuccess }}>+{diff[1]}</Text> <Text style={{ color: t.c.statusDanger }}>−{diff[2]}</Text>
          </Text>
        ) : (
          <Text key={fact} style={{ fontSize: size - 1, color: t.c.foregroundMuted }}>
            {fact}
          </Text>
        );
      })}
    </>
  );
}

// The recap's frame: the icon column, the header line, and (opened) the details on a soft card.
// Faded rows come to full strength on hover.
function RowFrame({ t, look, icon, header, open, onToggle, canOpen, body, label }: { t: Tokens; look: ChatLook; icon: ReactNode; header: ReactNode; open: boolean; onToggle(): void; canOpen: boolean; body: ReactNode; label: string }) {
  const m = metrics(look);
  const [hovered, setHovered] = useState(false);
  const strength = hovered || open ? 1 : STRENGTH[look.strength];
  return (
    <View style={{ marginBottom: m.pull, marginTop: 1, borderRadius: 8, backgroundColor: t.c.surface1, overflow: "hidden", opacity: strength }}>
      <Pressable
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        disabled={!canOpen}
        onPress={onToggle}
        style={({ pressed, hovered: over }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: m.rowHeight, paddingHorizontal: 10, backgroundColor: pressed || over ? t.c.surface2 : "transparent" })}
      >
        {look.labels !== "label" ? <View style={{ width: 16, alignItems: "center" }}>{icon}</View> : null}
        {header}
        {canOpen ? <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={t.c.foregroundMuted} /> : null}
      </Pressable>
      {open ? <View style={{ borderTopWidth: 1, borderTopColor: t.c.border, backgroundColor: t.c.surface0 }}>{body}</View> : null}
    </View>
  );
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
