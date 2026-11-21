import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { quickChatContinue, quickChatList, quickChatPrepare, quickChatRecover, quickChatSettings, quickChatStart, quickChatTargets } from "../shared/quick-chat";
import { Button, Field, PopoverHost, Select, useTokens } from "./ui/kit";
import { modelChoices } from "./dispatch-options";
import { screenOpener } from "./dispatch";

const SCREEN = "quick-chat";
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
// Workspace operation IDs use Morphise's existing cross-platform draft-ID source.
import { useDraftId } from "./board/card-editor";

export function QuickChatScreen({ client, theme, layout, navigation, params }: PluginScreenProps & { client: PluginClientContext }) {
  const t = useTokens(theme, layout.compact);
  const settings = useSettings(quickChatSettings);
  const [state, setState] = useState<Awaited<ReturnType<typeof readList>> | null>(null);
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [model, setModel] = useState("");
  const [targets, setTargets] = useState<{ id: string; title: string; directory: string }[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof prepare>> | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [recoveryId, setRecoveryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<{ agentId: string; workspaceId: string; warning: string | null } | null>(null);
  const [operationId, nextOperation] = useDraftId();
  const readList = () => client.rpc(quickChatList, {});
  const prepare = (agentId: string, workspaceId: string) => client.rpc(quickChatPrepare, { agentId, workspaceId });
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(null);
    try { await action(); } catch (error) { setError(describe(error)); } finally { pending.current = false; setBusy(false); }
  };
  useEffect(() => {
    let alive = true;
    readList().then((value) => alive && setState(value), (error) => alive && setError(describe(error)));
    client.paseo.providers.snapshot().then((value) => { if (alive) setModels(modelChoices(value.entries, [])); }, (error) => alive && setError(describe(error)));
    const stopProviders = client.paseo.providers.subscribe((value) => { if (alive) setModels(modelChoices(value.entries, [])); });
    return () => { alive = false; stopProviders(); };
  }, [client]);
  useEffect(() => {
    if (!params.agentId) return;
    let alive = true;
    client.rpc(quickChatTargets, {}).then((value) => { if (alive) { setSourceId(params.agentId!); setTargets(value.targets); } }, (error) => alive && setError(describe(error)));
    return () => { alive = false; };
  }, [client, params.agentId]);
  const enabled = settings.status === "ready" && settings.values.enabled;
  return <PopoverHost><ScrollView style={{ flex: 1, backgroundColor: t.c.surface0 }} contentContainerStyle={{ padding: t.inset, gap: 16 }}>
    <Text style={t.text.title}>Quick Chat</Text>
    <Text style={t.text.body}>Chat or capture an idea without choosing a project. Each Quick Chat workspace has its own scratch folder; native chat tabs in that workspace share it. Only chats started here are managed as Quick Chats. It is not a security sandbox.</Text>
    {settings.status !== "ready" ? <Text style={t.text.meta}>Loading Quick Chat settings…</Text> : <Button t={t} disabled={busy || settings.saving} label={enabled ? "Disable new Quick Chats" : "Enable Quick Chat"} onPress={() => void run(async () => { if (!(await settings.save({ enabled: !enabled }, settings.revision))) throw new Error("Could not save Quick Chat settings. Try again."); })} />}
    {enabled ? <><Select t={t} label="Provider and model" value={model} options={models} placeholder="Choose a provider and model" onChange={(value) => { if (!busy) setModel(value); }} /><Button t={t} icon="MessageSquarePlus" label="New Quick Chat" disabled={busy || !navigation || !model} onPress={() => void run(async () => { const created = await client.rpc(quickChatStart, { operationId, provider: model }); nextOperation(); navigation?.openAgent({ agentId: created.agentId }); })} /></> : null}
    {!navigation ? <Text style={t.text.danger}>Update the Paseo app to open native chats from this screen.</Text> : null}
    {state ? <Text style={t.text.small}>Scratch storage on this host: {state.directory}. Disabling keeps existing chats and files.</Text> : null}
    <Button t={t} variant="ghost" label="Refresh chats" disabled={busy} onPress={() => void run(async () => setState(await readList()))} />
    {state?.chats.map((chat) => <View key={chat.id} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.c.border }}>
      <Text style={t.text.heading}>{chat.title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button t={t} label="Open chat" disabled={busy || !navigation} onPress={() => navigation?.openAgent({ agentId: chat.id })} />
        {enabled ? <Button t={t} label="Continue in project" disabled={busy} onPress={() => void run(async () => { setPreview(null); setResult(null); setAttempted(false); setSourceId(chat.id); setTargets((await client.rpc(quickChatTargets, {})).targets); })} /> : null}
      </View>
    </View>)}
    {state && !state.chats.length ? <Text style={t.text.meta}>No Quick Chats yet. Start one above, then use Paseo's provider and model picker.</Text> : null}
    {sourceId && !preview ? <View style={{ gap: 8 }}>
      <Text style={t.text.heading}>Choose an open project workspace</Text>
      <Text style={t.text.small}>To use another folder, add it as a project in Paseo first. No disk-wide search is performed.</Text>
      <Field t={t} value={search} onChangeText={setSearch} placeholder="Find a project or workspace" />
      {targets.filter((target) => `${target.title} ${target.directory}`.toLowerCase().includes(search.toLowerCase())).map((target) => <Button key={target.id} t={t} label={target.title} accessibilityLabel={`Prepare context for ${target.title}, ${target.directory}`} disabled={busy} onPress={() => void run(async () => { const value = await prepare(sourceId, target.id); setPreview(value); setText(value.text); setAttempted(false); })} />)}
      <Button t={t} variant="ghost" label="Cancel handoff" disabled={busy} onPress={() => setSourceId(null)} />
    </View> : null}
    {preview ? <View style={{ gap: 12 }}>
      <Text style={t.text.heading}>Review context before sending</Text>
      <Text style={t.text.body}>Destination: {preview.directory}{"\n"}Provider/model: {preview.provider}{"\n"}{preview.entries} history entries read. {preview.partial ? "Partial history: earlier or oversized content omitted." : "Fetched visible message history."}</Text>
      <Text style={t.text.small}>This starts a new agent with normal project permission defaults. It sends the reviewed snapshot, not a live conversation or session move. Another client can still change the original; updates after preparation are not included. Reasoning, tool outputs and attachments are excluded. The original chat and scratch files remain. Review for secrets before sending to the displayed provider.</Text>
      <Text style={t.text.small}>Top-level scratch files (not copied): {preview.files.join(", ") || "none"}{preview.filesPartial ? ". More directories/files may exist; this is not a complete inventory." : ""}</Text>
      <Field t={t} label={`Context (${text.length}/40000 characters)`} multiline value={text} maxLength={40000} disabled={busy || attempted} onChangeText={setText} accessibilityLabel="Context to send" />
      {!attempted ? <Button t={t} variant="primary" label="Create project chat with this context" disabled={busy || !text.trim()} onPress={() => void run(async () => { setAttempted(true); setResult(await client.rpc(quickChatContinue, { previewId: preview.previewId, text })); })} /> : <Button t={t} label="Check handoff result (does not resend)" disabled={busy} onPress={() => void run(async () => setResult(await client.rpc(quickChatRecover, { operationId: preview.previewId })))} />}
      <Text selectable style={t.text.small}>Recovery ID: {preview.previewId}. Keep this ID if you close the screen during creation.</Text>
      <Button t={t} variant="ghost" label="Close preview" disabled={busy} onPress={() => { setPreview(null); setSourceId(null); }} />
    </View> : null}
    {result ? <View style={{ gap: 8 }}><Text style={t.text.body}>{result.warning || "Project chat created. The original Quick Chat is unchanged."}</Text><Button t={t} label="Open project chat" disabled={!navigation} onPress={() => navigation?.openAgent({ agentId: result.agentId })} /></View> : null}
    <Field t={t} label="Recover an interrupted handoff" value={recoveryId} onChangeText={setRecoveryId} placeholder="Paste the recovery ID" plain maxLength={36} />
    <Button t={t} label="Check recovery ID (does not resend)" disabled={busy || !/^[0-9a-f-]{36}$/i.test(recoveryId)} onPress={() => void run(async () => setResult(await client.rpc(quickChatRecover, { operationId: recoveryId })))} />
    {error ? <Text accessibilityRole="alert" style={t.text.danger}>{error}</Text> : null}
  </ScrollView></PopoverHost>;
}

export function registerQuickChatClient(client: PluginClientContext) {
  const pills = new Map<string, { remove(): void }>();
  let stopped = false;
  const refreshPills = async () => {
    const value = await client.rpc(quickChatList, {});
    if (stopped) return;
    const ids = new Set(value.enabled ? value.chats.map((chat) => chat.id) : []);
    for (const [id, pill] of pills) if (!ids.has(id)) { pill.remove(); pills.delete(id); }
    for (const chat of value.enabled ? value.chats : []) if (!pills.has(chat.id)) {
      pills.set(chat.id, client.addComposerPill({ id: `quick-chat-${chat.id}`, workspaceId: chat.workspaceId, agentId: chat.id, button: { title: "Continue in project", icon: "FolderInput", behavior: { kind: "action", onPress: () => { const open = screenOpener.get(); if (!open) throw new Error("Open Quick Chat from the sidebar or Command Center to continue in a project."); open({ screenId: SCREEN, params: { agentId: chat.id } }); } } } }));
    }
  };
  const poll = setInterval(() => { void refreshPills().catch((error) => console.error("[morphise] Quick Chat actions unavailable", describe(error))); }, 15000);
  void refreshPills().catch((error) => console.error("[morphise] Quick Chat actions unavailable", describe(error)));
  const cleanups = [
    client.addScreen({ id: SCREEN, title: "Quick Chat", Component: (props) => <QuickChatScreen {...props} client={client} /> }),
    client.addSidebarHeaderItem({ id: "quick-chat", title: "Quick Chat", Component: ({ openScreen, currentScreen }) => <SidebarRow icon="MessageSquarePlus" active={currentScreen?.screenId === SCREEN} onPress={() => openScreen({ screenId: SCREEN })} /> }),
    client.addCommandCenterItem({ id: "quick-chat", title: "Open Quick Chat", icon: "MessageSquarePlus", context: "global", onSelect: ({ openScreen }) => openScreen({ screenId: SCREEN }) }),
    client.addCommandCenterItem({ id: "quick-chat-continue", title: "Continue Quick Chat in project", icon: "FolderInput", context: "agent", onSelect: ({ openScreen, agent }) => openScreen({ screenId: SCREEN, params: { agentId: agent.id } }) }),
  ];
  return () => { stopped = true; clearInterval(poll); pills.forEach((pill) => pill.remove()); cleanups.forEach((stop) => stop()); };
}
