// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/views.tsx (the shared row parts)
// Morphise adds its look options: text and code size, tighter "compact" rows, an accent colour,
// icon-only labels and the time of each row.
import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import type { IconKind } from "../../../shared/polish/prefs";
import { contrast, isHex } from "../../../shared/polish/theme";
import { Icon } from "../../ui/kit";
import { usePrefs } from "../prefs";
import { readHostAppearance, type HostAppearance } from "../web/host";
import { followExpansionAtBottom } from "../web/prompts";
import { highlight, highlightShell, highlightShellBlock, SYNTAX_THEMES, type Span, type SyntaxColors } from "./highlight";
import { type RowLook, useRowSetup } from "./look";
import type { Tone } from "./model";

export type Colors = PluginTheme["colors"];
export const SQUIRCLE_CARD = { dataSet: { cpSquircle: "card" } } as object;
const ROW_HOVER = { dataSet: { cpRow: "" } } as object;
const RUNNING_LABEL = { dataSet: { cpRunningLabel: "" } } as object;
const NO_WRAP_SCROLL = { dataSet: { cpNowrap: "" } } as object;

// Paseo's own fallback stack when Settings → Appearance → Code font is empty.
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" });
const ICON_SLOT = 20;

/**
 * Spread on every Text in the mono font. Paseo sets its UI font on all text not inside `data-pmono`, through an
 * `#root` selector that outranks the font family in our styles, so without it code renders in the UI font.
 */
export const PMONO = { dataSet: { pmono: "" } } as object;
export const INDENT = 28;
// Paseo puts 16pt between timeline items; rows are 26pt tall, so 6pt less gives the design's 36pt pitch (normal density). The split puts a row
// 20pt from reply text on both sides, with the tighter reply blocks in web/restyle-css.ts (6pt item gap, 4pt padding).
// Compact and spacious move rows 6pt closer or 8pt further apart; web/restyle-css.ts sets the same values for Paseo's rows.
const TIGHT = { compact: { marginTop: 0, marginBottom: -12 }, normal: { marginTop: 2, marginBottom: -8 }, spacious: { marginTop: 5, marginBottom: -3 } };
// Compact tool rows (Morphise's "Lines") sit 4pt closer still.
const TIGHTER = { compact: { marginTop: 0, marginBottom: -14 }, normal: { marginTop: 0, marginBottom: -12 }, spacious: { marginTop: 2, marginBottom: -8 } };
/** How far faded thought and tool rows step back, per strength (Paseo's own rows match it in web/restyle-css.ts). */
const QUIET = { dim: 0.3, faded: 0.45, soft: 0.65, full: 1 };
// Morphise's text and code sizes, as steps from Paseo's own sizes (Settings → Appearance).
const TEXT_STEP = { small: -2, medium: 0, large: 2 };
const CODE_STEP = { small: -1, medium: 0, large: 2 };

/** The spacing a row keeps from the timeline items around it; nested rows sit flush in their merged run. */
export function useSpacing(nested?: boolean) {
  const { density } = usePrefs();
  const { look } = useRowSetup();
  if (nested) return null;
  return (look.style === "compact" ? TIGHTER : TIGHT)[density];
}

export function toneColor(c: Colors, tone: Tone | undefined) {
  if (tone === "success") return c.statusSuccess;
  if (tone === "danger") return c.statusDanger;
  if (tone === "warning") return c.statusWarning;
  if (tone === "accent") return c.accent;
  return c.foregroundMuted;
}

/** Hex color with alpha; non-hex colors (rgb(), names) are returned unchanged. */
export function alpha(color: string, a: number) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((ch) => ch + ch).join("") : m[1]!;
  return `#${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

/** The sunken surface behind code blocks: a step darker than the canvas (#23272e → #1e2227 in Mariana). */
export function sunken(color: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `#${[16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * 0.86).toString(16).padStart(2, "0")).join("")}`;
}

