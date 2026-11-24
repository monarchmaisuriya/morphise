import type { ComponentType } from "react";
import { useState } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { findSettings, SETTINGS_DIRECTORY } from "../shared/settings-directory";

export function SettingsDirectory({ current, open, theme }: { current?: string; open(id: string): void; theme: PluginSurfaceProps["theme"] }) {
  const [query, setQuery] = useState("");
  const page = SETTINGS_DIRECTORY.find((value) => value.id === current);
  const matches = findSettings(query);
  return <SettingsSection title="Find Morphise settings" info="Search page names and indexed topics, not saved values or secrets.">
    {page ? <Text style={{ color: theme.colors.foregroundMuted }}>{page.scope}</Text> : null}
    <SettingsInput label="Search Morphise settings" initialValue="" onChangeText={setQuery} placeholder="Status rings, model memory, run output…" />
    {query.trim() || !current ? <SettingsCard><Text style={{ color: theme.colors.foregroundMuted }}>{matches.length} matching settings pages</Text>{matches.map((value) => <SettingsAction key={value.id} label={value.title} hint={value.scope} actionLabel={`Open ${value.title} settings`} onPress={() => open(value.id)} />)}{!matches.length ? <Text style={{ color: theme.colors.foregroundMuted }}>No settings pages match. Try a broader topic.</Text> : null}</SettingsCard> : null}
  </SettingsSection>;
}

export function withSettingsDirectory(Component: ComponentType<PluginSurfaceProps>, id: string, open: (id: string) => void): ComponentType<PluginSurfaceProps> {
  return function SettingsWithSearch(props) { return <><SettingsDirectory current={id} open={open} theme={props.theme} /><Component {...props} /></>; };
}
