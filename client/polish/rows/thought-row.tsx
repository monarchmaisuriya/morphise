// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (ThoughtItem)
// Morphise's Show thinking decides how it starts (thinkingStartsOpen in shared/chat-view.ts).
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRevealedText } from "@getpaseo/plugin/client/react-native";
import { Animated, Text, View } from "react-native";
import type { z } from "zod";
import { thinkingStartsOpen } from "../../../shared/chat-view";
import { useT } from "../i18n";
import { readHostAppearance } from "../web/host";
import { useRowSetup } from "./look";
import type { thoughtSchema } from "./model";
import { FadeIn, Row, useDisclosure, useEnter, useIndent, useSpacing, useStyles } from "./row";
import type { Nestable } from "./tool-row";

export function ThoughtItem({ item, theme, layout, timestamp, nested }: PluginTimelineItemProps<z.output<typeof thoughtSchema>> & Nestable) {
  const s = useStyles(theme);
  const { look } = useRowSetup();
  const t = useT();
  const streaming = item.data.phase === "streaming";
  const [open, toggle] = useDisclosure(thinkingStartsOpen(look, streaming, readHostAppearance().autoExpandReasoning));
  const enter = useEnter(streaming);
  const spacing = useSpacing(nested);
  const text = useRevealedText(item.data.text, item.data.phase);
  const inset = useIndent("thought") ? 9 : 0;
  return (
    <Animated.View style={[spacing, enter]}>
      <Row
        theme={theme}
        compact={layout.compact}
        kind="thought"
        icon="Brain"
        verb={t(streaming ? "chat.thinking" : "chat.thought")}
        pulsing={streaming}
        open={open}
        onToggle={text.trim() ? toggle : undefined}
        time={nested ? undefined : timestamp}
      />
      {open ? (
        <FadeIn style={[s.detail, { paddingLeft: inset, paddingTop: 0 }]}>
          <View style={[s.ruled, { gap: 10 }]}>
            {text
              .trim()
              .split(/\n\s*\n/)
              .map((para, i) => (
                <Text key={i} style={s.prose} selectable>
                  {para}
                </Text>
              ))}
          </View>
        </FadeIn>
      ) : null}
    </Animated.View>
  );
}
