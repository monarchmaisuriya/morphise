import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { turnDetailsLine } from "../shared/turn-details";
import { shortPath } from "./polish/rows/model";
import { alpha, Expand, Row, useIndent, useSpacing, useStyles } from "./polish/rows/row";

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
  // Since 0.19: the model, thinking level and token use Paseo reported when the turn ended.
  details: z
    .object({
      model: z.string().nullable(),
      thinking: z.string().nullable(),
      usage: z.object({ input: z.number().nullable(), cached: z.number().nullable(), output: z.number().nullable(), cost: z.number().nullable() }).nullable(),
    })
    .nullable()
    .optional(),
});



// Paseo leaves this much space under every plugin row (getGapBetweenStreamItems, Paseo 0.16); a recap with nothing to say
// takes it back so it leaves no hole.
const PASEO_ROW_GAP = 16;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// The turn recap: what the turn left behind, drawn with the same rows as merged steps so it lines up with them.
// "Changed 3 files +40 −2" (and "1 command failed"), opening to an "Edited" row per file and a "Ran" row per failed
// command, as the steps list draws them. Paseo's own footer already says how long the turn took, so the recap does
// not; a turn that changed nothing and had no failure has no recap. Its look is the chat rows' (useRowSetup).
export function RecapRow({ item, theme, layout }: PluginTimelineItemProps<z.output<typeof recapRowSchema>>) {
    const s = useStyles(theme);
    const c = theme.colors;
    const spacing = useSpacing();
    const icons = !!useIndent("steps");
    const [open, setOpen] = useState(false);
    const recap = item.data;
    const ended = recap.outcome === "failed" ? "Failed" : recap.outcome === "canceled" ? "Stopped" : null;
    // Recaps added before 0.18.1 exist for turns that changed nothing; they draw nothing now.
    if (!recap.files.length && !recap.failed.length && !ended) return <View style={{ marginBottom: -PASEO_ROW_GAP }} />;
    const added = recap.files.reduce((sum, file) => sum + file.added, 0);
    const removed = recap.files.reduce((sum, file) => sum + file.removed, 0);
    const failedWords = recap.failed.length ? `${plural(recap.failed.length, "command", "commands")} failed` : null;
    const verb = recap.files.length ? `Changed ${plural(recap.files.length, "file", "files")}` : ended ?? failedWords!;
    const target = recap.files.length ? [added ? `+${added}` : "", removed ? `−${removed}` : ""].filter(Boolean).join(" ") || undefined : ended ? recap.error || undefined : undefined;
    const meta = [recap.files.length || ended ? failedWords : null, recap.files.length ? ended : null].filter(Boolean).join(" · ") || undefined;
    const icon = recap.outcome === "failed" ? "CircleX" : recap.outcome === "canceled" ? "CircleStop" : recap.files.length ? "FileDiff" : "SquareTerminal";
    const danger = !recap.files.length;
    const detailsLine = turnDetailsLine(recap);
    const canOpen = recap.files.length > 0 || recap.failed.length > 0 || (!!recap.error && recap.files.length > 0);
    return (
      <View style={spacing}>
        <Row
          theme={theme}
          compact={layout.compact}
          kind="steps"
          icon={icon}
          iconColor={danger ? c.statusDanger : undefined}
          verb={verb}
          target={target}
          mono={!!recap.files.length}
          prose={!recap.files.length}
          meta={meta}
          metaColor={c.statusDanger}
          open={open}
          onToggle={canOpen ? () => setOpen(!open) : undefined}
        />
        <Expand open={open} style={{ marginLeft: icons ? 9 : 0, paddingLeft: icons ? 15 : 13, paddingTop: 3, paddingBottom: 3, borderLeftWidth: 1, borderLeftColor: alpha(c.border, 0.6) }}>
          {() => (
            <>
              {detailsLine ? <Text selectable style={[s.target, { paddingVertical: 2 }]}>{detailsLine}</Text> : null}
              {recap.error && recap.files.length ? <Text selectable style={[s.target, { color: c.statusDanger }]}>{recap.error}</Text> : null}
              {recap.files.map((file) => (
                <Row key={file.path} theme={theme} compact={layout.compact} kind="tool" icon="Pencil" verb="Edited" target={shortPath(file.path)} mono meta={[file.added ? `+${file.added}` : "", file.removed ? `−${file.removed}` : ""].filter(Boolean).join(" ") || undefined} />
              ))}
              {recap.failed.map((command, index) => (
                <Row key={index} theme={theme} compact={layout.compact} kind="tool" icon="SquareTerminal" verb="Ran" target={command.command} mono shell meta={command.exitCode !== null ? `exit ${command.exitCode}` : "failed"} metaColor={c.statusDanger} />
              ))}
            </>
          )}
        </Expand>
      </View>
    );
}
