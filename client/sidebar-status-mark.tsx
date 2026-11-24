import { Platform, View } from "react-native";
import type { Indicator } from "../shared/profile";
import { sidebarIndicatorLayout, sidebarStatusOptions } from "../shared/polish/sidebar-status";
import { usePrefs } from "./polish/prefs";
import { statusColor } from "./ui/hues";
import type { Tokens } from "./ui/kit";
import { statusTooltip } from "../shared/status-tooltip";
import { useTooltip } from "./web";

export function SidebarStatusMark({ indicator, nested = false, colors, reason, enteredAt, now = Date.now() }: { indicator: Indicator; nested?: boolean; colors: Tokens["c"]; reason?: string | null; enteredAt?: string | null; now?: number }) {
  const prefs = usePrefs();
  const ring = Platform.OS === "web" && sidebarStatusOptions(prefs.sidebarStatus).style === "ring";
  const layout = sidebarIndicatorLayout(prefs.sidebarIndicatorLayout);
  const size = (ring ? layout.size : 14) * (nested ? 0.8 : 1);
  const explanation = statusTooltip(indicator, reason, enteredAt, now);
  const tooltip = useTooltip(explanation, colors);
  return <View ref={tooltip} style={{ width: Math.max(16, size), minHeight: Math.max(20, size), alignSelf: "stretch", alignItems: "center", justifyContent: ring && layout.alignment === "top" ? "flex-start" : ring && layout.alignment === "bottom" ? "flex-end" : "center", opacity: nested ? 0.8 : 1, flexShrink: 0 }}>
    <View testID={`morphise-sidebar-status-${indicator}`} accessibilityLabel={explanation} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(colors, indicator), opacity: ring ? 0 : indicator === "done" ? 0.6 : 1 }} />
    </View>
  </View>;
}
