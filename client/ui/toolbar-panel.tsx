import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { Tokens } from "./kit";

export function ToolbarPanel({ t, children }: { t: Tokens; children: ReactNode }) {
  return <View style={{ gap: 12, padding: 12, borderRadius: t.radius.panel, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>{children}</View>;
}

export function ToolbarPanelRow({ t, label, children }: { t: Tokens; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: t.compact ? "column" : "row", alignItems: t.compact ? "flex-start" : "center", gap: 8 }}>
      <Text style={[t.text.label, { width: t.compact ? undefined : 72 }]}>{label}</Text>
      <View style={{ flex: t.compact ? undefined : 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{children}</View>
    </View>
  );
}
