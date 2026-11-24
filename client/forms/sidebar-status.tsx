import { SettingsAction, SettingsCard, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { SIDEBAR_DEFAULT_SPEEDS, SIDEBAR_SPEEDS, SIDEBAR_STATES, SIDEBAR_STATE_LABELS, sidebarStatusOptions, type SidebarStatusSettings, type SidebarStatusState, type SidebarStatusSpeed } from "../../shared/polish/sidebar-status";
import { sidebarStatusCss } from "../polish/web/sidebar-status";
import { applyStyleSheet } from "../web";
import { tokens } from "../ui/kit";
import { SelectField, type Form } from "./fields";

function StatusColor({ label, value, onChange }: { label: string; value: string; onChange(value?: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = !draft || /^#[0-9a-f]{6}$/i.test(draft);
  return <SettingsInput label={label} initialValue={value} hint="Blank uses the theme default. Use #RRGGBB for a custom color." error={valid ? null : "Enter six hex digits, such as #4c8dff. Your saved color is unchanged."} onChangeText={(text) => { setDraft(text); if (!text || /^#[0-9a-f]{6}$/i.test(text)) onChange(text || undefined); }} />;
}

export function SidebarStatusSettings({ form, value, onChange }: { form: Form; value?: SidebarStatusSettings; onChange(value?: SidebarStatusSettings): void }) {
  const options = sidebarStatusOptions(value);
  const [resetKey, setResetKey] = useState(0);
  const t = tokens(form.theme, form.compact);
  useEffect(() => Platform.OS === "web" ? applyStyleSheet(sidebarStatusCss(value, "preview")) : undefined, [value]);
  const save = (next: SidebarStatusSettings) => {
    if (next.style === "ring") delete next.style;
    if (!next.states) delete next.states;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const stateChange = (state: SidebarStatusState, patch: { color?: string; speed?: SidebarStatusSpeed }) => {
    const entry = { ...value?.states?.[state], ...patch };
    if (!entry.color) delete entry.color;
    if (entry.speed === SIDEBAR_DEFAULT_SPEEDS[state]) delete entry.speed;
    const states = { ...value?.states, [state]: entry };
    if (!Object.keys(entry).length) delete states[state];
    save({ ...value, states: Object.keys(states).length ? states : undefined });
  };
  return <SettingsSection title="Sidebar status indicators" info="Desktop and web: one dot-and-ring shape for every existing sidebar chat status slot. Rotation only, never pulsing. Reduced motion stops rotation. Choices belong to this Morphise profile.">
    <SettingsCard>
      <SelectField label="Sidebar indicator style" value={options.style} options={[{ value: "ring", label: "Dot and ring" }, { value: "paseo", label: "Paseo default" }]} onChange={(style) => save({ ...value, style })} />
      {options.style === "paseo" ? <Text style={[t.text.meta, { padding: 12 }]}>Paseo draws its original indicators. Your custom colors and speeds are kept for when you choose Dot and ring again.</Text> : SIDEBAR_STATES.map((state) => <View key={state} style={{ paddingVertical: 8 }}>
        <View style={{ paddingHorizontal: 12, flexDirection: "row", gap: 10, alignItems: "center" }}><Text testID={`morphise-status-preview-${state}`} accessibilityLabel={`${SIDEBAR_STATE_LABELS[state]} indicator preview`} style={{ width: 18, height: 18 }} /><Text style={t.text.heading}>{SIDEBAR_STATE_LABELS[state]}</Text></View>
        <SelectField label={`${SIDEBAR_STATE_LABELS[state]} rotation`} value={options.states[state].speed} options={(Object.keys(SIDEBAR_SPEEDS) as SidebarStatusSpeed[]).map((speed) => ({ value: speed, label: speed === "stopped" ? "Stopped" : `${speed[0]!.toUpperCase()}${speed.slice(1)} (${SIDEBAR_SPEEDS[speed] / 1000} s / revolution)` }))} onChange={(speed) => stateChange(state, { speed })} />
        <StatusColor key={`${form.inputKey}:${resetKey}:${state}:${options.states[state].color ?? "theme"}`} label={`${SIDEBAR_STATE_LABELS[state]} color`} value={options.states[state].color ?? ""} onChange={(color) => stateChange(state, { color })} />
      </View>)}
      <SettingsAction label="Recommended sidebar indicators" actionLabel="Reset sidebar indicators" hint="Restore Dot and ring with recommended colors and speeds. Other settings are kept." onPress={() => { setResetKey((key) => key + 1); onChange(undefined); }} />
    </SettingsCard>
  </SettingsSection>;
}