/** Sizes follow Settings → Appearance (content size for prose and rows, code size with line height 1.5× for code), moved by Morphise's sizes. */
function makeStyles(c: Colors, a: HostAppearance, look: RowLook) {
  const ui = a.uiFont ? { fontFamily: a.uiFont } : {};
  const mono = { fontFamily: a.monoFont ? `${a.monoFont}, ${MONO}` : MONO };
  const body = a.contentSize - 1 + TEXT_STEP[look.textSize];
  const codeSize = a.codeSize + CODE_STEP[look.codeSize];
  const code = { ...mono, fontSize: codeSize, lineHeight: Math.round(codeSize * 1.5) };
  const rule = alpha(c.border, 0.6);
  const tight = look.style === "compact";
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: tight ? 22 : 26, paddingVertical: tight ? 1 : 3 },
    slot: { width: ICON_SLOT, height: 18, alignItems: "center", justifyContent: "center" },
    verb: { ...ui, color: c.foreground, fontSize: body, fontWeight: "500" },
    target: { ...ui, color: c.foregroundMuted, fontSize: body, flexShrink: 1, opacity: 0.85 },
    mono: { ...mono, fontSize: codeSize + 1 },
    meta: { ...ui, color: c.foregroundMuted, fontSize: body - 2, fontVariant: ["tabular-nums"], marginLeft: "auto", flexShrink: 0 },
    detail: { paddingLeft: INDENT, paddingTop: 2, marginTop: 6 },
    ruled: { paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: c.border, gap: 4, paddingVertical: 2 },
    block: { borderRadius: 8, backgroundColor: sunken(c.surface0), borderWidth: 1, borderColor: rule, overflow: "hidden" },
    blockHead: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: rule },
    blockBody: { paddingHorizontal: 12, paddingVertical: 9 },
    code: { ...code, color: c.foreground },
    gutter: { ...code, color: c.foregroundMuted, opacity: 0.6, textAlign: "right", fontVariant: ["tabular-nums"], flexShrink: 0 },
    small: { ...ui, color: c.foregroundMuted, fontSize: body - 1, lineHeight: Math.round((body - 1) * 1.45) },
    label: { ...ui, color: c.foregroundMuted, fontSize: 10, fontWeight: "600", letterSpacing: 0.8, marginBottom: 4 },
    prose: { ...ui, color: c.foregroundMuted, fontSize: body, lineHeight: Math.round(body * 1.6) },
    card: { borderRadius: 12, backgroundColor: c.surface1, borderWidth: 1, borderColor: rule, overflow: "hidden" },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: rule },
    title: { ...ui, color: c.foreground, fontSize: body, fontWeight: "600" },
    more: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
    moreText: { ...ui, color: c.foregroundMuted, fontSize: body - 2, fontWeight: "500" },
    hairline: { flex: 1, height: 1, backgroundColor: rule },
    action: { ...ui, color: c.foregroundMuted, fontSize: body - 3 },
  });
}

export type Styles = ReturnType<typeof makeStyles>;

// One style sheet per theme colors object, appearance and look, shared by every component drawn with it.
const styleCache = new WeakMap<Colors, { key: string; styles: Styles }>();

export function useStyles(theme: PluginTheme) {
  const { look } = useRowSetup();
  return useMemo(() => {
    const a = readHostAppearance();
    const key = JSON.stringify([a, look.textSize, look.codeSize, look.style]);
    const hit = styleCache.get(theme.colors);
    if (hit?.key === key) return hit.styles;
    const styles = makeStyles(theme.colors, a, look);
    styleCache.set(theme.colors, { key, styles });
    return styles;
  }, [theme, look]);
}

const NATIVE_DRIVER = Platform.OS !== "web";

// One shared reduce-motion subscription for every row, attached while any row is mounted.
let reducedMotion = false;
const motionListeners = new Set<() => void>();
let motionSub: { remove(): void } | undefined;
function subscribeReducedMotion(listener: () => void) {
  motionListeners.add(listener);
  if (!motionSub) {
    const set = (v: boolean) => {
      reducedMotion = v;
      motionListeners.forEach((l) => l());
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(set);
    motionSub = AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  }
  return () => {
    motionListeners.delete(listener);
    if (!motionListeners.size) {
      motionSub?.remove();
      motionSub = undefined;
    }
  };
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => reducedMotion);
}

