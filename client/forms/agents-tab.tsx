import { useSettings } from "@getpaseo/plugin/client";
import { Loading, SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type AgentsBoardSettings, agentsBoardSettings, applyDensity, type BoardAgent, CARD_FIELDS, type CardField, type Density, DENSITY_PRESETS, type DoneWindow, effectiveCard, type LabelLimit, type LaneWidth, setCardSetting } from "../../shared/agents-board";
import { AgentCard, type CardFacts } from "../agents-board/card";
import { tokens } from "../ui/kit";
import { ChipRow, type Form, SelectField, SwitchField, TextField } from "./fields";
import { DEFAULT_TITLE_PROMPT, type TitleSettings, titleSettings } from "../../shared/agent-titles";

// Settings, Agents: the Workbench's Agents view and what its cards show. A separate host record
// ("agents-board"), so it saves on its own and older Morphise versions never read it.

const FIELD_TITLES: Record<CardField, string> = {
  provider: "Agent",
  model: "Model",
  thinking: "Thinking level",
  project: "Project",
  projectIcon: "Project icon",
  workspace: "Workspace",
  branch: "Branch",
  gitStatus: "Git status",
  folder: "Folder",
  path: "Full path",
  labels: "Labels",
  pullRequest: "Linked PR",
  timer: "Timer",
  context: "Context ring",
  plan: "Plan",
  subtasks: "Sub-agents",
};
const DENSITY_TITLES: Record<Density, string> = { minimal: "Minimal", standard: "Standard", full: "Full", custom: "Custom" };

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

// Sample data for the preview only; every field has a value so each switch shows its effect.
function sampleFacts(): CardFacts {
  const agent: BoardAgent = {
    id: "sample",
    title: "Fix the login redirect after a session expires",
    provider: "claude",
    model: "opus",
    thinking: "high",
    status: "running",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissions: [],
    parentId: null,
    workspaceId: "sample",
    cwd: "/Users/you/code/web-app",
    projectKey: "web-app",
    project: "web-app",
    workspace: "login-fix",
    branch: "fix/login-redirect",
    labels: ["auth", "bug", "urgent"],
    createdAt: minutesAgo(90),
    updatedAt: minutesAgo(1),
    lastUserMessageAt: minutesAgo(20),
    attentionAt: null,
    archivedAt: null,
    turnStartedAt: minutesAgo(12),
    sessionId: null,
    lastError: null,
    context: { used: 128_000, max: 200_000 },
  };
  return { agent, indicator: "running", git: { dirty: true, ahead: 2, behind: 0 }, pullRequest: { number: 128, state: "open" }, subtasks: { total: 2, running: 1, waiting: 0, failed: 0 }, parent: null };
}

