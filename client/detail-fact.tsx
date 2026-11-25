import { Text, View } from "react-native";
import type { Tokens } from "./ui/kit";

export function DetailFact({ label, value, t }: { label: string; value: string | number; t: Tokens }) {
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 2 }}>
    <Text style={[t.text.meta, { width: 88, flexShrink: 0 }]}>{label}</Text>
    <Text selectable style={[t.text.body, { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17 }]}>{value}</Text>
  </View>;
}
