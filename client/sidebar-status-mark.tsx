import { Platform, View } from "react-native";
import type { Indicator } from "../shared/profile";
import { SIDEBAR_INDICATOR_GEOMETRY, sidebarStatusOptions } from "../shared/polish/sidebar-status";
import { usePrefs } from "./polish/prefs";
import { statusColor } from "./ui/hues";
import type { Tokens } from "./ui/kit";
import { statusTooltip } from "../shared/status-tooltip";
import { useTooltip } from "./web";

export function SidebarStatusMark({ indicator, nested = false, colors, reason, enteredAt, now = Date.now() }: { indicator: Indicator; nested?: boolean; colors: Tokens["c"]; reason?: string | null; enteredAt?: string | null; now?: number }) {
  const prefs = usePrefs();
  const ring = Platform.OS === "web" && sidebarStatusOptions(prefs.sidebarStatus).style === "ring";
  const size = SIDEBAR_INDICATOR_GEOMETRY.ring;
  const explanation = statusTooltip(indicator, reason, enteredAt, now);
  const tooltip = useTooltip(explanation, colors);
  return <View ref={tooltip} style={{ width: Math.max(16, size), height: 20, alignItems: "center", justifyContent: "center", opacity: nested ? 0.8 : 1, flexShrink: 0 }}>
    <View testID={`morphise-sidebar-status-${indicator}`} accessibilityLabel={explanation} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: SIDEBAR_INDICATOR_GEOMETRY.dot, height: SIDEBAR_INDICATOR_GEOMETRY.dot, borderRadius: 3, backgroundColor: statusColor(colors, indicator), opacity: ring ? 0 : 1 }} />
    </View>
  </View>;
}
