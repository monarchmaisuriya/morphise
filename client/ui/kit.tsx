import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from "react-native";

// Morphise's small UI kit. Sizes follow Paseo's own sidebar and settings (measured on 0.16.0-beta.1:
// 36px rows, 8px radius, 14px row text, 12px muted section labels), so plugin screens sit next to
// Paseo's without looking foreign. Colours come only from the theme. Controls are 32px tall on
// desktop and 40px on compact (touch) layouts.

export function tokens(theme: PluginTheme, compact: boolean) {
  const c = theme.colors;
  return {
    c,
    compact,
    control: compact ? 40 : 32,
    row: compact ? 44 : 36,
    radius: { control: 6, row: 8, card: 10, panel: 12 },
    space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    text: {
      title: { color: c.foreground, fontSize: 20, fontWeight: "600" as const },
      heading: { color: c.foreground, fontSize: 14, fontWeight: "600" as const },
      body: { color: c.foreground, fontSize: compact ? 15 : 13, lineHeight: compact ? 20 : 18 },
      row: { color: c.foreground, fontSize: 14 },
      label: { color: c.foregroundMuted, fontSize: 12 },
      meta: { color: c.foregroundMuted, fontSize: 12 },
      small: { color: c.foregroundMuted, fontSize: 11 },
      danger: { color: c.statusDanger, fontSize: 12 },
    },
  };
}

export type Tokens = ReturnType<typeof tokens>;

export function useTokens(theme: PluginTheme, compact: boolean): Tokens {
  return useMemo(() => tokens(theme, compact), [theme, compact]);
}

