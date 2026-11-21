import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { QUICK_CHAT_PREFERENCES, filteredQuickChats, quickChatArchive, quickChatContinue, quickChatList, quickChatPreferences, quickChatPrepare, quickChatRecover, quickChatSettings, quickChatStart, quickChatTargets, restoredQuickChatModel } from "../shared/quick-chat";
import { Button, Dropdown, Field, Icon, IconButton, PopoverHost, Segmented, Select, type Tokens, useTokens } from "./ui/kit";
import { quickChatModelChoices, type QuickChatModelChoice } from "./quick-chat-models";
import { screenOpener } from "./dispatch";
import { onRadioActivate, useTooltip } from "./web";
import { QUICK_CHAT_SETTINGS_PAGE, QuickChatPreferencesScreen } from "./quick-chat-preferences";

const SCREEN = "quick-chat";
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
// Workspace operation IDs use Morphise's existing cross-platform draft-ID source.
import { useDraftId } from "./board/card-editor";

function ModelOption({ t, option, checked, disabled, onPress }: { t: Tokens; option: QuickChatModelChoice; checked: boolean; disabled: boolean; onPress(): void }) {
  const tooltip = useTooltip(option.accessibleLabel, t.c);
  const element = useRef<View>(null);
  useEffect(() => onRadioActivate(element.current, () => { if (!disabled) onPress(); }), [disabled, onPress]);
  return <Pressable ref={(node) => { element.current = node; tooltip(node); }} accessibilityRole="radio" accessibilityLabel={option.accessibleLabel} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: t.row, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: checked ? t.c.surface2 : "transparent" }}>
    {option.iconSvg ? <Icon icon={{ svg: option.iconSvg }} size={16} color={t.c.foreground} /> : <Icon name="Cpu" size={16} color={t.c.foregroundMuted} />}<View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={2} style={t.text.body}>{option.label}</Text>{option.disambiguator ? <Text style={t.text.meta}>{option.disambiguator}</Text> : null}</View>{checked ? <Icon name="Check" size={14} color={t.c.accent} /> : null}
  </Pressable>;
}