// Saves the latest choice once the record has loaded and no other save runs, so quick changes are
// not lost to a save refused for an old revision.
function useBoardSettings() {
  const stored = useSettings(agentsBoardSettings);
  const [draft, setDraft] = useState<AgentsBoardSettings | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const saved = stored.status === "ready" ? stored.values : null;
  useEffect(() => {
    if (!draft || stored.status !== "ready" || stored.saving) return;
    if (JSON.stringify(draft) === JSON.stringify(stored.values)) return setDraft(null);
    void stored.save(draft, stored.revision).then((ok) => {
      if (ok) return;
      setDraft(null);
      setFailed(stored.saveError ?? "Another app saved these settings at the same moment; try again");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, stored.status, stored.saving, stored.status === "ready" ? stored.revision : null]);
  const change = (next: AgentsBoardSettings) => {
    setFailed(null);
    setDraft(next);
  };
  return { stored, values: draft ?? saved, change, failed };
}

function AgentsBoardSettingsForm({ form }: { form: Form }) {
  const { stored, values, change, failed } = useBoardSettings();
  const t = tokens(form.theme, false);
  if (stored.status === "loading") return <Loading />;
  if (stored.status === "error" || stored.status === "invalid" || !values) {
    const invalid = stored.status === "invalid";
    return (
      <SettingsSection title="Agents tab">
        <Text style={t.text.danger}>Could not read the Agents tab settings{stored.status === "error" || invalid ? `: ${stored.error}` : ""}.</Text>
        <SettingsCard>
          {invalid ? <SettingsAction label="Put back the defaults" actionLabel="Reset" onPress={() => void stored.reset()} /> : <SettingsAction label="Try again" actionLabel="Retry" onPress={() => void stored.reload()} />}
        </SettingsCard>
      </SettingsSection>
    );
  }
  const set = (next: Partial<AgentsBoardSettings>) => change({ ...values, ...next });
  const board = (next: Partial<AgentsBoardSettings["board"]>) => set({ board: { ...values.board, ...next } });
  const card = effectiveCard(values, false);
  const densityOptions = [...DENSITY_PRESETS, ...(values.density === "custom" ? (["custom"] as const) : [])].map((density) => ({ value: density, label: DENSITY_TITLES[density] }));
  return (
    <View style={{ gap: 12 }}>
      <SettingsSection title="Agents tab" info="The Workbench Board's Agents tab: every agent on this host in lanes (Waiting, Running, To review, Done and Archived).">
        <SettingsCard>
          <SwitchField label="Show the Agents tab" hint="Adds an Agents tab beside Tasks on the Workbench Board. When this is off, Board shows only tasks and no agents are read for it." value={values.enabled} onChange={(enabled) => set({ enabled })} />
        </SettingsCard>
      </SettingsSection>
      {values.enabled ? (
        <>
          <SettingsSection title="Preview" info="A sample agent, drawn as the board draws it on desktop and web.">
            <View style={{ width: 320, maxWidth: "100%", padding: 12, borderRadius: t.radius.panel, backgroundColor: t.c.surface0, borderWidth: 1, borderColor: t.c.border }}>
              <AgentCard t={t} facts={sampleFacts()} card={card} now={new Date()} live={{ usage: null, plan: { done: 3, total: 5 } }} selected={false} focused={false} buttons={{ open: () => {}, stop: () => {} }} onPress={() => {}} onMenu={null} />
            </View>
          </SettingsSection>
          <SettingsSection title="Cards" info="Each part shows only when Paseo gives its value. Plan reads the agent's latest to-do list from its recent history.">
            <SettingsCard>
              <SelectField<Density> label="Card density" hint="Minimal, Standard or Full sets every field at once; changing a field makes it Custom." value={values.density} options={densityOptions} onChange={(density) => density !== "custom" && change(applyDensity(values, density))} />
              <ChipRow form={form} label="Fields" chips={CARD_FIELDS.map((field) => ({ key: field, label: FIELD_TITLES[field], on: values.card[field], toggle: () => change(setCardSetting(values, field, !values.card[field])) }))} />
              {values.card.labels ? <SelectField<LabelLimit> label="Labels shown" hint="The rest fold into +N." value={values.card.labelLimit} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "all", label: "All" }]} onChange={(limit) => change(setCardSetting(values, "labelLimit", limit))} /> : null}
            </SettingsCard>
          </SettingsSection>
          <SettingsSection title="Board">
            <SettingsCard>
              <SelectField<DoneWindow> label="Done and Archived show" value={values.board.doneWindow} options={[{ value: "24h", label: "The last 24 hours" }, { value: "7d", label: "The last 7 days" }, { value: "all", label: "Everything" }]} onChange={(doneWindow) => board({ doneWindow })} />
              <SelectField<LaneWidth> label="Lane width" hint="Desktop and web; phones show one lane at a time." value={values.board.laneWidth} options={[{ value: "narrow", label: "Narrow" }, { value: "default", label: "Default" }, { value: "wide", label: "Wide" }]} onChange={(laneWidth) => board({ laneWidth })} />
              <SwitchField label="Show sub-agents" hint="Gives each sub-agent its own card. When this is off, a sub-agent folds into its parent's card unless it runs, waits or failed in another lane." value={values.board.showSubtasks} onChange={(showSubtasks) => board({ showSubtasks })} />
              <SwitchField label="Show the Archived lane" hint="Archived agents within the done window." value={values.board.showArchived} onChange={(showArchived) => board({ showArchived })} />
              <SwitchField label="List groups with no agents" hint="The filter menus also list Paseo's other labels, projects and workspaces, at 0." value={values.board.showEmptyGroups} onChange={(showEmptyGroups) => board({ showEmptyGroups })} />
            </SettingsCard>
          </SettingsSection>
          <SettingsSection title="Phone">
            <SettingsCard>
              <SwitchField label="Minimal cards on phones" hint="Phones draw the Minimal card, whatever the card density above." value={values.phone.minimalCards} onChange={(minimalCards) => set({ phone: { minimalCards } })} />
            </SettingsCard>
          </SettingsSection>
        </>
      ) : null}
      {failed ? <Text style={t.text.danger}>Not saved: {failed}</Text> : null}
    </View>
  );
}

// "Generate a title" on an agent: which provider and model write it, and what they are asked.
// Saved 600 ms after the last keystroke, against the revision it was read at.
function TitleSettingsForm({ form }: { form: Form }) {
  const stored = useSettings(titleSettings);
  const [draft, setDraft] = useState<TitleSettings | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const t = tokens(form.theme, false);
  useEffect(() => {
    if (!draft || stored.status !== "ready" || stored.saving) return;
    const timer = setTimeout(() => {
      const saving = draft;
      void stored.save(saving, stored.revision).then((ok) => {
        // Typing that arrived during the save stays as the next draft and is saved in turn.
        setDraft((current) => (current === saving ? null : current));
        if (!ok) setFailed(stored.saveError ?? "Another app saved these settings at the same moment; try again");
      });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, stored.status, stored.saving]);
  if (stored.status !== "ready") return null;
  const values = draft ?? stored.values;
  const set = (patch: Partial<TitleSettings>) => {
    setFailed(null);
    setDraft({ ...values, ...patch });
  };
  return (
    <SettingsSection title="Generate a title" info="An agent's details offer Generate a title: a short background agent reads the chat's first message and latest reply and writes a title of up to 60 characters, then the agent is renamed. It runs on your provider's login and uses tokens. A title is only written when you ask for one.">
      <SettingsCard>
        <TextField form={form} label="Provider" hint="Empty: the chat's own provider. Otherwise a provider id such as claude or codex." placeholder="The chat's own" value={values.provider} error={null} onChange={(provider) => set({ provider: provider.trim() })} />
        <TextField form={form} label="Model" hint="Empty: the chat's own model (or the provider's default when a provider is named). A small, fast model is enough." placeholder="The chat's own" value={values.model} error={null} onChange={(model) => set({ model: model.trim() })} />
        <TextField form={form} label="Instructions" hint="Empty puts back the default." placeholder={DEFAULT_TITLE_PROMPT} value={values.prompt === DEFAULT_TITLE_PROMPT ? "" : values.prompt} error={null} onChange={(prompt) => set({ prompt: prompt.trim() || DEFAULT_TITLE_PROMPT })} />
      </SettingsCard>
      {failed ? <Text style={t.text.danger}>Not saved: {failed}</Text> : null}
    </SettingsSection>
  );
}

export function AgentsBoardTab(form: Form): ReactNode {
  return (
    <View style={{ gap: 12 }}>
      <AgentsBoardSettingsForm form={form} />
      <TitleSettingsForm form={form} />
    </View>
  );
}
