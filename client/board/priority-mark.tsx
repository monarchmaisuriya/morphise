import { View } from "react-native";
import type { PriorityMarkKind } from "./styles";

// A priority in a square of `size`, so it lines up where an icon would: a short bar, filled, or (no priority) outlined
// at the same size.
export function PriorityMark({ kind, color, size = 13 }: { kind: PriorityMarkKind; color: string; size?: number }) {
  const dot = Math.round(size * 0.62);
  const bar = Math.max(2, Math.round(size * 0.22));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: dot, height: bar, borderRadius: bar / 2, ...(kind === "bar" ? { backgroundColor: color } : { borderWidth: 1, borderColor: color }) }} />
    </View>
  );
}
