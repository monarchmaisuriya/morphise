import { type ReactNode, useEffect, useRef } from "react";
import { View } from "react-native";
import { onPressOutside } from "../web";

// The trigger and its inline panel share a boundary, so pressing the trigger is not an outside press.
export function Dismissible({ open, onDismiss, children }: { open: boolean; onDismiss(): void; children: ReactNode }) {
  const boundary = useRef<View>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => open ? onPressOutside(boundary.current, () => dismiss.current()) : undefined, [open]);
  return <View ref={boundary}>{children}</View>;
}
