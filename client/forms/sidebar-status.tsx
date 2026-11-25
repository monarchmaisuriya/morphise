import { SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";
import { Platform, Text, View } from "react-native";
import { SIDEBAR_DEFAULT_SPEEDS, SIDEBAR_SPEEDS, SIDEBAR_STATES, SIDEBAR_STATE_LABELS, sidebarIndicatorLayout, sidebarStatusOptions, type SidebarIndicatorLayout, type SidebarStatusSettings, type SidebarStatusState, type SidebarStatusSpeed } from "../../shared/polish/sidebar-status";
import { sidebarStatusCss } from "../polish/web/sidebar-status";
import { applyStyleSheet } from "../web";
import { tokens } from "../ui/kit";
import { SelectField, type Form } from "./fields";

export function SidebarStatusSettings({ form, value, onChange, layoutValue, onLayoutChange }: { form: Form; value?: SidebarStatusSettings; onChange(value?: SidebarStatusSettings): void; layoutValue?: SidebarIndicatorLayout; onLayoutChange(value?: SidebarIndicatorLayout): void }) {
  const options = sidebarStatusOptions(value);
  const layout = sidebarIndicatorLayout(layoutValue);
  const t = tokens(form.theme, form.compact);
  useEffect(() => Platform.OS === "web" ? applyStyleSheet(sidebarStatusCss(value, "preview", layoutValue)) : undefined, [value, layoutValue]);
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
  return <SettingsSection title="Sidebar status indicators" info="Paseo-sized indicators with theme-owned colors: blue working, amber needs input, red failed and green unread. Done is a dot only. Rotation only, never pulsing; reduced motion stops rotation.">
    <SettingsCard>
      <SelectField label="Sidebar indicator style" value={options.style} options={[{ value: "ring", label: "Dot and ring" }, { value: "paseo", label: "Paseo default" }]} onChange={(style) => save({ ...value, style })} />
      {options.style === "paseo" ? <Text style={[t.text.meta, { padding: 12 }]}>Paseo draws its original indicators. Rotation choices are kept for when you choose Dot and ring again. Legacy size/color values no longer override Paseo geometry and theme.</Text> : SIDEBAR_STATES.map((state) => <View key={state} style={{ paddingVertical: 8 }}>
        <View style={{ paddingHorizontal: 12, flexDirection: "row", gap: 10, alignItems: "center" }}><Text testID={`morphise-status-preview-${state}`} accessibilityLabel={`${SIDEBAR_STATE_LABELS[state]} indicator preview`} style={{ width: Math.max(24, layout.size), height: 44 }} /><View style={{ gap: 2 }}><Text style={t.text.heading}>{SIDEBAR_STATE_LABELS[state]}</Text><Text style={t.text.meta}>Paseo geometry: 6px dot · 12px ring · 1.5px stroke</Text></View></View>
        <View style={{ paddingLeft: 28, flexDirection: "row", gap: 10, alignItems: "center" }}><Text testID={`morphise-status-nested-preview-${state}`} accessibilityLabel={`${SIDEBAR_STATE_LABELS[state]} nested indicator preview`} style={{ width: Math.max(24, layout.size), height: 32, opacity: 0.8 }} /><Text style={t.text.meta}>Nested: same geometry, quieter opacity</Text></View>
        {state !== "done" ? <SelectField label={`${SIDEBAR_STATE_LABELS[state]} rotation`} value={options.states[state].speed} options={(Object.keys(SIDEBAR_SPEEDS) as SidebarStatusSpeed[]).map((speed) => ({ value: speed, label: speed === "stopped" ? "Stopped" : `${speed[0]!.toUpperCase()}${speed.slice(1)} (${(speed === "fast" ? 900 : SIDEBAR_SPEEDS[speed]) / 1000} s / revolution)` }))} onChange={(speed) => stateChange(state, { speed })} /> : null}

      </View>)}
      <SettingsAction label="Recommended sidebar indicators" actionLabel="Reset sidebar indicators" hint="Restore theme colors and recommended rotation. Geometry follows Paseo; Done is a dot only. Other settings are kept." onPress={() => { onChange(undefined); onLayoutChange(undefined); }} />
    </SettingsCard>
  </SettingsSection>;
}
