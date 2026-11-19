// The colour and icon of a group, project or workspace in "Your groups": 11 colours, 36 icons or any typed emoji.
// Ported from Project Groups by topar12 (MIT, see NOTICE.md), client/decor.tsx at 8515d90.
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { type Decoration, DECOR_COLORS, DECOR_ICONS, parseHexColor } from "../shared/project-groups";
import { Field, Icon, IconButton, type Tokens } from "./ui/kit";
import { ColorField } from "./ui/color-field";

// A stored icon drawn: "lucide:Name" as that icon, "emoji:x" as text in the same colour (letters take it; emoji keep their own).
export function DecorIcon({ icon, color, size }: { icon: string; color: string; size: number }) {
  if (icon.startsWith("emoji:")) return <Text style={{ fontSize: size - 1, lineHeight: size + 2, color }}>{icon.slice("emoji:".length)}</Text>;
  return <Icon name={icon.slice("lucide:".length)} size={size} color={color} />;
}

const isPreset = (color: string) => DECOR_COLORS.some((item) => item.value.toUpperCase() === color.toUpperCase());

// `withIcon` false offers colours only (workspaces). Every choice saves at once through `onChange`;
// custom graphical colors preview locally until Apply.
export function DecorPicker({ t, value, onChange, onApplyColor, withIcon }: { t: Tokens; value: Decoration; onChange(next: Decoration): void; onApplyColor?(color: string | null): Promise<void>; withIcon: boolean }) {
  const [emoji, setEmoji] = useState(value.icon?.startsWith("emoji:") ? value.icon.slice("emoji:".length) : "");
  const customColor = value.color !== null && !isPreset(value.color) ? value.color : null;
  const [customOpen, setCustomOpen] = useState(customColor !== null);
  const [hex, setHex] = useState(value.color ?? "");
  const [hexError, setHexError] = useState(false);
  const preview = parseHexColor(hex);
  const saveHex = () => {
    const color = parseHexColor(hex);
    setHexError(color === null);
    if (color) {
      setHex(color);
      onChange({ ...value, color });
    }
  };
  // Swatches are as big as the icon buttons beside them: finger-sized on touch.
  const size = t.compact ? 32 : 24;
  const swatch = (color: string | null, name: string) => {
    const on = value.color === color;
    return (
      <Pressable
        key={name}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`Colour: ${name}`}
        onPress={() => onChange({ ...value, color })}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: on ? 2 : 1, borderColor: on ? t.c.foreground : t.c.border, backgroundColor: color ?? "transparent" }}
      >
        {color === null ? <Icon name="Slash" size={12} color={t.c.foregroundMuted} /> : null}
      </Pressable>
    );
  };
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <Text style={t.text.label}>Colour</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Colour" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {swatch(null, "None")}
        {DECOR_COLORS.map((item) => swatch(item.value, item.name))}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: customColor !== null, expanded: customOpen }}
          accessibilityLabel={customColor ? `Colour: custom ${customColor}` : "Colour: custom"}
          onPress={() => setCustomOpen(!customOpen)}
          style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: customColor ? 2 : 1, borderStyle: customColor ? "solid" : "dashed", borderColor: customColor ? t.c.foreground : t.c.border, backgroundColor: customColor ?? "transparent" }}
        >
          {customColor ? null : <Icon name="Plus" size={12} color={t.c.foregroundMuted} />}
        </Pressable>
      </View>
      {customOpen ? Platform.OS === "web" ? <ColorField t={t} label="Custom color" value={value.color ?? ""} resetLabel="No color override" onReset={() => onApplyColor ? onApplyColor(null) : onChange({ ...value, color: null })} onApply={(color) => onApplyColor ? onApplyColor(color) : onChange({ ...value, color })} /> : <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 24, height: 24, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.c.border, backgroundColor: preview ?? "transparent" }} />
          <View style={{ flex: 1, minWidth: 0 }}><Field t={t} plain value={hex} onChangeText={(text) => { setHex(text); setHexError(false); }} onSubmit={saveHex} maxLength={7} placeholder="#8E4EC6" accessibilityLabel="Custom colour as a hex code, then Enter" /></View>
        </View>
        {hexError ? <Text style={[t.text.small, { color: t.c.statusDanger }]}>Enter a hex colour such as #8E4EC6</Text> : null}
      </View> : null}
      {withIcon ? (
        <>
          <Text style={t.text.label}>Icon</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
            <IconButton t={t} size="sm" icon="Slash" label="No icon" tone={value.icon === null ? t.c.foreground : undefined} onPress={() => onChange({ ...value, icon: null })} />
            {DECOR_ICONS.map((name) => {
              const icon = `lucide:${name}`;
              const on = value.icon === icon;
              // Pressing the chosen icon again takes it off; choosing one replaces any typed text.
              return (
                <IconButton
                  key={name}
                  t={t}
                  size="sm"
                  icon={name}
                  label={on ? `Icon: ${name}, chosen. Press to remove` : `Icon: ${name}`}
                  tone={on ? value.color ?? t.c.foreground : undefined}
                  onPress={() => {
                    setEmoji("");
                    onChange({ ...value, icon: on ? null : icon });
                  }}
                />
              );
            })}
          </View>
          <Field
            t={t}
            plain
            value={emoji}
            onChangeText={(text) => {
              setEmoji(text);
              // Emptying the field takes off the typed icon it set.
              if (text.trim() === "" && value.icon?.startsWith("emoji:")) onChange({ ...value, icon: null });
            }}
            onSubmit={() => {
              const typed = emoji.trim();
              if (typed) onChange({ ...value, icon: `emoji:${typed}` });
            }}
            maxLength={8}
            placeholder="Or type an emoji and press Enter"
            accessibilityLabel="Emoji icon"
          />
        </>
      ) : null}
    </View>
  );
}
