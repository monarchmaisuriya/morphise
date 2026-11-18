// What every settings preview shares: the props a timeline row is drawn with, and a one-line note.
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Platform, Text } from "react-native";
import { fontSize } from "../../../shared/design/tokens";

const PREVIEW_TIME = new Date(0);

// The props Paseo passes a plugin's timeline row, for drawing a real row with sample data.
// Previews draw real timeline rows inside Paseo's Settings, which is not a plugin host: a row they draw must not call
// plugin state hooks (useAgent, useWorkspace, useWorkspaces...), which throw there; chat-only data comes from the chat's
// own wrapper (as createHtmlItem does for a page's workspace).
export function rowProps<Data>(theme: PluginTheme, compact: boolean, kind: string, data: Data): PluginTimelineItemProps<Data> {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  return { agentId: "preview", timestamp: PREVIEW_TIME, theme, host: { id: "preview", label: "Preview" }, layout: { compact, platform }, item: { type: "plugin" as const, kind, version: 1, data } };
}

// Every preview's frame inside its settings card: the same 16pt the Chat tab's preview has, so no
// note or sample touches the card's edge.
export const PREVIEW_FRAME = { padding: 16 } as const;

export function PreviewNote({ theme, text }: { theme: PluginTheme; text: string }) {
  return <Text style={{ color: theme.colors.foregroundMuted, fontSize: fontSize.sm, lineHeight: 17 }}>{text}</Text>;
}
