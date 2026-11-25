import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FOCUS_TABS, focusSelection, type FocusTab } from "../shared/sidebar-focus";
import type { ViewState } from "../shared/view-state";
import { Dropdown, Icon, MenuItem, type Tokens } from "./ui/kit";
import { usePrefs } from "./polish/prefs";

export function SidebarFocusDropdown({ state, counts, select, t }: { state: ViewState; counts: Record<FocusTab, number>; select(tab: FocusTab): void; t: Tokens }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  const filled = usePrefs().sidebarToolbarFill === "filled";
  if (!state.focusTabsEnabled) return null;
  const selected = focusSelection(state);
  const label = (key: FocusTab) => `${state.focusTabs[key].label}${state.focusTabCounts && counts[key] > 0 ? ` · ${counts[key]}` : ""}`;
  return <View style={{ flex: 1, minWidth: 0 }}>
    <Pressable ref={anchor} accessibilityRole="button" accessibilityLabel={`Sidebar status: ${label(selected)}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ height: t.control, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 10, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.c.border, backgroundColor: filled ? open ? t.c.surface2 : t.c.surface1 : "transparent" }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: t.c.foreground, fontSize: 12 }}>{label(selected)}</Text>
      <Icon name="ChevronDown" size={14} color={t.c.foregroundMuted} />
    </Pressable>
    <Dropdown t={t} open={open} onClose={() => setOpen(false)} anchor={anchor} width={220}>
      {FOCUS_TABS.filter((key) => state.focusTabs[key].enabled).map((key) => <MenuItem key={key} t={t} role="radio" checked={selected === key} label={label(key)} onPress={() => { select(key); setOpen(false); }} />)}
    </Dropdown>
  </View>;
}
