// A still picture of the selection bar (client/polish/selection/web/bar.ts) over a selected phrase: the same buttons,
// words, order, sizes and dividers as the bar, in the theme's colours.
import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { Prefs } from "../../../shared/polish/prefs";
import { alpha, useStyles } from "../../polish/rows/row";
import { say } from "../../polish/selection/strings";
import { Icon } from "../../ui/kit";
import { type BarIcon, barItems } from "../../polish/selection/bar-layout";
import { SELECTED_SENTENCE } from "./samples";

function BarButton({ theme, icon, word, iconOnly = false }: { theme: PluginTheme; icon?: string; word?: string; iconOnly?: boolean }) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: iconOnly ? 7 : 9, borderRadius: 7 }}>
      {icon ? <Icon name={icon} size={14} color={c.foreground} /> : null}
      {word ? <Text style={{ color: c.foreground, fontSize: 13, lineHeight: 18, fontWeight: "500" }}>{word}</Text> : null}
    </View>
  );
}

// Kit icon names for the bar's own icons (the bar draws the same Lucide shapes as SVG).
const ICON_NAMES: Record<BarIcon, string> = { quote: "Quote", reply: "Reply", side: "MessagesSquare", copy: "Copy", text: "Type", markdown: "Hash", bookmark: "Bookmark", check: "Check", alert: "CircleAlert" };

// The same pieces the real bar draws, from its own rule (barItems).
function Bar({ theme, prefs }: { theme: PluginTheme; prefs: Prefs }) {
  const c = theme.colors;
  const items = barItems(prefs);
  if (!items.length) return <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>No buttons are chosen, so the bar does not show.</Text>;
  return (
    <View accessibilityLabel="Selection bar" style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 2, padding: 3, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, shadowColor: "#000000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
      {items.map((item, index) => {
        if (item.kind === "divider") return <View key={index} style={{ width: 1, alignSelf: "stretch", marginVertical: 4, marginHorizontal: 2, backgroundColor: c.border }} />;
        return <BarButton key={index} theme={theme} icon={item.icon ? ICON_NAMES[item.icon] : undefined} word={item.word ? say(item.word) : undefined} iconOnly={!item.word} />;
      })}
    </View>
  );
}

export function SelectionBarMock({ theme, prefs }: { theme: PluginTheme; prefs: Prefs }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const bar = <Bar theme={theme} prefs={prefs} />;
  return (
    <View style={{ gap: 8 }}>
      {prefs.barPosition === "above" ? bar : null}
      <Text style={[s.prose, { color: c.foreground }]}>
        {SELECTED_SENTENCE.before}
        <Text style={{ backgroundColor: alpha(c.accent, 0.3) }}>{SELECTED_SENTENCE.selected}</Text>
        {SELECTED_SENTENCE.after}
      </Text>
      {prefs.barPosition === "below" ? bar : null}
    </View>
  );
}
