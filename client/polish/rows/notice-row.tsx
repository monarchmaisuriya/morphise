// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (NoticeItem)
// Morphise adds Copy on errors and Paseo's own notices, and the row's time.
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { Animated, Pressable, Text, View } from "react-native";
import type { z } from "zod";
import { Icon } from "../../ui/kit";
import { useRowSetup } from "./look";
import type { noticeSchema } from "./model";
import { toneColor, usePulse, useStyles } from "./row";

const clock = (at: Date) => at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function NoticeItem({ item, theme, timestamp }: PluginTimelineItemProps<z.output<typeof noticeSchema>>) {
  const s = useStyles(theme);
  const toast = useToast();
  const { look } = useRowSetup();
  const d = item.data;
  const color = toneColor(theme.colors, d.tone);
  const pulse = usePulse(d.pulsing);
  const time = look.timestamps ? <Text style={[s.meta, { marginLeft: 0 }]}>{clock(timestamp)}</Text> : null;
  if (d.variant === "inline") {
    return (
      <View style={[s.row, { alignItems: "flex-start" }]}>
        <View style={s.slot}>
          <Icon name={d.icon} size={15} color={color} />
        </View>
        <Text style={[s.verb, { color, flex: 1, lineHeight: 20 }]} selectable>
          {d.text}
        </Text>
        {time}
        <Pressable accessibilityRole="button" accessibilityLabel="Copy" hitSlop={6} onPress={() => void copyText(d.text).then(() => toast.show("Copied"), (error: unknown) => toast.error(String(error)))}>
          <Icon name="Copy" size={12} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }} accessibilityRole="text">
      <View style={s.hairline} />
      <Icon name={d.icon} size={12} color={color} />
      <Animated.Text style={[s.meta, { marginLeft: 0, color: d.tone === "danger" ? color : theme.colors.foregroundMuted, opacity: pulse, flexShrink: 1 }]} numberOfLines={2}>
        {d.text}
      </Animated.Text>
      {time}
      <View style={s.hairline} />
    </View>
  );
}
