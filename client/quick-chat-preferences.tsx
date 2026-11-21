import type { PluginClientContext, PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { QUICK_CHAT_PREFERENCES, quickChatList, quickChatPreferences, quickChatSettings, type QuickChatPreferences } from "../shared/quick-chat";
import { Button, Segmented, useTokens } from "./ui/kit";

export const QUICK_CHAT_SETTINGS_PAGE = "quick-chat";

export function QuickChatPreferencesScreen({ client, theme, layout }: PluginSurfaceProps & { client: PluginClientContext }) {
  const t = useTokens(theme, layout.compact);
  const host = useSettings(quickChatSettings);
  const stored = useSettings(quickChatPreferences);
  const values = stored.status === "ready" ? stored.values : QUICK_CHAT_PREFERENCES;
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let alive = true; client.rpc(quickChatList, {}).then((value) => alive && setDirectory(value.directory), (error) => alive && setError(error instanceof Error ? error.message : String(error))); return () => { alive = false; }; }, [client]);
  const save = async (patch: Partial<QuickChatPreferences>) => {
    if (pending.current || stored.status !== "ready") return;
    pending.current = true; setBusy(true); setError(null); setFeedback(null);
    try {
      const ok = await stored.save({ ...stored.values, ...patch }, stored.revision);
      if (!ok) setError("Preferences were not saved. They may have changed in another screen. Review the current values and try again.");
      else setFeedback("Preferences saved on this device.");
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const disabled = busy || stored.status !== "ready" || stored.saving;
  const row = { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 12, justifyContent: "space-between" as const };
  const section = { gap: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: t.c.border };
  return <ScrollView style={{ flex: 1, backgroundColor: t.c.surface0 }} contentContainerStyle={{ padding: t.inset, alignItems: "center" }}><View style={{ width: "100%", maxWidth: 880, gap: 8 }}>
    <Text style={t.text.title}>Quick Chat settings</Text><Text style={t.text.meta}>Choose how Quick Chat starts and looks. Conversation and handoff safeguards stay unchanged.</Text>
    <View style={section}><Text style={t.text.heading}>Availability · on this host</Text><View style={row}><View style={{ flex: 1, minWidth: 180, gap: 4 }}><Text style={t.text.body}>Allow new Quick Chats</Text><Text style={t.text.meta}>Disabling keeps existing chats, files and recovery records.</Text></View><Button t={t} label={host.status === "ready" && host.values.enabled ? "Disable new Quick Chats" : "Enable Quick Chat"} disabled={busy || host.status !== "ready" || host.saving} onPress={() => { if (pending.current || host.status !== "ready") return; pending.current = true; setBusy(true); setError(null); setFeedback(null); void host.save({ ...host.values, enabled: !host.values.enabled }, host.revision).then((ok) => ok ? setFeedback("Host availability saved.") : setError("Could not save host availability. Review the current setting and try again."), (error) => setError(String(error))).finally(() => { pending.current = false; setBusy(false); }); }} /></View>{host.status !== "ready" ? <Text style={t.text.danger}>{host.status === "invalid" ? "Host settings are invalid; no availability changes can be saved." : "Loading host settings…"}</Text> : null}</View>
    <View style={section}><Text style={t.text.heading}>Start-up · on this device</Text><View style={row}><View style={{ flex: 1, minWidth: 180, gap: 4 }}><Text style={t.text.body}>Remember last used model</Text><Text style={t.text.meta}>Preload the exact provider/model from your last successful Quick Chat. Unavailable models are never replaced.</Text></View><Button t={t} label={values.rememberModel ? "Remember model: on" : "Remember model: off"} disabled={disabled} onPress={() => void save({ rememberModel: !values.rememberModel, lastModel: "" })} /></View><Text selectable style={t.text.meta}>Saved provider/model: {values.lastModel || "None yet"}</Text><View style={{ alignSelf: "flex-start" }}><Button t={t} variant="ghost" label="Forget saved model" disabled={disabled || !values.lastModel} onPress={() => void save({ lastModel: "" })} /></View></View>
    <View style={section}><Text style={t.text.heading}>Appearance · on this device</Text><Text style={t.text.label}>Content width</Text><View pointerEvents={disabled ? "none" : "auto"}><Segmented t={t} label="Quick Chat content width" value={values.width} onChange={(width) => { if (!disabled) void save({ width }); }} options={[{ value: "comfortable", label: "Comfortable" }, { value: "wide", label: "Wide" }]} /></View><Text style={t.text.label}>Conversation rows</Text><View pointerEvents={disabled ? "none" : "auto"}><Segmented t={t} label="Quick Chat row density" value={values.density} onChange={(density) => { if (!disabled) void save({ density }); }} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} /></View><View style={row}><Text style={t.text.body}>Show conversation descriptions</Text><Button t={t} label={values.showDescriptions ? "Descriptions: on" : "Descriptions: off"} disabled={disabled} onPress={() => void save({ showDescriptions: !values.showDescriptions })} /></View><View style={{ alignSelf: "flex-start" }}><Button t={t} variant="ghost" label="Reset appearance" disabled={disabled} onPress={() => void save({ width: "comfortable", density: "comfortable", showDescriptions: true })} /></View></View>
    {stored.status !== "ready" ? <Text style={t.text.danger}>{stored.status === "invalid" ? "Device preferences are invalid. No preferences have been overwritten." : "Loading device preferences…"}</Text> : null}
    {busy || stored.saving ? <Text style={t.text.meta}>Saving…</Text> : feedback ? <Text accessibilityLiveRegion="polite" style={t.text.meta}>{feedback}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={t.text.danger}>{error}</Text> : null}
    <View style={section}><Text style={t.text.heading}>Storage and privacy</Text><Text style={t.text.body}>Each Quick Chat workspace has its own scratch folder. Native tabs in that workspace share it; only chats started through Morphise are managed as Quick Chats. Scratch storage is not a security sandbox.</Text><Text selectable style={t.text.meta}>Scratch storage on this host: {directory || "Not available yet"}</Text><Text style={t.text.meta}>Project handoffs keep the original chat and files. No automatic file copying, archiving or whole-disk search. Recovery covers process restarts, not guaranteed power-loss durability. Model memory stores only a provider/model identifier on this device, not conversation text.</Text></View>
  </View></ScrollView>;
}
