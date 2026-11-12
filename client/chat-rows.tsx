import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { type ChatLook, chatLook, relativePath } from "../shared/chat-view";
import { createValueStore, useValue, type ValueStore } from "./profile-store";
import { alpha, Expand, PMONO, Row, useIndent, useSpacing, useStyles } from "./polish/rows/row";

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

// The turn recap: "Worked 38m 34s  1 file +40 −2 · 25 calls", drawn with the same row as the merged steps around it (icon slot,
// text, hover, chevron, spacing), so it lines up with them and with Paseo's own rows. It opens to the files and failed commands.
// `look` is fixed for the settings preview; the chat passes none and follows recapLook.
export function createRecapRow(actions: RowActions | null, fixedLook?: ChatLook) {
  return function RecapRow({ agentId, item, theme, layout }: PluginTimelineItemProps<z.output<typeof recapRowSchema>>) {
    const liveLook = useValue(recapLook);
    const look = fixedLook ?? liveLook;
    const s = useStyles(theme);
    const c = theme.colors;
    const spacing = useSpacing();
    const icons = !!useIndent("steps");
    const [open, setOpen] = useState(false);
    const recap = item.data;
    const added = recap.files.reduce((sum, file) => sum + file.added, 0);
    const removed = recap.files.reduce((sum, file) => sum + file.removed, 0);
    const folder = actions?.workspaceFolder(agentId) ?? null;
    const canOpen = recap.files.length > 0 || recap.failed.length > 0 || !!recap.error;
    const lead = recap.outcome === "canceled" ? "Stopped after" : recap.outcome === "failed" ? "Failed after" : "Worked";
    const verb = recap.seconds !== null ? `${lead} ${duration(recap.seconds)}` : recap.outcome === "failed" ? "Failed" : recap.outcome === "canceled" ? "Stopped" : "Worked";
    const files = recap.files.length ? [`${recap.files.length} ${recap.files.length === 1 ? "file" : "files"}`, added ? `+${added}` : "", removed ? `−${removed}` : ""].filter(Boolean).join(" ") : null;
    const calls = recap.calls ? `${recap.calls} ${recap.calls === 1 ? "call" : "calls"}` : null;
    const target = [files, calls].filter(Boolean).join(" · ") || undefined;
    const icon = recap.outcome === "failed" ? "CircleX" : recap.outcome === "canceled" ? "CircleStop" : "FileDiff";
    return (
      <View style={spacing}>
        <Row
          theme={theme}
          compact={layout.compact}
          kind="steps"
          icon={icon}
          iconColor={recap.outcome === "failed" ? c.statusDanger : undefined}
          verb={verb}
          target={target}
          prose
          meta={recap.failed.length ? `${recap.failed.length} failed` : undefined}
          metaColor={c.statusDanger}
          open={open}
          onToggle={canOpen ? () => setOpen(!open) : undefined}
        />
        <Expand open={open} style={{ marginLeft: icons ? 9 : 0, paddingLeft: icons ? 15 : 13, paddingTop: 3, paddingBottom: 3, gap: 4, borderLeftWidth: 1, borderLeftColor: alpha(c.border, 0.6) }}>
          {() => (
            <>
              {recap.error ? <Text selectable style={[s.target, { color: c.statusDanger }]}>{recap.error}</Text> : null}
              {recap.files.map((file) => (
                <View key={file.path} style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
                  <Text {...PMONO} style={[s.target, s.mono, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="middle">
                    {look.paths === "relative" ? relativePath(file.path, folder) : file.path}
                  </Text>
                  {file.added ? <Text style={[s.meta, { marginLeft: 0, color: c.statusSuccess }]}>+{file.added}</Text> : null}
                  {file.removed ? <Text style={[s.meta, { marginLeft: 0, color: c.statusDanger }]}>−{file.removed}</Text> : null}
                </View>
              ))}
              {recap.failed.map((command, index) => (
                <View key={index} style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
                  <Text {...PMONO} style={[s.target, s.mono, { flexShrink: 1 }]} numberOfLines={1}>
                    {command.command}
                  </Text>
                  {command.exitCode !== null ? <Text style={[s.meta, { marginLeft: 0, color: c.statusDanger }]}>exit {command.exitCode}</Text> : null}
                </View>
              ))}
            </>
          )}
        </Expand>
      </View>
    );
  };
}
