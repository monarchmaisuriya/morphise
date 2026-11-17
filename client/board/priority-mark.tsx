import { View } from "react-native";
import type { PriorityMarkKind } from "./styles";

// A priority as a dot in a square of `size`, so it lines up where an icon would: solid, a hollow ring, or a dashed ring.
export function PriorityMark({ kind, color, size = 13 }: { kind: PriorityMarkKind; color: string; size?: number }) {
  const dot = Math.round(size * 0.62);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, ...(kind === "solid" ? { backgroundColor: color } : { borderWidth: 1.5, borderColor: color, borderStyle: kind === "dashed" ? "dashed" : "solid" }) }} />
    </View>
  );
}
