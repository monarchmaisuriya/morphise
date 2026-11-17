// The colour and icon of a group, project or workspace in "Your groups": 11 colours, 36 icons or any typed emoji.
// Ported from Project Groups by topar12 (MIT, see NOTICE.md), client/decor.tsx at 8515d90.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Decoration, DECOR_COLORS, DECOR_ICONS } from "../shared/project-groups";
import { Field, Icon, IconButton, type Tokens } from "./ui/kit";

// A stored icon drawn: "lucide:Name" as that icon, "emoji:x" as text.
export function DecorIcon({ icon, color, size }: { icon: string; color: string; size: number }) {
  if (icon.startsWith("emoji:")) return <Text style={{ fontSize: size - 1, lineHeight: size + 2 }}>{icon.slice("emoji:".length)}</Text>;
  return <Icon name={icon.slice("lucide:".length)} size={size} color={color} />;
}

// `withIcon` false offers colours only (workspaces). Every choice saves at once through `onChange`.
export function DecorPicker({ t, value, onChange, withIcon }: { t: Tokens; value: Decoration; onChange(next: Decoration): void; withIcon: boolean }) {
  const [emoji, setEmoji] = useState(value.icon?.startsWith("emoji:") ? value.icon.slice("emoji:".length) : "");
  const swatch = (color: string | null, name: string) => {
    const on = value.color === color;
    return (
      <Pressable
        key={name}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`Colour: ${name}`}
        onPress={() => onChange({ ...value, color })}
        style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: on ? 2 : 1, borderColor: on ? t.c.foreground : t.c.border, backgroundColor: color ?? "transparent" }}
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
      </View>
      {withIcon ? (
        <>
          <Text style={t.text.label}>Icon</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
            <IconButton t={t} size="sm" icon="Slash" label="No icon" tone={value.icon === null ? t.c.foreground : undefined} onPress={() => onChange({ ...value, icon: null })} />
            {DECOR_ICONS.map((name) => (
              <IconButton key={name} t={t} size="sm" icon={name} label={`Icon: ${name}`} tone={value.icon === `lucide:${name}` ? value.color ?? t.c.foreground : undefined} onPress={() => onChange({ ...value, icon: `lucide:${name}` })} />
            ))}
          </View>
          <Field
            t={t}
            plain
            value={emoji}
            onChangeText={setEmoji}
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
