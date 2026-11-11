import type { PluginClientContext, PluginOpenScreenInput, PluginScreenProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { Chats } from "./chats";
import { type DispatchSettings, dispatchSettings, modeChoices, modelChoices, modelsOf, projectsOf, providerStatus, splitPrompts, titleFromPrompt } from "./dispatch-options";
import { createValueStore, type ValueStore, useValue } from "./profile-store";
import { Button, Field, Icon, IconButton, PopoverHost, Segmented, Select, type Tokens, useTokens } from "./ui/kit";
import type { WorkspaceList } from "./workspaces";

// Dispatch: several prompts at once, each started as its own new workspace and agent. One row of
// defaults (project, model, mode, worktree or folder), then numbered prompts that turn into live
// status rows: started ones link to their workspace, failed ones keep their text with Retry.

export const DISPATCH_SCREEN_ID = "dispatch";

export interface DispatchDeps {
  client: PluginClientContext;
  workspaces: ValueStore<WorkspaceList>;
  chats: ValueStore<Chats>;
}

type ScreenOpener = (input: PluginOpenScreenInput) => void;

// Morphise's sidebar view cannot open plugin screens itself (Paseo gives it no openScreen); the
// Workbench row in the sidebar header can, and lends its opener here for the view's Dispatch
// button. Each shown row (one per host) lends one; the latest still shown is used, and null
// means no row is shown.
export const screenOpener: ValueStore<ScreenOpener | null> = createValueStore<ScreenOpener | null>(null);
const lent: ScreenOpener[] = [];

export function lendScreenOpener(opener: ScreenOpener): () => void {
  lent.push(opener);
  screenOpener.set(opener);
  return () => {
    const at = lent.lastIndexOf(opener);
    if (at >= 0) lent.splice(at, 1);
    screenOpener.set(lent[lent.length - 1] ?? null);
  };
}

type Where = "worktree" | "local";
// "queued": waiting its turn in a run; it cannot be edited, split or removed until the run ends.
type RowStatus = "draft" | "queued" | "starting" | "started" | "failed";
interface Row {
  id: number;
  text: string;
  status: RowStatus;
  workspaceId: string | null;
  error: string | null;
}

const DEFAULT_SETTINGS: DispatchSettings = { where: "worktree" };
const COMMAND_HINT = Platform.OS === "web" ? "⌘↵ starts them all" : null;

let nextRowId = 1;
const newRow = (text = ""): Row => ({ id: nextRowId++, text, status: "draft", workspaceId: null, error: null });

function StatusChip({ t, status }: { t: Tokens; status: RowStatus }) {
  if (status === "draft") return null;
  const look = {
    queued: { label: "Waiting its turn", color: t.c.foregroundMuted, icon: "Clock" },
    starting: { label: "Starting", color: t.c.foreground, icon: "LoaderCircle" },
    started: { label: "Started", color: t.c.statusSuccess, icon: "CircleCheck" },
    failed: { label: "Failed", color: t.c.statusDanger, icon: "CircleX" },
  }[status];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name={look.icon} size={12} color={look.color} />
      <Text style={{ fontSize: 12, color: look.color }}>{look.label}</Text>
    </View>
  );
}