/** Animated value that eases to `to` whenever it changes; snaps when the OS asks for reduced motion. */
export function useTween(to: number, duration: number, from = to, native = NATIVE_DRIVER) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(from)).current;
  useEffect(() => {
    if (reduced) return void value.setValue(to);
    const anim = Animated.timing(value, { toValue: to, duration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [to, reduced, duration, native, value]);
  return value;
}

/** Opacity pulse for live labels: 1 → 0.45 → 1 over 2.2s. */
export function usePulse(active: boolean) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    value.setValue(1);
    if (!active || reduced) return;
    const step = (toValue: number) =>
      Animated.timing(value, { toValue, duration: 1100, easing: Easing.inOut(Easing.ease), isInteraction: false, useNativeDriver: NATIVE_DRIVER });
    const loop = Animated.loop(Animated.sequence([step(0.45), step(1)]));
    loop.start();
    return () => {
      loop.stop();
      value.stopAnimation();
      value.setValue(1);
    };
  }, [active, reduced, value]);
  return value;
}

/** Fade + 4px rise each time `key` changes after the first render, so a new label reads as the next step arriving. */
function useSwap(key: string, active: boolean) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(key);
  useEffect(() => {
    const changed = previousKey.current !== key;
    previousKey.current = key;
    if (!active || reduced) {
      value.stopAnimation();
      value.setValue(1);
      return;
    }
    if (!changed) return;
    value.setValue(0.25);
    const anim = Animated.timing(value, { toValue: 1, duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: NATIVE_DRIVER });
    anim.start(({ finished }) => {
      if (finished) value.setValue(1);
    });
    return () => anim.stop();
  }, [key, active, reduced, value]);
  return active ? { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] } : null;
}

/** Fade + 4px rise for rows born while the agent is live; history renders still. */
export function useEnter(live: boolean) {
  const [born] = useState(live);
  const t = useTween(1, 160, born ? 0 : 1);
  return born ? { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] } : null;
}

/** Open state whose toggle animates the surrounding layout change. Until the user opens or folds the row, `rule` decides, so a
 * running call that finishes folds by itself (Morphise's fold rules). */
export function useDisclosure(rule = false) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const reduced = useReducedMotion();
  const open = chosen ?? rule;
  const toggle = useCallback(() => {
    followExpansionAtBottom();
    if (!reduced && Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.create(100, "easeOut", "opacity"));
    setChosen(!open);
  }, [reduced, open]);
  return [open, toggle] as const;
}

export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useTween(1, 100, 0);
  return <Animated.View style={[style, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] }]}>{children}</Animated.View>;
}

/** Keep output only through the closing transition; reopening cancels its pending removal. */
export function Expand({ open, children, style }: { open: boolean; children: ReactNode | (() => ReactNode); style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;
    if (reduced || Platform.OS !== "web") {
      setPresent(false);
      return;
    }
    // Leave a small buffer beyond the 100ms CSS transition before releasing the content.
    const timer = setTimeout(() => setPresent(false), 130);
    return () => clearTimeout(timer);
  }, [open, present, reduced]);
  if (!open && (!present || reduced || Platform.OS !== "web")) return null;
  const content = typeof children === "function" ? children() : children;
  if (Platform.OS !== "web") return <FadeIn style={style}>{content}</FadeIn>;
  return (
    <View {...({ dataSet: { cpExpand: open ? "open" : "closed" } } as object)} accessibilityElementsHidden={!open}>
      <View style={{ minHeight: 0, overflow: "hidden" }}>
        <View style={style}>{content}</View>
      </View>
    </View>
  );
}

