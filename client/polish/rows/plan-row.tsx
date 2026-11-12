// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (PlanItem)
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRevealedText } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import type { z } from "zod";
import { Icon } from "../../ui/kit";
import { useT } from "../i18n";
import { useRowSetup } from "./look";
import type { planSchema } from "./model";
import { SQUIRCLE_CARD, useDisclosure, useStyles } from "./row";

export function PlanItem({ item, theme }: PluginTimelineItemProps<z.output<typeof planSchema>>) {
  const s = useStyles(theme);
  const t = useT();
  const { look } = useRowSetup();
  const [open, toggle] = useDisclosure();
  const text = useRevealedText(item.data.text, item.data.phase).trim();
  const long = text.split("\n").length > 14 || text.length > 1200;
  const steps = text.match(/^\s*\d+[.)]\s/gm)?.length ?? 0;
  return (
    <View {...SQUIRCLE_CARD} style={s.card}>
      <View style={s.cardHead}>
        <Icon name="Map" size={15} color={look.accent ?? theme.colors.accent} />
        <Text style={s.title}>{t("chat.plan")}</Text>
        {steps ? <Text style={[s.meta, { marginLeft: 0 }]}>{t("chat.planSteps", { n: steps })}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: long ? 6 : 14, maxHeight: long && !open ? 320 : undefined, overflow: "hidden" }}>
        <Text style={[s.prose, { color: theme.colors.foreground, lineHeight: Math.round(s.prose.fontSize * 1.5) }]} selectable>
          {text}
        </Text>
      </View>
      {long ? (
        <Pressable accessibilityRole="button" onPress={toggle} style={s.more}>
          <Text style={s.moreText}>{open ? t("chat.showLess") : t("chat.showFullPlan")}</Text>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={12} color={theme.colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
