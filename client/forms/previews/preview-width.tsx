// A Desktop / Phone switch above a settings preview: Phone draws the same sample at a phone's width
// with the compact layout, as Paseo's apps would. On a phone the preview is already that.
import type { PluginTheme } from "@getpaseo/plugin";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { Segmented, tokens } from "../../ui/kit";

const PHONE_WIDTH = 390;

export function PreviewWidth({ theme, compact, children }: { theme: PluginTheme; compact: boolean; children(compact: boolean): ReactNode }) {
  const [phone, setPhone] = useState(false);
  if (compact) return <>{children(true)}</>;
  const t = tokens(theme, false);
  return (
    <View style={{ gap: 10 }}>
      <Segmented
        t={t}
        label="Preview width"
        value={phone ? "phone" : "desktop"}
        options={[
          { value: "desktop", label: "Desktop", icon: "Monitor" },
          { value: "phone", label: "Phone", icon: "Smartphone" },
        ]}
        onChange={(value) => setPhone(value === "phone")}
      />
      {phone ? <View style={{ width: PHONE_WIDTH, maxWidth: "100%", alignSelf: "center", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 24, overflow: "hidden" }}>{children(true)}</View> : children(false)}
    </View>
  );
}