interface RowProps {
  theme: PluginTheme;
  icon: string;
  iconColor?: string;
  verb: string;
  target?: string;
  mono?: boolean;
  meta?: string;
  metaColor?: string;
  pulsing?: boolean;
  struck?: boolean;
  /** Color the target as a shell command line while the row is expanded; collapsed rows stay quiet. */
  shell?: boolean;
  open?: boolean;
  onToggle?: () => void;
  compact: boolean;
  /** Animate the label in whenever it changes (the merged row's label follows the live step). */
  swap?: boolean;
  /** Which "Row icons" choice hides this row's icon. */
  kind: IconKind;
  /** When the row arrived (Chat settings, Show the time); nested rows leave it out. */
  time?: Date;
}

/** Left inset for a row's details: under the verb, past the icon when it shows. */
export function useIndent(kind: IconKind) {
  return usePrefs().rowIcons[kind] === "hide" ? 0 : INDENT;
}

const clock = (at: Date) => at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Shows `value` until its key changes, then keeps each new one up at least `hold` ms; changes inside the hold collapse into the latest,
 * so a run that steps quickly reads as a few calm label changes instead of a flicker. */
export function useSteady<T>(value: T, key: string, hold: number, active = true): T {
  const [shown, setShown] = useState({ key, value });
  const since = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (!active) {
      since.current = 0;
      if (key !== shown.key) setShown({ key, value: latest.current });
      return;
    }
    if (key === shown.key) return;
    const timer = setTimeout(() => {
      since.current = Date.now();
      setShown({ key, value: latest.current });
    }, Math.max(0, since.current + hold - Date.now()));
    return () => clearTimeout(timer);
  }, [key, shown.key, hold, active]);
  return active && key !== shown.key ? shown.value : value;
}

