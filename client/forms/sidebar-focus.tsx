import { useSettings } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { FOCUS_TABS, focusTabsSchema } from "../../shared/sidebar-focus";
import { INDICATORS } from "../../shared/profile";
import { STATUS_TITLES } from "../../shared/arrange";
import { viewStateSettings } from "../../shared/view-state";
import { useDeviceValue } from "../device-choices";
import { StoredSettingStatus, SwitchField, TextField } from "./fields";
import { useState } from "react";

export function SidebarFocusSettings() {
  const stored = useSettings(viewStateSettings);
  const [enabled, setEnabled, , enabledError] = useDeviceValue(stored, "focusTabsEnabled", true);
  const [counts, setCounts, , countsError] = useDeviceValue(stored, "focusTabCounts", true);
  const [tabs, setTabs, , saveError] = useDeviceValue(stored, "focusTabs", focusTabsSchema.parse({}));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  if (stored.status !== "ready") return <StoredSettingStatus title="Sidebar tabs on this device" label="Sidebar tabs" stored={stored} />;
  return <SettingsSection title="Sidebar tabs on this device" info="Tabs replace status filters. Counts respect search and other filters, before row limits. Hiding every tab or the whole bar shows All. All always includes every state.">
    <SettingsCard><SwitchField label="Show sidebar tabs" value={enabled} onChange={setEnabled} error={enabledError} /><SwitchField label="Show tab counts" value={counts} onChange={setCounts} error={countsError} /></SettingsCard>
    {FOCUS_TABS.map((key) => <SettingsCard key={key}>
      <SwitchField label={`Show ${key} tab`} value={tabs[key].enabled} onChange={(value) => setTabs({ ...tabs, [key]: { ...tabs[key], enabled: value } })} error={saveError} />
      <TextField form={{ inputKey: "focus" }} label={`${key} tab label`} value={tabs[key].label} error={errors[key] ?? saveError} hint="1 to 24 characters. Labels do not change the selected states." onChange={(label) => {
        const result = focusTabsSchema.safeParse({ ...tabs, [key]: { ...tabs[key], label } });
        setErrors((before) => ({ ...before, [key]: result.success ? null : "Use a label between 1 and 24 characters." }));
        if (result.success) setTabs(result.data);
      }} />
      {key === "all" ? null : INDICATORS.map((indicator) => <SwitchField key={indicator} label={`${tabs[key].label}: ${STATUS_TITLES[indicator]}`} value={tabs[key].states.includes(indicator)} hint={tabs[key].states.length === 1 && tabs[key].states.includes(indicator) ? "At least one state must remain selected." : undefined} error={errors[`${key}-states`] ?? null} onChange={(on) => {
        const states = on ? [...tabs[key].states, indicator] : tabs[key].states.filter((value) => value !== indicator);
        if (!states.length) return setErrors((before) => ({ ...before, [`${key}-states`]: "Select at least one state." }));
        setErrors((before) => ({ ...before, [`${key}-states`]: null }));
        setTabs({ ...tabs, [key]: { ...tabs[key], states } });
      }} />)}
    </SettingsCard>)}
  </SettingsSection>;
}
