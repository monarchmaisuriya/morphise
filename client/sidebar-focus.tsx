import { Pressable, Text, View } from "react-native";
import { FOCUS_TABS, focusSelection, type FocusTab } from "../shared/sidebar-focus";
import type { ViewState } from "../shared/view-state";
import type { Tokens } from "./ui/kit";

export function SidebarFocusTabs({ state, counts, select, t }: { state: ViewState; counts: Record<FocusTab, number>; select(tab: FocusTab): void; t: Tokens }) {
  if (!state.focusTabsEnabled) return null;
  const selected = focusSelection(state);
  return <View accessibilityRole="tablist" accessibilityLabel="Sidebar focus" style={{ flexDirection: "row", paddingHorizontal: 12, paddingBottom: 6, gap: 4 }}>
    {FOCUS_TABS.filter((key) => state.focusTabs[key].enabled).map((key) => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={`${state.focusTabs[key].label}${state.focusTabCounts ? `, ${counts[key]}` : ""}`} accessibilityState={{ selected: selected === key }} onPress={() => select(key)} style={{ flex: 1, minWidth: 0, minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6, borderRadius: t.radius.control, backgroundColor: selected === key ? t.c.surface2 : "transparent" }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: selected === key ? t.c.foreground : t.c.foregroundMuted, fontSize: 12, fontWeight: selected === key ? "600" : "400" }}>{state.focusTabs[key].label}</Text>
      {state.focusTabCounts ? <Text style={{ color: t.c.foregroundMuted, fontSize: 11 }}>{counts[key]}</Text> : null}
    </Pressable>)}
  </View>;
}
