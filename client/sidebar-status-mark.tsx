import { Platform, View } from "react-native";
import type { Indicator } from "../shared/profile";
import { STATUS_TITLES } from "../shared/arrange";
import { sidebarStatusOptions } from "../shared/polish/sidebar-status";
import { usePrefs } from "./polish/prefs";
import { statusColor } from "./ui/hues";
import type { Tokens } from "./ui/kit";

export function SidebarStatusMark({ indicator, nested = false, colors }: { indicator: Indicator; nested?: boolean; colors: Tokens["c"] }) {
  const prefs = usePrefs();
  const ring = Platform.OS === "web" && sidebarStatusOptions(prefs.sidebarStatus).style === "ring";
  return <View style={{ width: 16, height: 20, alignItems: "center", justifyContent: "center", opacity: nested ? 0.8 : 1 }}>
    <View testID={`morphise-sidebar-status-${indicator}`} accessibilityLabel={STATUS_TITLES[indicator]} style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center", transform: [{ scale: nested ? 12 / 14 : 1 }] }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(colors, indicator), opacity: ring ? 0 : indicator === "done" ? 0.6 : 1 }} />
    </View>
  </View>;
}