function PromptRow({ t, row, index, count, running, onChange, onRemove, onSplit, onRetry, onOpen, onCommand }: { t: Tokens; row: Row; index: number; count: number; running: boolean; onChange(text: string): void; onRemove(): void; onSplit(parts: string[]): void; onRetry(): void; onOpen: (() => void) | null; onCommand(): void }) {
  const parts = row.status === "draft" && !running ? splitPrompts(row.text) : null;
  // A failed row stays editable for Retry, except while it is part of a run.
  const editable = row.status === "draft" || row.status === "failed";
  return (
    <View style={{ gap: 6, padding: 10, borderRadius: t.radius.card, borderWidth: 1, borderColor: row.status === "failed" ? t.c.statusDanger : t.c.border, backgroundColor: t.c.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface2 }}>
          <Text style={{ fontSize: 11, color: t.c.foregroundMuted }}>{index + 1}</Text>
        </View>
        <StatusChip t={t} status={row.status} />
        <View style={{ flex: 1 }} />
        {row.status === "started" && onOpen ? <Button t={t} variant="ghost" icon="ArrowUpRight" label="Open" accessibilityLabel={`Open the workspace for prompt ${index + 1}`} onPress={onOpen} /> : null}
        {row.status === "failed" ? <Button t={t} variant="ghost" icon="RotateCcw" label="Retry" accessibilityLabel={`Retry prompt ${index + 1}`} disabled={running} onPress={onRetry} /> : null}
        {editable && count > 1 ? <IconButton t={t} size="sm" icon="X" label={`Remove prompt ${index + 1}`} disabled={running} onPress={onRemove} /> : null}
      </View>
      {editable ? (
        <Field t={t} bare multiline value={row.text} onChangeText={onChange} placeholder={index === 0 ? "What should the agent do? Paste a list to start several." : "Another task"} accessibilityLabel={`Prompt ${index + 1}`} onCommand={onCommand} />
      ) : (
        <Text style={{ fontSize: 13, lineHeight: 18, color: row.status === "starting" ? t.c.foregroundMuted : t.c.foreground, paddingHorizontal: 6 }} numberOfLines={3}>
          {row.text}
        </Text>
      )}
      {parts ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Split into ${parts.length} prompts`} onPress={() => onSplit(parts)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 6 }}>
          <Icon name="Split" size={12} color={t.c.accent} />
          <Text style={{ fontSize: 12, color: t.c.accent }}>Looks like {parts.length} tasks · Split into {parts.length} prompts</Text>
        </Pressable>
      ) : null}
      {row.status === "failed" && row.error ? <Text style={[t.text.danger, { paddingHorizontal: 6 }]}>{row.error}</Text> : null}
    </View>
  );
}

function Dispatch({ t, deps, openWorkspace }: { t: Tokens; deps: DispatchDeps; openWorkspace: ((workspaceId: string) => void) | null }) {
  const paseo = deps.client.paseo;
  const settings = useSettings(dispatchSettings);
  const saved = settings.status === "ready" ? settings.values : DEFAULT_SETTINGS;
  const projects = projectsOf(useValue(deps.workspaces));
  const used = modelsOf(useValue(deps.chats));
  const [entries, setEntries] = useState<readonly unknown[] | null>(null);
  // Choices made here, kept while their save is on its way (see the effect below).
  const [chosen, setChosen] = useState<Partial<DispatchSettings>>({});
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  // Every model Paseo's providers offer, kept current as providers finish loading or change.
  useEffect(() => {
    let alive = true;
    paseo.providers.snapshot().then(
      (snapshot) => alive && setEntries(snapshot.entries),
      () => alive && setEntries((current) => current ?? []),
    );
    const stop = paseo.providers.subscribe((update) => {
      const next = (update as { entries?: readonly unknown[] }).entries;
      if (alive && Array.isArray(next)) setEntries(next);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [paseo]);
  // Saves run against the revision they read, so a second quick choice can be refused; this saves
  // again with the newest revision until the stored choices match the ones made here.
  const chosenKey = JSON.stringify(chosen);
  useEffect(() => {
    if (settings.status !== "ready" || settings.saving) return;
    const next = { ...settings.values, ...chosen };
    if (JSON.stringify(next) !== JSON.stringify(settings.values)) void settings.save(next, settings.revision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.status, settings.saving, settings.status === "ready" ? settings.revision : null, chosenKey]);
  const current: DispatchSettings = { ...saved, ...chosen };

  const listed = entries ? modelChoices(entries, used) : [];
  // Before the provider list arrives, or when it cannot be read, the models open chats use.
  const models = listed.length ? listed : used.map((value) => ({ value, label: value, provider: value.split("/")[0] }));
  const project = projects.find((item) => item.id === current.project) ?? projects[0] ?? null;
  // The remembered model is held, not swapped for another provider's, while its provider loads.
  const rememberedProvider = current.model?.split("/")[0] ?? "";
  const holding = !!current.model && !models.some((item) => item.value === current.model) && (entries === null || providerStatus(entries, rememberedProvider) === "loading");
  const model = holding ? null : models.find((item) => item.value === current.model) ?? models[0] ?? null;
  const { modes, defaultId } = entries && model ? modeChoices(entries, model.provider) : { modes: [], defaultId: null };
  const mode = modes.find((item) => item.id === current.mode)?.id ?? defaultId;
  const canWorktree = project?.kind === "git";
  const where: Where = canWorktree ? current.where : "local";
  const remember = (patch: Partial<DispatchSettings>) => setChosen((before) => ({ ...before, ...patch }));

  const update = (id: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const pending = rows.filter((row) => (row.status === "draft" || row.status === "failed") && row.text.trim());
  const ready = !!project && !!model && pending.length > 0 && !running;

  // One at a time, in order. A failure marks its row and the rest still start; a row is never
  // started twice, because only draft and failed rows are picked and each is marked first.
  const start = async (only: number | null = null) => {
    if (runningRef.current || !project || !model) return;
    const queue = rows.filter((row) => (only === null || row.id === only) && (row.status === "draft" || row.status === "failed") && row.text.trim());
    if (!queue.length) return;
    runningRef.current = true;
    setRunning(true);
    // The whole queue is marked first, so none of it can be edited or split while it waits.
    const queued = new Set(queue.map((row) => row.id));
    setRows((rows) => rows.map((row) => (queued.has(row.id) ? { ...row, status: "queued", error: null } : row)));
    for (const row of queue) {
      const prompt = row.text.trim();
      update(row.id, { status: "starting", error: null });
      try {
        // One request makes the workspace and its first agent, so a failing agent leaves no empty
        // workspace behind. The agent's folder is the project root; Paseo maps it into the new
        // workspace.
        const workspace = await paseo.workspaces.create({
          source: where === "worktree" ? { kind: "worktree", projectId: project.id, cwd: project.rootPath, action: "branch-off" } : { kind: "directory", path: project.rootPath },
          title: titleFromPrompt(prompt),
          agent: { cwd: project.rootPath, config: { provider: model.value, ...(mode ? { modeId: mode } : {}) }, prompt },
        });
        update(row.id, { status: "started", workspaceId: workspace.id });
      } catch (error) {
        update(row.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    runningRef.current = false;
    setRunning(false);
  };

  const started = rows.filter((row) => row.status === "started");
  const label = running ? "Starting..." : pending.length > 1 ? `Start ${pending.length} agents` : "Start agent";
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 10, padding: 12, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border }}>
        <Text style={t.text.label}>Each prompt starts a new workspace with</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ minWidth: 200, flexGrow: 1 }}>
            <Select t={t} label="Project" placeholder="No project yet" value={project?.id ?? null} onChange={(id) => remember({ project: id })} options={projects.map((item) => ({ value: item.id, label: item.name, icon: "Folder" }))} />
          </View>
          <View style={{ minWidth: 220, flexGrow: 1 }}>
            <Select t={t} label="Model" placeholder={entries === null || holding ? "Loading models..." : "No model available"} value={model?.value ?? null} onChange={(value) => remember({ model: value, mode: undefined })} options={models.map((item) => ({ value: item.value, label: item.label, icon: "Bot" }))} />
          </View>
          {modes.length ? (
            <View style={{ minWidth: 160, flexGrow: 1 }}>
              <Select t={t} label="Mode" value={mode} onChange={(id) => remember({ mode: id })} options={modes.map((item) => ({ value: item.id, label: item.label, icon: "Shield" }))} />
            </View>
          ) : null}
        </View>
        {canWorktree ? (
          <Segmented<Where>
            t={t}
            label="Where each agent works"
            value={where}
            onChange={(value) => remember({ where: value })}
            options={[
              { value: "worktree", label: "Its own worktree", icon: "GitBranch" },
              { value: "local", label: "The project folder", icon: "Folder" },
            ]}
          />
        ) : project ? (
          <Text style={t.text.small}>Not a git project, so agents work in the project folder.</Text>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        {rows.map((row, index) => (
          <PromptRow
            key={row.id}
            t={t}
            row={row}
            index={index}
            count={rows.length}
            running={running}
            onChange={(text) => update(row.id, { text, status: row.status === "failed" ? "failed" : "draft" })}
            onRemove={() => setRows((current) => current.filter((item) => item.id !== row.id))}
            onSplit={(parts) => setRows((current) => current.flatMap((item) => (item.id === row.id ? parts.map((part) => newRow(part)) : [item])))}
            onRetry={() => void start(row.id)}
            onOpen={row.workspaceId && openWorkspace ? () => openWorkspace(row.workspaceId ?? "") : null}
            onCommand={() => void start()}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Button t={t} variant="ghost" icon="Plus" label="Add prompt" disabled={running} onPress={() => setRows((current) => [...current, newRow()])} />
        {started.length ? <Button t={t} variant="ghost" icon="ListX" label="Clear started" disabled={running} onPress={() => setRows((current) => (current.every((row) => row.status === "started") ? [newRow()] : current.filter((row) => row.status !== "started")))} /> : null}
        <View style={{ flex: 1 }} />
        {COMMAND_HINT && !t.compact ? <Text style={t.text.small}>{COMMAND_HINT}</Text> : null}
        <Button t={t} variant="primary" icon="Send" label={label} disabled={!ready} onPress={() => void start()} />
      </View>
      {!model && entries !== null && !holding ? <Text style={t.text.small}>No model is available. Check Settings, Providers in Paseo.</Text> : null}
      {!project ? <Text style={t.text.small}>Open a project in Paseo first; Dispatch starts agents in your projects.</Text> : null}
    </View>
  );
}

export function createDispatchScreen(deps: DispatchDeps) {
  return function DispatchScreen({ theme, layout, navigation }: PluginScreenProps) {
    const t = useTokens(theme, layout.compact);
    return (
      <PopoverHost>
        <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 12 : 24, gap: 16, maxWidth: 820, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.c.surface2 }}>
              <Icon name="Rocket" size={16} color={t.c.foreground} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={t.text.title}>Dispatch</Text>
              <Text style={t.text.small}>Start several agents at once, each in a new workspace.</Text>
            </View>
          </View>
          <Dispatch t={t} deps={deps} openWorkspace={navigation ? (id) => navigation.openWorkspace({ workspaceId: id }) : null} />
        </ScrollView>
      </PopoverHost>
    );
  };
}
