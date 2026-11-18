import { View } from "react-native";
import type { PriorityMarkKind } from "./styles";

// A priority in a square of `size`, so it lines up where an icon would: a short bar as wide as the ring, or (no priority)
// a dashed ring.
export function PriorityMark({ kind, color, size = 13 }: { kind: PriorityMarkKind; color: string; size?: number }) {
  const dot = Math.round(size * 0.62);
  const bar = Math.max(2, Math.round(size * 0.22));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {kind === "bar" ? (
        <View style={{ width: dot, height: bar, borderRadius: bar / 2, backgroundColor: color }} />
      ) : (
        <View style={{ width: dot, height: dot, borderRadius: dot / 2, borderWidth: 1.5, borderColor: color, borderStyle: "dashed" }} />
      )}
    </View>
  );
}
