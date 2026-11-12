import type { PluginClientContext, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { readText } from "../shared/files";
import { createValueStore, type ValueStore, useValue } from "./profile-store";
import { Button, Icon, useTokens } from "./ui/kit";

// The Details tab: a tool row's whole output, diff or content, or a file it touched read from the
// daemon, with line numbers. Opened from a row's Details or Open file; it shows the latest one.

export const DETAILS_PANEL_ID = "details";
// Lines drawn at most; enough for most files, few enough that the panel stays responsive.
export const DETAILS_MAX_LINES = 5000;

export interface Details {
  workspaceId: string;
  title: string;
  body: string;
  bodyKind: "output" | "diff" | "content";
  // A file to read and show, when the row was about one and the body is not the file itself.
  path: string | null;
}

export const detailsStore: ValueStore<Details | null> = createValueStore<Details | null>(null);

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, monospace" });

export function createDetailsPanel(client: PluginClientContext) {
  return function DetailsPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
    const t = useTokens(theme, layout.compact);
    const toast = useToast();
    const stored = useValue(detailsStore);
    const details = stored && stored.workspaceId === workspaceId ? stored : null;
    const [file, setFile] = useState<{ path: string; text: string; truncated: boolean } | { path: string; reason: string } | null>(null);
    useEffect(() => {
      if (!details?.path || details.body) return setFile(null);
      let alive = true;
      const path = details.path;
      client.rpc(readText, { path }).then(
        (result) => alive && setFile(result.ok ? { path, text: result.text, truncated: result.truncated } : { path, reason: result.reason }),
        (error: unknown) => alive && setFile({ path, reason: String(error) }),
      );
      return () => {
        alive = false;
      };
    }, [details?.path, details?.body]);
    if (!details) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24, backgroundColor: theme.colors.surface0 }}>
          <Icon name="PanelRight" size={22} color={theme.colors.foregroundMuted} />
          <Text style={t.text.small}>Press Details or Open file on a tool row in this workspace's chat.</Text>
        </View>
      );
    }
    const text = details.body || (file && "text" in file ? file.text : "");
    const allLines = text.replace(/\n$/, "").split("\n");
    // Each line is its own row, so a long file is cut; Copy still copies all of it.
    const lines = allLines.slice(0, DETAILS_MAX_LINES);
    const numberWidth = String(lines.length).length * 8 + 12;
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.c.border }}>
          <Text style={{ flex: 1, fontSize: 13, color: t.c.foreground, fontFamily: MONO }} numberOfLines={1}>
            {details.title}
          </Text>
          {text ? <Button t={t} variant="ghost" icon="Copy" label="Copy" onPress={() => void copyText(text).then(() => toast.show("Copied"), (error: unknown) => toast.error(String(error)))} /> : null}
        </View>
        {file && "reason" in file ? <Text style={[t.text.danger, { padding: 12 }]}>Could not read {file.path}: {file.reason}</Text> : null}
        {!text && details.path && !file ? <Text style={[t.text.small, { padding: 12 }]}>Reading {details.path}...</Text> : null}
        {file && "truncated" in file && file.truncated ? <Text style={[t.text.small, { paddingHorizontal: 12, paddingTop: 8 }]}>Showing the first 1 MB.</Text> : null}
        {allLines.length > DETAILS_MAX_LINES ? <Text style={[t.text.small, { paddingHorizontal: 12, paddingTop: 8 }]}>Showing the first {DETAILS_MAX_LINES.toLocaleString()} of {allLines.length.toLocaleString()} lines; Copy copies all of them.</Text> : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
          <ScrollView horizontal>
            <View>
              {text
                ? lines.map((line, index) => {
                    const diff = details.bodyKind === "diff" ? (line.startsWith("+") ? t.c.statusSuccess : line.startsWith("-") ? t.c.statusDanger : null) : null;
                    return (
                      <View key={index} style={{ flexDirection: "row" }}>
                        {diff ? <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: diff, opacity: 0.12 }} /> : null}
                        <Text style={{ width: numberWidth, paddingRight: 8, textAlign: "right", fontSize: 12, lineHeight: 19, color: t.c.foregroundMuted, fontFamily: MONO }}>{index + 1}</Text>
                        <Text selectable style={{ paddingRight: 16, fontSize: 12, lineHeight: 19, color: t.c.foreground, fontFamily: MONO }}>
                          {line || " "}
                        </Text>
                      </View>
                    );
                  })
                : null}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    );
  };
}
