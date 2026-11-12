// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/dashboard/preview.tsx (MockChat, PreviewBubble)
import type { PluginTheme } from "@getpaseo/plugin";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { alpha, SQUIRCLE_CARD, useStyles } from "../../polish/rows/row";
import { Icon } from "../../ui/kit";
import { LONG_MESSAGE } from "./samples";

// A chat as Paseo shows it: title bar, the timeline, and the composer.
export function MockChat({ theme, compact, children }: { theme: PluginTheme; compact: boolean; children: ReactNode }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const chip = (icon: string, label?: string) => (
    <View key={icon} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: label ? 6 : 0, height: 26 }}>
      <Icon name={icon} size={14} color={c.foregroundMuted} />
      {label ? <Text style={[s.small, { fontSize: 13, color: c.foregroundMuted }]}>{label}</Text> : null}
      {label ? <Icon name="ChevronDown" size={12} color={c.foregroundMuted} /> : null}
    </View>
  );
  return (
    <View {...SQUIRCLE_CARD} style={{ width: "100%", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: compact ? 12 : 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(c.border, 0.6) }}>
        <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "500" }}>Auth middleware</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }} numberOfLines={1}>
          paseo-api
        </Text>
      </View>
      <View style={{ paddingHorizontal: compact ? 12 : 32, paddingVertical: 20, gap: 16 }}>{children}</View>
      <View {...SQUIRCLE_CARD} style={{ margin: compact ? 12 : 20, marginTop: 4, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface1 }}>
        <Text style={[s.prose, { fontSize: 14, color: c.foregroundMuted }]} numberOfLines={1}>
          Message the agent
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {chip("Plus")}
          {chip("Bot", "Opus 5.5")}
          {compact ? null : chip("Brain", "High")}
          <View style={{ flex: 1 }} />
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="ArrowUp" size={15} color={c.accentForeground} />
          </View>
        </View>
      </View>
    </View>
  );
}

// A long prompt bubble as Paseo draws it; clamped to `clamp` lines (shared/style-sheet.ts) until hovered, or pressed on
// touch screens.
export function PromptBubble({ theme, clamp }: { theme: PluginTheme; clamp: number | null }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const clamped = clamp !== null && !hovered && !open;
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Pressable
        {...SQUIRCLE_CARD}
        disabled={clamp === null}
        onPress={() => setOpen(!open)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole={clamp === null ? undefined : "button"}
        accessibilityState={clamp === null ? undefined : { expanded: !clamped }}
        style={{ maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: c.border }}
      >
        <Text style={[s.prose, { color: c.foreground }]} numberOfLines={clamped ? clamp : undefined}>
          {LONG_MESSAGE}
        </Text>
      </Pressable>
    </View>
  );
}