export function Row(p: RowProps) {
  const s = useStyles(p.theme);
  const [hovered, setHovered] = useState(false);
  const swap = useSwap(`${p.verb}\n${p.target ?? ""}`, !!p.swap);
  const syntax = useSyntax(p.theme);
  const { commandColors, steps, rowIcons } = usePrefs();
  const { look } = useRowSetup();
  const bare = rowIcons[p.kind] === "hide";
  // "An icon" (Chat settings, Each row starts with): the verb gives way to what the row acted on.
  const verbShown = !(look.labels === "icon" && !bare && p.target);
  const pulse = usePulse(!!p.pulsing && Platform.OS !== "web");
  const c = p.theme.colors;
  const rotation = useTween(p.open ? 1 : 0, 100);
  const chevronOpacity = useTween(hovered || p.open || p.compact ? 0.7 : 0, 80);
  // All idle rows, including failures, follow Strength; hover, open and running rows come back to full strength.
  const quiet = steps !== "full" && !(hovered || p.open || p.pulsing);
  return (
    <Pressable
      {...ROW_HOVER}
      disabled={!p.onToggle}
      onPress={p.onToggle}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={p.onToggle ? "button" : undefined}
      accessibilityState={p.onToggle ? { expanded: !!p.open } : undefined}
      accessibilityLabel={[p.verb, p.target, p.meta].filter(Boolean).join(" ")}
      // Bleeds into the gutter so the hover surface (full-strength rows only; faded rows brighten instead) covers the same area as Paseo's own tool rows.
      style={[s.row, { marginHorizontal: -13, paddingHorizontal: 13, borderRadius: 6 }, hovered && p.onToggle && steps === "full" ? { backgroundColor: c.surface1 } : null, quiet && { opacity: QUIET[steps] }]}
    >
      {bare ? null : (
        <View style={s.slot}>
          <Icon name={p.icon} size={15} color={p.iconColor ?? look.accent ?? c.foregroundMuted} />
        </View>
      )}
      {/* Baseline, not center: the verb is in the content size and a mono target a point smaller, so centering left them a pixel apart. */}
      <Animated.View
        {...(p.pulsing ? RUNNING_LABEL : null)}
        style={[
          { flexDirection: "row", alignItems: "baseline", gap: 8, flexShrink: 1, minWidth: 0 },
          swap,
          Platform.OS !== "web" && { opacity: Animated.multiply(swap?.opacity ?? 1, pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.82, 1] })) },
        ]}
      >
        {/* One line: a long merged summary ends in "…" rather than wrapping the row; with a target, the target gives way instead. */}
        {verbShown ? (
          <Text numberOfLines={1} style={[s.verb, { flexShrink: p.target ? 0 : 1 }, bare && p.iconColor ? { color: p.iconColor } : null]}>
            {p.verb}
          </Text>
        ) : null}
        {p.target ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            {...(p.mono ? PMONO : null)}
            style={[s.target, p.mono && s.mono, hovered && !p.pulsing && { color: c.foreground }, p.struck && { textDecorationLine: "line-through" }]}
          >
            {p.shell && (p.open || commandColors === "always") && syntax ? colored(highlightShell(p.target), syntax) : p.target}
          </Text>
        ) : null}
      </Animated.View>
      {p.meta ? <Text numberOfLines={1} style={[s.meta, p.metaColor ? { color: p.metaColor } : null]}>{p.meta}</Text> : <View style={{ flex: 1 }} />}
      {look.timestamps && p.time ? <Text style={[s.meta, { marginLeft: 0 }]}>{clock(p.time)}</Text> : null}
      {p.onToggle ? (
        <Animated.View
          style={{ opacity: chevronOpacity, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}
        >
          <Icon name="ChevronRight" size={12} color={c.foregroundMuted} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

function isDark(theme: PluginTheme) {
  const bg = theme.colors.surface0;
  return isHex(bg) && contrast(bg, "#ffffff") > contrast(bg, "#000000");
}

/** Colors of the chosen highlight theme (Look settings), or undefined for plain code (plain, or a dark palette on a light theme). */
function useSyntax(theme: PluginTheme): SyntaxColors | undefined {
  const id = usePrefs().syntax;
  const palette = SYNTAX_THEMES.find((t) => t.id === id);
  return palette && (palette.appearance === "dark") === isDark(theme) ? palette.colors : undefined;
}

function colored(spans: Span[], colors: SyntaxColors) {
  return spans.map((t, i) => (t.kind ? <Text key={i} style={{ color: colors[t.kind] }}>{t.text}</Text> : t.text));
}

/** One line of code (or a shell command) in the chosen highlight theme. */
export function CodeLine({ text, theme, style, shell }: { text: string; theme: PluginTheme; style: StyleProp<TextStyle>; shell?: boolean }) {
  const colors = useSyntax(theme);
  return (
    <Text {...PMONO} selectable style={style}>
      {colors ? colored(shell ? highlightShellBlock(text) : highlight(text), colors) : text}
    </Text>
  );
}

export function Scroll({ children, nowrap = false }: { children: ReactNode; nowrap?: boolean }) {
  return (
    <ScrollView {...(nowrap ? NO_WRAP_SCROLL : null)} style={{ maxHeight: 320 }} nestedScrollEnabled>
      {nowrap && Platform.OS !== "web" ? (
        <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ flexGrow: 1 }}>{children}</ScrollView>
      ) : children}
    </ScrollView>
  );
}

/** Markdown an agent wrote, read as paragraphs: **bold** and `code` drawn, "- " items bulleted; the rest of Markdown is left to Paseo. */
export function Prose({ theme, text, color }: { theme: PluginTheme; text: string; color?: string }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View style={{ gap: 10 }}>
      {text
        .trim()
        .split(/\n\s*\n/)
        .map((para, i) => (
          <Text key={i} style={[s.prose, color ? { color } : null]} selectable>
            {para
              .replace(/^(\s*)[-*] /gm, "$1• ")
              .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/)
              .map((part, j) =>
                part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
                  <Text key={j} style={{ color: c.foreground, fontWeight: "600" }}>
                    {part.slice(2, -2)}
                  </Text>
                ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
                  <Text key={j} style={[s.mono, { color: c.foreground }]}>
                    {part.slice(1, -1)}
                  </Text>
                ) : (
                  part
                ),
              )}
          </Text>
        ))}
    </View>
  );
}
