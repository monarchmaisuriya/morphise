// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/client/ui.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { Tone } from "../../shared/run/view";
import { Icon } from "../ui/kit";
import { useTooltip } from "../web";
import type { ThemeColors } from "./palette";

// Read at render time, not import time. The native driver can't run on web,
// and web is the only place filter blur renders.
const isWeb = () => Platform.OS === "web";
export const nativeDriver = () => !isWeb();
const easeOut = () => Easing.out(Easing.ease);
const iconCurve = () => Easing.bezier(0.2, 0, 0, 1);

// Code and commands: the platform's monospace face.
export const mono = () => (Platform.OS === "ios" ? "Menlo" : Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "monospace");

// On web, Paseo sets the interface font on everything outside a `data-pmono` subtree, so a
// box of code carries this to keep mono().
export const codeSurface = () => (isWeb() ? ({ dataSet: { pmono: "" } } as object) : {});

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => live && setReduced(value));
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

// Depth for the card: a one-pixel ring in the theme's border colour.
export function raised(colors: ThemeColors): ViewStyle {
  return { borderWidth: 1, borderColor: colors.border };
}

export function toneColor(tone: Tone, colors: ThemeColors): string {
  switch (tone) {
    case "success":
      return colors.statusSuccess;
    case "danger":
      return colors.statusDanger;
    case "warning":
      return colors.statusWarning;
    case "active":
      return colors.accent;
  }
}

// A button that scales to 0.96 while pressed.
export function PressScale({
  ref,
  style,
  outerStyle,
  children,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  ref?: React.Ref<View>;
  outerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean; hovered: boolean }) => StyleProp<ViewStyle>);
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (toValue: number) => Animated.timing(scale, { toValue, duration: 150, easing: easeOut(), useNativeDriver: nativeDriver() }).start();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      {...props}
      ref={ref}
      style={outerStyle}
      onHoverIn={(event) => {
        setHovered(true);
        props.onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        props.onHoverOut?.(event);
      }}
      onPressIn={(event) => {
        setPressed(true);
        to(0.96);
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        to(1);
        props.onPressOut?.(event);
      }}
    >
      <Animated.View style={[typeof style === "function" ? style({ pressed, hovered }) : style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Cross-fades an icon when `swapKey` changes: the new one grows from 0.25 while
// the old one shrinks away. Nothing animates on first render.
export function IconSwap({ swapKey, size, children }: { swapKey: string; size: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(swapKey);
  const [leaving, setLeaving] = useState<React.ReactNode>(null);
  const last = useRef(children);
  const enter = useRef(new Animated.Value(1)).current;
  if (swapKey !== shown) {
    setShown(swapKey);
    setLeaving(reduced ? null : last.current);
  }
  useLayoutEffect(() => {
    last.current = children;
  });
  useLayoutEffect(() => {
    if (!leaving) return;
    enter.setValue(0);
    const animation = Animated.timing(enter, { toValue: 1, duration: 300, easing: iconCurve(), useNativeDriver: nativeDriver() });
    animation.start(({ finished }) => finished && setLeaving(null));
    return () => animation.stop();
  }, [shown]);
  const layer = (value: Animated.AnimatedInterpolation<number> | Animated.Value, blurFrom: [number, number]) => ({
    opacity: value,
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }],
    ...(isWeb() && leaving ? { filter: value.interpolate({ inputRange: [0, 1], outputRange: blurFrom.map((px) => `blur(${px}px)`) }) } : null),
  });
  const exit = enter.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={{ width: size, height: size }}>
      {leaving ? <Animated.View style={[{ position: "absolute", top: 0, left: 0 }, layer(exit, [4, 0])]}>{leaving}</Animated.View> : null}
      <Animated.View style={layer(enter, [4, 0])}>{children}</Animated.View>
    </Animated.View>
  );
}

// The system spinner, sized to sit beside a line of text. iOS draws it only at 20pt.
export function Spinner({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View accessibilityLabel="Working" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {Platform.OS === "ios" ? (
        <ActivityIndicator size="small" color={color} style={{ transform: [{ scale: size / 20 }] }} />
      ) : (
        <ActivityIndicator size={size} color={color} />
      )}
    </View>
  );
}

export type ButtonTone = "primary" | "quiet" | "danger-filled";

export function Button({
  icon,
  label,
  reserveLabel,
  tone,
  onPress,
  busy = false,
  disabled = false,
  compact,
  iconOnly = false,
  floating = false,
  radius = 6,
  colors,
  accessibilityLabel,
}: {
  icon: string;
  label: string;
  // A longer label this button can switch to ("Copied"), so the switch doesn't shift its neighbors.
  reserveLabel?: string;
  tone: ButtonTone;
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
  compact: boolean;
  iconOnly?: boolean;
  // Lifted with the card's ring, for a button that sits over content.
  floating?: boolean;
  // Smaller inside a rounded box, so the corners stay concentric.
  radius?: number;
  colors: ThemeColors;
  accessibilityLabel: string;
}) {
  const filled = tone === "primary" || tone === "danger-filled";
  // A quiet button is bare until hovered; one floating over the output keeps its surface.
  const background = tone === "primary" ? colors.accent : tone === "danger-filled" ? colors.statusDanger : floating ? colors.surface2 : "transparent";
  const foreground =
    tone === "primary" ? colors.accentForeground : tone === "danger-filled" ? colors.surface0 : colors.foreground;
  const height = compact ? 36 : 28;
  const labelStyle = { color: foreground, fontSize: 12, lineHeight: 16, fontWeight: filled ? ("600" as const) : ("500" as const) };
  const showLabel = !iconOnly || filled;
  // An icon without words gets its name as a hover tooltip.
  const tooltip = useTooltip(showLabel ? undefined : label, colors);
  return (
    <PressScale
      ref={tooltip}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ hovered }) => ({
        ...(floating ? raised(colors) : null),
        height,
        minWidth: height,
        borderRadius: radius,
        paddingStart: showLabel ? 8 : 0,
        paddingEnd: showLabel ? 10 : 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: filled || !hovered || disabled ? background : floating ? colors.border : colors.surface2,
        opacity: disabled ? 0.5 : filled && hovered ? 0.88 : 1,
      })}
    >
      <IconSwap swapKey={busy ? "busy" : icon} size={14}>
        {busy ? <Spinner color={foreground} size={14} /> : <Icon name={icon} size={14} color={foreground} />}
      </IconSwap>
      {showLabel ? (
        <View>
          {reserveLabel ? (
            <Text accessible={false} importantForAccessibility="no" style={[labelStyle, { opacity: 0 }]}>
              {reserveLabel}
            </Text>
          ) : null}
          <Text style={[labelStyle, reserveLabel ? { position: "absolute", left: 0, right: 0, top: 0, textAlign: "center" } : null]}>{label}</Text>
        </View>
      ) : null}
    </PressScale>
  );
}
