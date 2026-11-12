// Hover previews (Chat settings, Hover previews): a folded row's content in a floating box while the pointer rests on the row.
// web/hover-previews.ts decides when it shows and places it; phones and touch screens never get one.
import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { cannotHover } from "../../web";
import { usePrefs } from "../prefs";
import { attachPreview, previewControl } from "../web/hover-previews";

/** A row's hover state; `available` is whether the row has something to preview right now (it is folded and has content). */
export function useHoverPreview(available: boolean) {
  const { hoverPreviews, hoverDelay } = usePrefs();
  const enabled = available && hoverPreviews && Platform.OS === "web" && !cannotHover();
  const [open, setOpen] = useState(false);
  const delay = useRef(hoverDelay);
  delay.current = hoverDelay;
  const [control] = useState(() => previewControl(() => delay.current * 1000, setOpen));
  const row = useRef<View>(null);
  useEffect(() => {
    if (!enabled) control.dismiss();
  }, [enabled, control]);
  useEffect(() => control.dismiss, [control]);
  return { row, control, open: enabled && open, enterRow: () => enabled && control.enterRow(), leaveRow: control.leaveRow };
}

export type HoverPreviewState = ReturnType<typeof useHoverPreview>;

export function HoverPreview({ theme, hover, children }: { theme: PluginTheme; hover: HoverPreviewState; children: ReactNode }) {
  const box = useRef<View>(null);
  const { row, control } = hover;
  // Before the browser paints, so the box never shows in the chat's flow.
  useLayoutEffect(() => attachPreview(box.current, row.current, { enter: control.enterPreview, leave: control.leavePreview, dismiss: control.dismiss }), [row, control]);
  const c = theme.colors;
  return (
    <View ref={box} style={{ position: "absolute", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0 }}>
      {children}
    </View>
  );
}
