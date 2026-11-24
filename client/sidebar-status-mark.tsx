import { Platform, View } from "react-native";
import type { Indicator } from "../shared/profile";
import { STATUS_TITLES } from "../shared/arrange";
import { sidebarIndicatorLayout, sidebarStatusOptions } from "../shared/polish/sidebar-status";
import { usePrefs } from "./polish/prefs";
import { statusColor } from "./ui/hues";
import type { Tokens } from "./ui/kit";

export function SidebarStatusMark({ indicator, nested = false, colors }: { indicator: Indicator; nested?: boolean; colors: Tokens["c"] }) {
  const prefs = usePrefs();
  const ring = Platform.OS === "web" && sidebarStatusOptions(prefs.sidebarStatus).style === "ring";
  const layout = sidebarIndicatorLayout(prefs.sidebarIndicatorLayout);
  const size = (ring ? layout.size : 14) * (nested ? 0.8 : 1);
  return <View style={{ width: Math.max(16, size), minHeight: Math.max(20, size), alignSelf: "stretch", alignItems: "center", justifyContent: ring && layout.alignment === "top" ? "flex-start" : ring && layout.alignment === "bottom" ? "flex-end" : "center", opacity: nested ? 0.8 : 1, flexShrink: 0 }}>
    <View testID={`morphise-sidebar-status-${indicator}`} accessibilityLabel={STATUS_TITLES[indicator]} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(colors, indicator), opacity: ring ? 0 : indicator === "done" ? 0.6 : 1 }} />
    </View>
  </View>;
}