// Hover is a desktop and browser signal; on touch it never fires and the pressed state shows instead.
function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) };
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  t,
  label,
  icon,
  onPress,
  variant = "secondary",
  disabled = false,
  accessibilityLabel,
  style,
  checked,
}: {
  t: Tokens;
  label?: string;
  icon?: string;
  onPress(): void;
  variant?: Variant;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  // Set for a button that is one choice of a set (announced as a radio with its state).
  checked?: boolean;
}) {
  const hover = useHover();
  const { c } = t;
  const look = {
    primary: { bg: c.accent, hoverBg: c.accent, fg: c.accentForeground, border: c.accent },
    secondary: { bg: c.surface1, hoverBg: c.surface2, fg: c.foreground, border: c.border },
    ghost: { bg: "transparent", hoverBg: c.surface2, fg: c.foregroundMuted, border: "transparent" },
    danger: { bg: "transparent", hoverBg: c.surface2, fg: c.statusDanger, border: "transparent" },
  }[variant];
  return (
    <Pressable
      accessibilityRole={checked === undefined ? "button" : "radio"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={checked === undefined ? { disabled } : { disabled, checked }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => [
        {
          height: t.control,
          minWidth: t.control,
          paddingHorizontal: label ? t.space.md : 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderRadius: t.radius.control,
          borderWidth: 1,
          borderColor: look.border,
          backgroundColor: hover.hovered || pressed ? look.hoverBg : look.bg,
          opacity: disabled ? 0.4 : variant === "primary" && (hover.hovered || pressed) ? 0.88 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={variant === "ghost" && hover.hovered ? c.foreground : look.fg} /> : null}
      {label ? <Text style={{ color: look.fg, fontSize: 13, fontWeight: variant === "primary" ? "600" : "500" }}>{label}</Text> : null}
    </Pressable>
  );
}

// An icon-only button; `label` is its accessible name and tooltip-free description.
export function IconButton({ t, icon, label, onPress, tone, size = "md", disabled }: { t: Tokens; icon: string; label: string; onPress(): void; tone?: string; size?: "sm" | "md"; disabled?: boolean }) {
  const hover = useHover();
  const box = size === "sm" ? (t.compact ? 32 : 24) : t.control;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: t.radius.control,
        backgroundColor: hover.hovered || pressed ? t.c.surface2 : "transparent",
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Icon name={icon} size={size === "sm" ? 14 : 16} color={tone ?? (hover.hovered ? t.c.foreground : t.c.foregroundMuted)} />
    </Pressable>
  );
}

// A text field. It never stretches along its parent's main axis, so it keeps its height in a
// column; pass `grow` to make it fill a row.
export function Field({
  t,
  value,
  onChangeText,
  placeholder,
  label,
  hint,
  error,
  multiline,
  grow,
  icon,
  onSubmit,
  onBlur,
  autoFocus,
  numeric,
  bare,
  textStyle,
  accessibilityLabel,
  maxLength,
  plain,
}: {
  t: Tokens;
  value: string;
  onChangeText(text: string): void;
  placeholder?: string;
  label?: string;
  hint?: string | null;
  error?: string | null;
  multiline?: boolean;
  grow?: boolean;
  icon?: string;
  onSubmit?(): void;
  onBlur?(): void;
  autoFocus?: boolean;
  numeric?: boolean;
  // No box: for the editor's title and description, which read as text until edited.
  bare?: boolean;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  maxLength?: number;
  // For addresses, times and search terms: no automatic capitals or corrections on phones.
  plain?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const { c } = t;
  const box: ViewStyle = bare
    ? { borderRadius: t.radius.control, borderWidth: 1, borderColor: focused ? c.border : "transparent", backgroundColor: focused ? c.surface1 : "transparent" }
    : { borderRadius: t.radius.control, borderWidth: 1, borderColor: error ? c.statusDanger : focused ? c.accent : c.border, backgroundColor: c.surface1 };
  return (
    <View style={[{ gap: 4 }, grow ? { flex: 1, minWidth: 140 } : null]}>
      {label ? <Text style={t.text.label}>{label}</Text> : null}
      <View style={[box, { flexDirection: "row", alignItems: multiline ? "flex-start" : "center", minHeight: multiline ? (bare ? 52 : 88) : t.control, paddingHorizontal: bare ? 6 : 10, gap: 8 }]}>
        {icon ? <Icon name={icon} size={14} color={c.foregroundMuted} /> : null}
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.foregroundMuted}
          multiline={multiline}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoCapitalize={plain ? "none" : undefined}
          autoCorrect={plain ? false : undefined}
          keyboardType={numeric ? "number-pad" : "default"}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={onSubmit}
          style={[
            { flex: 1, minWidth: 0, color: c.foreground, fontSize: t.compact ? 15 : 13, paddingVertical: multiline ? 8 : 0, minHeight: multiline ? (bare ? 44 : 72) : t.control - 2, textAlignVertical: multiline ? "top" : "center" },
            textStyle,
          ]}
        />
      </View>
      {error ? <Text style={t.text.danger}>{error}</Text> : hint ? <Text style={t.text.small}>{hint}</Text> : null}
    </View>
  );
}

// A row of mutually exclusive choices drawn as one control.
export function Segmented<Value extends string | number>({ t, options, value, onChange, label }: { t: Tokens; options: readonly { value: Value; label: string; icon?: string; tone?: string }[]; value: Value; onChange(value: Value): void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", alignSelf: "flex-start", flexShrink: 1, maxWidth: "100%", padding: 2, gap: 2, borderRadius: t.radius.control + 2, backgroundColor: t.c.surface1, borderWidth: 1, borderColor: t.c.border }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{ height: t.control - 6, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: t.radius.control, backgroundColor: on ? t.c.surface2 : "transparent" }}
          >
            {option.icon ? <Icon name={option.icon} size={13} color={option.tone ?? (on ? t.c.foreground : t.c.foregroundMuted)} /> : null}
            <Text style={{ color: on ? t.c.foreground : t.c.foregroundMuted, fontSize: 12, fontWeight: on ? "600" : "400" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A small coloured tag: a dot and a name, optionally removable or toggleable.
export function Tag({ t, label, color, on = true, onPress, onRemove }: { t: Tokens; label: string; color?: string; on?: boolean; onPress?(): void; onRemove?(): void }) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, height: t.compact ? 28 : 22, paddingHorizontal: 8, borderRadius: 11, borderWidth: 1, borderColor: on ? t.c.border : "transparent", backgroundColor: on ? t.c.surface1 : "transparent", opacity: on ? 1 : 0.6 }}>
      {color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={{ color: on ? t.c.foreground : t.c.foregroundMuted, fontSize: 11, maxWidth: 180 }} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} hitSlop={6}>
          <Icon name="X" size={11} color={t.c.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

// One line of a property list: an icon and label on the left, the value on the right.
export function PropertyRow({ t, icon, label, children }: { t: Tokens; icon: string; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: t.compact ? "column" : "row", alignItems: t.compact ? "stretch" : "flex-start", gap: t.compact ? 6 : 12, paddingVertical: 4 }}>
      <View style={{ width: t.compact ? undefined : 112, flexDirection: "row", alignItems: "center", gap: 8, minHeight: t.compact ? undefined : t.control }}>
        <Icon name={icon} size={14} color={t.c.foregroundMuted} />
        <Text style={t.text.label}>{label}</Text>
      </View>
      <View style={{ flex: t.compact ? undefined : 1, minWidth: 0, minHeight: t.control, justifyContent: "center", gap: 6 }}>{children}</View>
    </View>
  );
}

// A value that opens a list of choices beneath it; for status, labels and similar fields.
export function Select<Value extends string>({ t, value, options, onChange, label, placeholder }: { t: Tokens; value: Value | null; options: readonly { value: Value; label: string; dot?: string; icon?: string }[]; onChange(value: Value): void; label: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) ?? null;
  return (
    <View style={{ gap: 4, alignSelf: "stretch" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? "none"}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ alignSelf: "flex-start", height: t.control, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: t.radius.control, borderWidth: 1, borderColor: open ? t.c.accent : t.c.border, backgroundColor: t.c.surface1 }}
      >
        {current?.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current.dot }} /> : null}
        {current?.icon ? <Icon name={current.icon} size={14} color={t.c.foregroundMuted} /> : null}
        <Text style={{ color: current ? t.c.foreground : t.c.foregroundMuted, fontSize: 13 }}>{current?.label ?? placeholder ?? "None"}</Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={t.c.foregroundMuted} />
      </Pressable>
      {open ? (
        <View style={{ alignSelf: "flex-start", minWidth: 200, padding: 4, borderRadius: t.radius.row, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
          {options.map((option) => (
            <MenuItem
              key={option.value}
              t={t}
              label={option.label}
              dot={option.dot}
              icon={option.icon}
              role="radio"
              checked={option.value === value}
              onPress={() => {
                setOpen(false);
                onChange(option.value);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// A row in a menu or option list: icon or dot, label, an optional right-aligned hint, a check.
// `role` tells screen readers whether the item is an action, an on/off choice or one of a set.
export function MenuItem({ t, label, hint, icon, dot, checked, onPress, tone, role = "menuitem" }: { t: Tokens; label: string; hint?: string; icon?: string; dot?: string; checked?: boolean; onPress(): void; tone?: string; role?: "menuitem" | "checkbox" | "radio" }) {
  const hover = useHover();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={role === "menuitem" ? undefined : { checked: checked === true }}
      onPress={onPress}
      onHoverIn={hover.onHoverIn}
      onHoverOut={hover.onHoverOut}
      style={({ pressed }) => ({ minHeight: t.compact ? 44 : 32, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: t.radius.control, backgroundColor: hover.hovered || pressed ? t.c.surface2 : "transparent" })}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      {icon ? <Icon name={icon} size={14} color={tone ?? t.c.foregroundMuted} /> : null}
      <Text style={{ flex: 1, color: tone ?? t.c.foreground, fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      {hint ? <Text style={t.text.meta}>{hint}</Text> : null}
      {checked ? <Icon name="Check" size={14} color={t.c.accent} /> : null}
    </Pressable>
  );
}

// A muted section label, as in Paseo's sidebar ("Pinned", "Workspaces").
export function SectionLabel({ t, title, trailing }: { t: Tokens; title: string; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28, gap: 8 }}>
      <Text style={t.text.label}>{title}</Text>
      {trailing}
    </View>
  );
}