function ModelPicker({ t, value, options, disabled, loading, onChange }: { t: Tokens; value: string; options: readonly QuickChatModelChoice[]; disabled: boolean; loading: boolean; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  const current = options.find((option) => option.value === value);
  const tooltip = useTooltip(current?.accessibleLabel, t.c);
  const trigger = useRef<View & { focus?(): void }>(null);
  const placeholder = loading ? "Loading models…" : "Choose a provider and model";
  const providerIcon = (choice?: QuickChatModelChoice) => choice?.iconSvg ? <Icon icon={{ svg: choice.iconSvg }} size={16} color={t.c.foreground} /> : <Icon name="Cpu" size={16} color={t.c.foregroundMuted} />;
  return <View style={{ minWidth: 0, maxWidth: "100%" }}>
    <Pressable ref={(node) => { anchor.current = node; trigger.current = node; tooltip(node); }} accessibilityRole="button" accessibilityLabel={`Provider and model: ${current?.accessibleLabel ?? placeholder}. Change`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(!open)} style={{ alignSelf: "flex-start", maxWidth: "100%", height: t.control, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: t.radius.control, borderWidth: 1, borderColor: open ? t.c.accent : t.c.border, backgroundColor: t.c.surface1, opacity: disabled ? 0.5 : 1 }}>
      {providerIcon(current)}<Text numberOfLines={1} style={{ color: current ? t.c.foreground : t.c.foregroundMuted, flexShrink: 1, fontSize: t.text.body.fontSize }}>{current?.label ?? placeholder}</Text>{current?.disambiguator ? <Text numberOfLines={1} style={t.text.meta}>{current.disambiguator}</Text> : null}<Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={t.c.foregroundMuted} />
    </Pressable>
    <Dropdown t={t} open={open && !disabled} onClose={() => setOpen(false)} anchor={anchor} width={280}>
      {options.map((option) => <ModelOption key={option.value} t={t} option={option} checked={option.value === value} disabled={disabled} onPress={() => { setOpen(false); onChange(option.value); trigger.current?.focus?.(); }} />)}
    </Dropdown>
  </View>;
}

export function QuickChatScreen({ client, theme, layout, navigation, params }: PluginScreenProps & { client: PluginClientContext }) {
  const t = useTokens(theme, layout.compact);
  const settings = useSettings(quickChatSettings);
  const preferences = useSettings(quickChatPreferences);
  const preferenceRef = useRef(preferences);
  preferenceRef.current = preferences;
  const personal = preferences.status === "ready" ? preferences.values : QUICK_CHAT_PREFERENCES;
  const toast = useToast();
  const [state, setState] = useState<Awaited<ReturnType<typeof readList>> | null>(null);
  const [models, setModels] = useState<QuickChatModelChoice[]>([]);
  const [manualModel, setModel] = useState<string | null>(null);
  const model = restoredQuickChatModel(manualModel, personal);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [utility, setUtility] = useState<"recovery" | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [archiveView, setArchiveView] = useState<"active" | "archived">("active");
  const [providerFilter, setProviderFilter] = useState("");
  const [sort, setSort] = useState<"updated" | "created" | "title">("updated");
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);
  const [locationChat, setLocationChat] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [recovered, setRecovered] = useState<{ agentId: string; workspaceId: string; warning: string | null } | null>(null);
  const [recoveredId, setRecoveredId] = useState("");
  const generation = useRef(0);
  const [targets, setTargets] = useState<{ id: string; title: string; directory: string }[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof prepare>> | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [recoveryId, setRecoveryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<{ agentId: string; workspaceId: string; warning: string | null } | null>(null);
  const [operationId, nextOperation] = useDraftId();
  const readList = () => client.rpc(quickChatList, { includeArchived: true });
  const changeArchive = (agentId: string, archived: boolean) => void run(async () => {
    await client.rpc(quickChatArchive, { agentId, archived });
    setArchiveConfirm(null);
    try { setState(await readList()); } catch (error) { setError(`Chat ${archived ? "archived" : "unarchived"}, but the list could not refresh: ${describe(error)}. Use Refresh chats; do not repeat the action.`); }
  });
  const prepare = (agentId: string, workspaceId: string) => client.rpc(quickChatPrepare, { agentId, workspaceId });
  const resetHandoff = () => {
    generation.current++;
    setSourceId(null); setTargets([]); setPreview(null); setText(""); setSearch(""); setResult(null); setAttempted(false); setShowFiles(false); setError(null);
  };
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(null);
    try { await action(); } catch (error) { setError(describe(error)); } finally { pending.current = false; setBusy(false); }
  };
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    readList().then((value) => { if (alive) { setState(value); setListLoading(false); } }, (error) => { if (alive) { setError(describe(error)); setListLoading(false); } });
    client.paseo.providers.snapshot().then((value) => { if (alive) { setModels(quickChatModelChoices(value.entries)); setProvidersLoading(false); } }, (error) => { if (alive) { setError(describe(error)); setProvidersLoading(false); } });
    const stopProviders = client.paseo.providers.subscribe((value) => { if (alive) { setModels(quickChatModelChoices(value.entries)); setProvidersLoading(false); } });
    return () => { mounted.current = false; alive = false; stopProviders(); };
  }, [client]);
  useEffect(() => {
    if (!params.agentId) return;
    if (pending.current) { setError("Finish the current operation before opening another handoff. Your current context is preserved."); return; }
    if (sourceId) { setError("Close the current handoff before opening another. Your reviewed context and recovery details are preserved."); return; }
    resetHandoff();
    const request = generation.current;
    setSourceId(params.agentId!); setUtility(null); setBusy(true); pending.current = true;
    client.rpc(quickChatTargets, {}).then((value) => { if (mounted.current && generation.current === request) setTargets(value.targets); }, (error) => mounted.current && generation.current === request && setError(describe(error))).finally(() => { if (generation.current === request) { pending.current = false; if (mounted.current) setBusy(false); } });
  }, [client, params.agentId]);
  const enabled = settings.status === "ready" && settings.values.enabled;
  const selectedModel = models.find((item) => item.value === model);
  const sourceTitle = state?.chats.find((chat) => chat.id === sourceId)?.title || "Selected Quick Chat";
  const activeCount = state?.chats.filter((chat) => !chat.archivedAt).length ?? 0;
  const archivedCount = state?.chats.filter((chat) => !!chat.archivedAt).length ?? 0;
  const visibleChats = filteredQuickChats(state?.chats ?? [], { archived: archiveView === "archived", query: chatSearch, provider: providerFilter, sort });
  const providers = [...new Set(state?.chats.map((chat) => chat.provider).filter((value): value is string => !!value) ?? [])].sort();
  const actionRow = { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 8 };
  const panelStyle = { padding: layout.compact ? 16 : 20, gap: 16, borderRadius: t.radius.panel, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 };
  return <PopoverHost><ScrollView style={{ flex: 1, backgroundColor: t.c.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 32, alignItems: "center" }}>
    <View style={{ width: "100%", maxWidth: personal.width === "wide" ? 1200 : 880, gap: 20 }}>
      <View style={{ ...actionRow, justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 180, gap: 6 }}><Text style={t.text.title}>Quick Chat</Text><Text style={t.text.meta}>A place for questions and ideas, before they become a project.</Text></View>
        <View style={actionRow}>
          <Button t={t} variant={utility === "recovery" ? "secondary" : "ghost"} icon="RotateCcw" label="Recover handoff" disabled={busy} onPress={() => setUtility(utility === "recovery" ? null : "recovery")} />
        </View>
      </View>
      {error ? <View style={{ padding: 12, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.c.statusDanger }}><Text accessibilityRole="alert" style={t.text.danger}>{error}</Text></View> : null}
      {!navigation ? <Text accessibilityRole="alert" style={t.text.danger}>Update the Paseo app to open native chats from this screen. You can still review and recover handoffs.</Text> : null}

      {utility === "recovery" ? <View style={panelStyle}>
        <View style={{ ...actionRow, justifyContent: "space-between" }}><Text style={t.text.heading}>Recover an interrupted handoff</Text><IconButton t={t} icon="X" label="Close recovery" onPress={() => setUtility(null)} /></View>
        <Text style={t.text.meta}>Check whether a project chat was created. This only looks up the result; it never resends context.</Text>
        <View style={actionRow}><Field t={t} grow value={recoveryId} onChangeText={setRecoveryId} placeholder="Paste the recovery ID" accessibilityLabel="Recovery ID" plain maxLength={36} /><Button t={t} label="Check recovery ID (does not resend)" disabled={busy || !/^[0-9a-f-]{36}$/i.test(recoveryId)} onPress={() => void run(async () => { const id = recoveryId; const value = await client.rpc(quickChatRecover, { operationId: id }); setRecovered(value); setRecoveredId(id); })} /></View>
        {recovered ? <View style={{ gap: 8 }}><Text style={t.text.body}>{recovered.warning || "Project chat found."}</Text><Text selectable style={t.text.meta}>Recovery ID: {recoveredId}</Text><View style={actionRow}><Button t={t} label="Open recovered project chat" disabled={!navigation} onPress={() => navigation?.openAgent({ agentId: recovered.agentId })} /></View></View> : null}
      </View> : null}

      {!sourceId ? <>
        <View style={{ gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.c.border }}>
          {settings.status !== "ready" ? <Text style={t.text.meta}>{settings.status === "invalid" ? "Quick Chat settings could not be read. Open Settings to inspect your configuration." : "Loading Quick Chat settings…"}</Text> : !enabled ? <View style={actionRow}><Text style={t.text.body}>Quick Chat is turned off for this host.</Text><Button t={t} variant="primary" icon="Settings2" label="Open Quick Chat settings" onPress={() => client.openSettings(QUICK_CHAT_SETTINGS_PAGE)} /></View> : <>
            <View style={{ ...actionRow, justifyContent: "space-between" }}>
              <View style={{ flexShrink: 1, minWidth: 0 }}><ModelPicker t={t} value={model} options={models} loading={providersLoading} disabled={busy} onChange={setModel} /></View>
              <Button t={t} variant="primary" icon="MessageSquarePlus" label={busy ? "Working…" : "New Quick Chat"} disabled={busy || preferences.status !== "ready" || !navigation || !selectedModel} onPress={() => void run(async () => {
                if (!models.some((item) => item.value === model)) throw new Error("Choose an available model before starting a chat.");
                const captured = preferenceRef.current;
                const used = model;
                const created = await client.rpc(quickChatStart, { operationId, provider: used });
                nextOperation();
                navigation?.openAgent({ agentId: created.agentId });
                const latest = preferenceRef.current;
                const warn = (message: string) => { setError(message); toast.error(message); };
                if (captured.status !== "ready" || latest.status !== "ready" || captured.revision !== latest.revision) {
                  warn("Chat opened. Preferences changed while it was starting, so its model was not remembered.");
                  return;
                }
                if (!latest.values.rememberModel || latest.values.lastModel === used) return;
                if (latest.saving) { warn("Chat opened. Preferences are being saved elsewhere, so its model was not remembered."); return; }
                void latest.save({ ...latest.values, lastModel: used }, latest.revision).then((ok) => { if (!ok) warn("Chat opened, but its model could not be remembered. Your other preferences were kept; review Quick Chat settings."); }, () => warn("Chat opened, but its model could not be remembered. Review Quick Chat settings."));
              })} />
            </View>
            {preferences.status !== "ready" ? <Text style={t.text.meta}>{preferences.status === "invalid" ? "Device preferences could not be read. Open Quick Chat settings; no saved model has been replaced." : "Loading your saved preferences…"}</Text> : model && !selectedModel ? <Text style={t.text.danger}>Your selected model is no longer available. Choose another model; nothing has been substituted.</Text> : !models.length && !providersLoading ? <View style={{ gap: 8 }}><Text style={t.text.meta}>No available models yet. Check your provider setup in Paseo, then refresh.</Text><View style={actionRow}><Button t={t} variant="ghost" label="Refresh providers" disabled={busy} onPress={() => void run(async () => setModels(quickChatModelChoices((await client.paseo.providers.snapshot()).entries)))} /></View></View> : !model ? <Text style={t.text.meta}>Choose a model to start a conversation.</Text> : null}
          </>}
        </View>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ ...actionRow, minWidth: 0, flex: 1 }}><Segmented t={t} label="Chat archive view" value={archiveView} onChange={(value) => { if (!busy) { setArchiveView(value); setArchiveConfirm(null); } }} options={[{ value: "active", label: `Active · ${activeCount}` }, { value: "archived", label: `Archived · ${archivedCount}` }]} /><Select t={t} label="Filter by provider" value={providerFilter} onChange={setProviderFilter} options={[{ value: "", label: "All providers" }, ...providers.map((value) => ({ value, label: value }))]} /><Select<"updated" | "created" | "title"> t={t} label="Sort chats" value={sort} onChange={setSort} options={[{ value: "updated", label: "Recently updated" }, { value: "created", label: "Newest created" }, { value: "title", label: "Title A–Z" }]} /></View>
          {providerFilter || chatSearch ? <View style={{ alignSelf: "flex-start" }}><Button t={t} variant="ghost" icon="X" label="Clear filters" onPress={() => { setProviderFilter(""); setChatSearch(""); }} /></View> : null}
            <View style={{ marginLeft: "auto", flexShrink: 0 }}><IconButton t={t} icon="RefreshCw" label="Refresh chats" disabled={busy || listLoading} onPress={() => void run(async () => { setListLoading(true); try { setState(await readList()); } finally { setListLoading(false); } })} /></View>
          </View>
          {!state?.archiveSupported ? <Text style={t.text.meta}>Archive controls require an updated Morphise host. Existing chats remain available.</Text> : null}
          {archiveView === "archived" ? <Text style={t.text.meta}>Unarchive restores the same chat and may initialize its provider or startup hooks. Morphise sends no new prompt; removed command-output logs are not restored.</Text> : null}
          {state?.chats.length ? <Field t={t} plain icon="Search" value={chatSearch} onChangeText={setChatSearch} placeholder="Find a chat by title" accessibilityLabel="Find a Quick Chat" /> : null}
          {listLoading ? <Text style={t.text.meta}>Loading your chats…</Text> : !state ? <Text style={t.text.meta}>The chat list could not be loaded. Use Refresh chats to try again.</Text> : !(archiveView === "archived" ? archivedCount : activeCount) ? <View style={{ paddingVertical: 12, gap: 6 }}><Text style={t.text.heading}>{archiveView === "archived" ? "No archived chats" : "Start your first conversation"}</Text><Text style={t.text.meta}>{archiveView === "archived" ? "Chats you archive will appear here. Unarchive returns the same chat to Active, but does not restore removed command logs." : "Start a Quick Chat above. You can bring the conversation into a project later."}</Text></View> : !visibleChats.length ? <Text style={t.text.meta}>No chats match the current search and provider filter.</Text> : <View style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.panel, overflow: "hidden" }}>{visibleChats.map((chat, index) => <View key={chat.id} style={{ padding: personal.density === "compact" ? 10 : 16, borderTopWidth: index ? 1 : 0, borderTopColor: t.c.border, ...actionRow, justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${chat.title}`} disabled={busy || !navigation} onPress={() => navigation?.openAgent({ agentId: chat.id })} style={{ flex: 1, minWidth: 140, flexDirection: "row", alignItems: "center", gap: 12 }}><Icon name="MessageSquare" size={18} color={t.c.foregroundMuted} /><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={2} style={t.text.body}>{chat.title}</Text>{personal.showDescriptions ? <Text style={t.text.meta}>Project-free conversation</Text> : null}</View></Pressable>
            <View style={{ ...actionRow, maxWidth: "100%", flexShrink: 1 }}>
              <IconButton t={t} icon="Info" label={`Files location: ${chat.title}`} onPress={() => setLocationChat(locationChat === chat.id ? null : chat.id)} />
              {enabled && !chat.archivedAt ? <IconButton t={t} icon="FolderInput" label={`Continue ${chat.title} in project`} disabled={busy} onPress={() => { resetHandoff(); setSourceId(chat.id); setUtility(null); const request = generation.current; void run(async () => { const value = await client.rpc(quickChatTargets, {}); if (generation.current === request) setTargets(value.targets); }); }} /> : null}
              {state.archiveSupported ? chat.archivedAt ? <IconButton t={t} icon="ArchiveRestore" label={`Unarchive ${chat.title}`} disabled={busy} onPress={() => changeArchive(chat.id, false)} /> : enabled ? <IconButton t={t} icon="Archive" label={`Archive ${chat.title}`} disabled={busy} onPress={() => setArchiveConfirm(archiveConfirm === chat.id ? null : chat.id)} /> : null : null}
            </View>
            {archiveConfirm === chat.id ? <View style={{ width: "100%", gap: 10, padding: 12, borderWidth: 1, borderColor: t.c.statusDanger, borderRadius: t.radius.control }}><Text style={t.text.heading}>Archive “{chat.title}”?</Text><Text style={t.text.body}>This closes the agent and stops its work and running Morphise commands. Saved command-output logs are removed by the existing archive policy. The conversation and scratch files stay; unarchiving may initialize the provider but cannot restore removed logs.</Text><View style={actionRow}><Button t={t} variant="danger" label="Archive chat" disabled={busy} onPress={() => changeArchive(chat.id, true)} /><Button t={t} variant="ghost" label="Cancel archive" disabled={busy} onPress={() => setArchiveConfirm(null)} /></View></View> : null}
            {locationChat === chat.id ? <View style={{ width: "100%", minWidth: 0, gap: 6 }}><Text style={t.text.label}>Files on the daemon host, not in a project</Text>{chat.directory ? <Text selectable style={t.text.body}>Working folder: {chat.directory}</Text> : <Text style={t.text.meta}>The file location is unavailable or could not be verified. The scratch folder may be missing; older hosts may need a Morphise update.</Text>}{chat.docsDirectory ? <Text selectable style={t.text.meta}>Relative docs/ resolves to: {chat.docsDirectory}</Text> : null}<Text style={t.text.meta}>This is a path, not confirmation that a folder or report exists. Files stay here when you continue in a project.</Text></View> : null}
          </View>)}</View>}
        </View>
      </> : <View style={{ gap: 20 }}>
        <View style={{ ...actionRow, justifyContent: "space-between" }}><Button t={t} variant="ghost" icon="ArrowLeft" label="Back to chats" disabled={busy} onPress={resetHandoff} /><Text style={t.text.meta}>{result ? "Destination → Review → Result" : preview ? "Destination → Review" : "Destination"}</Text></View>
        <View style={{ gap: 6 }}><Text style={t.text.title}>{result ? "Your idea has a project" : preview ? "Review your handoff" : "Continue in a project"}</Text><Text style={t.text.meta}>From: {sourceTitle}</Text></View>
        {result ? <View style={panelStyle}><Text style={t.text.body}>{result.warning || "Project chat created. The original Quick Chat is unchanged."}</Text><View style={actionRow}><Button t={t} variant="primary" icon="SquareArrowRight" label="Open project chat" disabled={!navigation} onPress={() => navigation?.openAgent({ agentId: result.agentId })} /><Button t={t} variant="ghost" label="Back to chats" onPress={resetHandoff} /></View>{preview ? <Text selectable style={t.text.meta}>Recovery ID: {preview.previewId}</Text> : null}</View> : !preview ? <View style={{ gap: 12 }}>
          <Field t={t} plain icon="Search" value={search} onChangeText={setSearch} placeholder="Find a project or workspace" />
          <Text style={t.text.meta}>Choose an open workspace. To use another folder, add it as a project in Paseo first. No disk-wide search is performed.</Text>
          {busy ? <Text style={t.text.meta}>Loading project context…</Text> : !targets.length ? <Text style={t.text.body}>No open project workspaces are available.</Text> : !targets.some((target) => `${target.title} ${target.directory}`.toLowerCase().includes(search.toLowerCase())) ? <Text style={t.text.meta}>No workspaces match “{search}”. Try another project name or path.</Text> : null}
          {targets.filter((target) => `${target.title} ${target.directory}`.toLowerCase().includes(search.toLowerCase())).map((target) => <Pressable key={target.id} accessibilityRole="button" accessibilityLabel={`Prepare context for ${target.title}, ${target.directory}`} disabled={busy} onPress={() => { const request = generation.current; void run(async () => { const value = await prepare(sourceId, target.id); if (generation.current === request) { setPreview(value); setText(value.text); setAttempted(false); } }); }} style={{ padding: 16, borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.control, flexDirection: "row", alignItems: "center", gap: 12 }}><Icon name="FolderGit2" size={18} color={t.c.foregroundMuted} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={t.text.body}>{target.title}</Text><Text numberOfLines={2} style={t.text.meta}>{target.directory}</Text></View><Icon name="ChevronRight" size={16} color={t.c.foregroundMuted} /></Pressable>)}
          <View style={actionRow}><Button t={t} variant="ghost" label="Cancel handoff" disabled={busy} onPress={resetHandoff} /></View>
        </View> : <View style={{ gap: 16 }}>
          <View style={panelStyle}><Text selectable style={t.text.body}>Destination: {preview.directory}</Text><Text style={t.text.meta}>Provider/model: {preview.provider} · {preview.entries} history entries read</Text><Text style={preview.partial ? t.text.danger : t.text.meta}>{preview.partial ? "Partial history: earlier or oversized content was omitted. Review the context carefully." : "Visible message history prepared."}</Text></View>
          <Text style={t.text.body}>A new project chat will receive the text below. Your original chat and scratch files stay where they are.</Text>
          <Field t={t} label={`Context to send · ${text.length.toLocaleString()} / 40,000 characters`} multiline value={text} maxLength={40000} disabled={busy || attempted} textStyle={{ minHeight: layout.compact ? 220 : 320, maxHeight: 560 }} onChangeText={setText} accessibilityLabel="Context to send" />
          <Text style={t.text.meta}>Review for secrets before sending to the displayed provider. Normal project permission defaults apply. This is a reviewed snapshot, not a live conversation or session move; later changes in another client are not included. Reasoning, tool outputs and attachments are excluded.</Text>
          <View style={{ alignSelf: "flex-start" }}><Button t={t} variant="ghost" icon={showFiles ? "ChevronUp" : "ChevronDown"} label={`Scratch files · ${preview.files.length}${preview.filesPartial ? "+" : ""} (not copied)`} onPress={() => setShowFiles(!showFiles)} /></View>
          {showFiles ? <Text selectable style={t.text.meta}>{preview.files.join("\n") || "No top-level files."}{preview.filesPartial ? "\nMore directories/files may exist; this is not a complete inventory." : ""}</Text> : null}
          <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: t.c.border, gap: 12 }}>
            <View style={actionRow}>{!attempted ? <Button t={t} variant="primary" icon="FolderInput" label={busy ? "Creating project chat…" : "Create project chat with this context"} disabled={busy || !text.trim()} onPress={() => { const request = generation.current; void run(async () => { setAttempted(true); const value = await client.rpc(quickChatContinue, { previewId: preview.previewId, text }); if (generation.current === request) setResult(value); }); }} /> : <Button t={t} label={busy ? "Checking…" : "Check handoff result (does not resend)"} disabled={busy} onPress={() => { const request = generation.current; void run(async () => { const value = await client.rpc(quickChatRecover, { operationId: preview.previewId }); if (generation.current === request) setResult(value); }); }} />}<Button t={t} variant="ghost" label="Close preview" disabled={busy} onPress={resetHandoff} /></View>
            <Text selectable style={t.text.meta}>Recovery ID: {preview.previewId}. Keep it if you close this screen during creation. Recovery only checks the result; it never resends.</Text>
          </View>
        </View>}
      </View>}
    </View>
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
    client.addSettingsScreen({ id: QUICK_CHAT_SETTINGS_PAGE, title: "Quick Chat", icon: "MessageSquarePlus", Component: (props) => <QuickChatPreferencesScreen {...props} client={client} /> }),
    client.addScreen({ id: SCREEN, title: "Quick Chat", Component: (props) => <QuickChatScreen {...props} client={client} /> }),
    client.addSidebarHeaderItem({ id: "quick-chat", title: "Quick Chat", Component: ({ openScreen, currentScreen }) => <SidebarRow icon="MessageSquarePlus" active={currentScreen?.screenId === SCREEN} onPress={() => openScreen({ screenId: SCREEN })} /> }),
    client.addCommandCenterItem({ id: "quick-chat", title: "Open Quick Chat", icon: "MessageSquarePlus", context: "global", onSelect: ({ openScreen }) => openScreen({ screenId: SCREEN }) }),
    client.addCommandCenterItem({ id: "quick-chat-continue", title: "Continue Quick Chat in project", icon: "FolderInput", context: "agent", onSelect: ({ openScreen, agent }) => openScreen({ screenId: SCREEN, params: { agentId: agent.id } }) }),
  ];
  return () => { stopped = true; clearInterval(poll); pills.forEach((pill) => pill.remove()); cleanups.forEach((stop) => stop()); };
}
