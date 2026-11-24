import type { PluginClientContext, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { checkpointRead, checkpointSave, EMPTY_CHECKPOINT, type Checkpoint, type CheckpointFields } from "../shared/work-checkpoints";
import { Button, Field, useTokens } from "./ui/kit";
import { checkpointDirty, createCheckpointDrafts } from "./checkpoint-draft";

export function createCheckpointPanel(client: PluginClientContext) {
  const drafts = createCheckpointDrafts();
  function Body({ workspaceId, theme, layout }: PluginWorkspacePanelProps) {
    const t = useTokens(theme, layout.compact);
    const held = drafts.get(workspaceId);
    const [saved, setSaved] = useState<Checkpoint | null>(held?.baseline ?? null), [fields, setFields] = useState<CheckpointFields>(held?.fields ?? EMPTY_CHECKPOINT);
    const [comparison, setComparison] = useState<Checkpoint | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const pending = useRef(false);
    const dirty = !!saved && checkpointDirty({ baseline: saved, fields });
    const load = async (compare = dirty) => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true); setError(null);
      try { const value = await client.rpc(checkpointRead, { workspaceId }); if (compare) setComparison(value); else { setSaved(value); setFields(value.fields); } }
      catch (error) { setError(String(error instanceof Error ? error.message : error)); }
      finally { pending.current = false; setBusy(false); }
    };
    useEffect(() => { if (!held) void load(false); }, []);
    const save = async () => {
      if (!saved || pending.current) return;
      pending.current = true;
      setBusy(true); setError(null);
      const submitted = { baseline: saved, fields: structuredClone(fields) };
      try { const value = await client.rpc(checkpointSave, { workspaceId, revision: saved.revision, fields: submitted.fields }); setSaved(value); drafts.saved(workspaceId, submitted, value); setComparison(null); }
      catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        try { setComparison(await client.rpc(checkpointRead, { workspaceId })); } catch (readError) { setError(`${error instanceof Error ? error.message : String(error)} Latest checkpoint could not be loaded: ${readError instanceof Error ? readError.message : String(readError)}`); }
      }
      finally { pending.current = false; setBusy(false); }
    };
    return <ScrollView style={{ flex: 1, backgroundColor: t.c.surface0 }} contentContainerStyle={{ padding: t.inset, gap: 12 }}>
      <Text style={t.text.title}>Workspace checkpoint</Text><Text style={t.text.meta}>Explicit context, not an automatic summary. Stored on this host; do not put secrets here.</Text>
      <Text accessibilityLiveRegion="polite" style={dirty ? t.text.body : t.text.meta}>{busy ? "Saving / loading…" : dirty ? "Unsaved changes · draft kept while navigating in this client session" : saved ? "Saved" : "Not loaded"}</Text>
      {saved ? <Text style={t.text.meta}>{saved.updatedAt ? `Revision ${saved.revision} · ${saved.author} · ${saved.updatedAt}` : "No checkpoint yet"}</Text> : <Text style={t.text.meta}>{busy ? "Loading checkpoint…" : "Checkpoint is unavailable. Reload to try again."}</Text>}
      {([['goal', 'Goal'], ['verified', 'Last verified result'], ['blocked', 'Blocked by'], ['next', 'Next step']] as const).map(([key, label]) => <Field key={key} t={t} label={label} accessibilityLabel={label} multiline maxLength={2000} value={fields[key]} disabled={busy || !saved} onChangeText={(value) => { const next = { ...fields, [key]: value }; setFields(next); if (saved) drafts.set(workspaceId, { baseline: saved, fields: next }); }} />)}
      {error ? <Text accessibilityRole="alert" style={t.text.danger}>{error}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Button t={t} label="Save checkpoint" disabled={busy || !saved || !dirty} onPress={() => void save()} /><Button t={t} variant="ghost" label="Reload latest checkpoint" disabled={busy} onPress={() => void load()} /></View>
      {comparison ? <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: t.c.statusWarning, borderRadius: t.radius.row }}>
        <Text style={t.text.heading}>Compare before replacing · latest revision {comparison.revision}</Text>
        {([['goal', 'Goal'], ['verified', 'Last verified result'], ['blocked', 'Blocked by'], ['next', 'Next step']] as const).map(([key, label]) => <View key={key} style={{ gap: 4 }}><Text style={t.text.heading}>{label}</Text><Text selectable style={t.text.body}>Your draft: {fields[key] || "Empty"}</Text><Text selectable style={t.text.meta}>Latest saved: {comparison.fields[key] || "Empty"}</Text></View>)}
        <Text style={t.text.meta}>Keep my draft adopts this revision for your next explicit save. If another writer saves again, that save is still rejected.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Button t={t} variant="secondary" label="Keep my draft" onPress={() => { setSaved(comparison); drafts.set(workspaceId, { baseline: comparison, fields }); setComparison(null); setError(null); }} /><Button t={t} variant="ghost" label="Use latest and discard draft" onPress={() => { setSaved(comparison); setFields(comparison.fields); drafts.clear(workspaceId); setComparison(null); setError(null); }} /></View>
      </View> : null}
      <Text style={t.text.meta}>Navigation protection lasts until this plugin client reloads or closes. Save to keep changes on the host. Reloading a dirty form opens a comparison, not an overwrite.</Text>
    </ScrollView>;
  }
  return function CheckpointPanel(props: PluginWorkspacePanelProps) { return <Body key={props.workspaceId} {...props} />; };
}
