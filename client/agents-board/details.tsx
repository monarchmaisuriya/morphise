import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { type BoardAgent, contextShare } from "../../shared/agents-board";
import { checkAgentTitle } from "../../shared/agent-actions";
import { lastAnswer } from "../../shared/bookmarks";
import { type PermissionChoice, summarizePermission } from "../../shared/inbox";
import type { Indicator } from "../../shared/profile";
import { latestPlan, type Step } from "../../shared/steps";
import { formatElapsed } from "../../shared/time-text";
import { statusColor } from "../ui/hues";
import { Button, Field, Icon, IconButton, PropertyRow, type Tokens } from "../ui/kit";
import { type CardFacts, StopButton } from "./card";
import { type CliActions, useCardLive } from "./data";
import { GenerateTitleButton } from "./title-button";

// The chosen card in full: its request or error, first prompt and last reply, sub-agents,
// properties, usage and activity. Only what Paseo's public SDK gives is shown.

const TAIL = 100;
const HEAD = 40;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const firstPrompt = (entries: readonly unknown[]) => {
  for (const entry of entries) {
    const item = record(record(entry)?.item);
    if (item?.type === "user_message" && typeof item.text === "string" && item.text.trim()) return item.text;
  }
  return null;
};

type History = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; first: string | null; last: string | null; steps: Step[] | null };

// The newest page of the chat, and its oldest page when the newest does not reach back to the start.
function useHistory(client: PluginClientContext, agentId: string, updatedAt: string): History {
  const [state, setState] = useState<{ key: string; history: History }>({ key: "", history: { status: "loading" } });
  const key = `${agentId}@${updatedAt}`;
  useEffect(() => {
    let alive = true;
    const timeline = client.paseo.agents.ref(agentId).timeline;
    (async () => {
      const tail = await timeline.refetch({ direction: "tail", limit: TAIL });
      const head = tail.hasOlder ? await timeline.refetch({ direction: "before", cursor: { epoch: tail.epoch, seq: tail.window.minSeq + HEAD }, limit: HEAD }) : tail;
      return { status: "ready" as const, first: firstPrompt(head.entries), last: lastAnswer(tail.entries), steps: latestPlan(tail.entries)?.steps ?? null };
    })().then(
      (history) => alive && setState({ key, history }),
      (error: unknown) => alive && setState({ key, history: { status: "error", error: message(error) } }),
    );
    return () => {
      alive = false;
    };
  }, [client, agentId, key]);
  return state.key === key ? state.history : { status: "loading" };
}

function Section({ t, title, children }: { t: Tokens; title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={t.text.label}>{title}</Text>
      {children}
    </View>
  );
}

function Panel({ t, children }: { t: Tokens; children: ReactNode }) {
  return <View style={{ padding: 12, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>{children}</View>;
}

const ago = (at: string | null, now: Date) => {
  const elapsed = at ? formatElapsed(at, now) : null;
  return elapsed === null ? null : elapsed === "now" ? "just now" : `${elapsed} ago`;
};

const tokens = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count));

export function AgentDetails({
  t,
  client,
  facts,
  subAgents,
  parent,
  cli,
  now,
  onBack,
  onOpen,
  onSelect,
  onArchive,
  onStop,
}: {
  t: Tokens;
  client: PluginClientContext;
  facts: CardFacts;
  subAgents: readonly { agent: BoardAgent; indicator: Indicator }[];
  parent: BoardAgent | null;
  cli: CliActions;
  now: Date;
  onBack: (() => void) | null;
  onOpen: ((agentId: string) => void) | null;
  onSelect(agentId: string): void;
  onArchive: (() => void) | null;
  onStop: (() => void) | null;
}) {
  const { agent, indicator } = facts;
  const toast = useToast();
  const history = useHistory(client, agent.id, agent.updatedAt);
  const live = useCardLive(client, { id: agent.id, updatedAt: agent.updatedAt, running: indicator === "running", archived: !!agent.archivedAt }, { onScreen: true, usage: true, plan: false });
  const usage = live?.usage ?? null;
  const context = usage?.context ?? agent.context;
  const share = contextShare(context);
  const request = indicator === "needs_input" ? summarizePermission(agent.pendingPermissions[agent.pendingPermissions.length - 1]) : null;
  const [answering, setAnswering] = useState<{ busy: boolean; sent: boolean; error: string | null }>({ busy: false, sent: false, error: null });
  useEffect(() => setAnswering({ busy: false, sent: false, error: null }), [agent.id, request?.id]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => {
    setRenaming(null);
    setRenameState({ busy: false, error: null });
  }, [agent.id]);

  const answer = (choice: PermissionChoice | { behavior: "allow" | "deny"; id: "" }) => {
    if (!request || answering.busy) return;
    setAnswering({ busy: true, sent: false, error: null });
    const selectedActionId = choice.id || undefined;
    client.paseo.agents
      .ref(agent.id)
      .respondToPermission({ requestId: request.id, response: choice.behavior === "allow" ? { behavior: "allow", selectedActionId } : { behavior: "deny", selectedActionId } })
      .then(
        () => setAnswering({ busy: true, sent: true, error: null }),
        (error: unknown) => setAnswering({ busy: false, sent: false, error: `Could not answer: ${message(error)}` }),
      );
  };
  const rename = () => {
    if (renaming === null || renameState.busy) return;
    const problem = checkAgentTitle(renaming);
    if (problem) return setRenameState({ busy: false, error: problem });
    setRenameState({ busy: true, error: null });
    void cli.rename(agent.id, renaming).then((result) => {
      if (!result.ok) return setRenameState({ busy: false, error: result.error });
      setRenameState({ busy: false, error: null });
      setRenaming(null);
      toast.show("Renamed");
    });
  };
  const choices: (PermissionChoice | { behavior: "allow" | "deny"; id: ""; label: string; variant: "primary" | "secondary" })[] = request?.choices.length
    ? request.choices
    : [
        { id: "", label: "Allow", behavior: "allow", variant: "primary" },
        { id: "", label: "Deny", behavior: "deny", variant: "secondary" },
      ];
  const counts = { running: 0, waiting: 0, failed: 0 };
  for (const child of subAgents) {
    if (child.indicator === "running") counts.running++;
    if (child.indicator === "needs_input") counts.waiting++;
    if (child.indicator === "failed") counts.failed++;
  }
  const activity = [
    ["Created", ago(agent.createdAt || null, now)],
    ["Last message", ago(agent.lastUserMessageAt, now)],
    ["Turn started", ago(agent.turnStartedAt, now)],
    ["Needs you since", indicator === "needs_input" || indicator === "attention" || indicator === "failed" ? ago(agent.attentionAt, now) : null],
    ["Last change", ago(agent.updatedAt || null, now)],
    ["Archived", ago(agent.archivedAt, now)],
  ].filter((row): row is [string, string] => row[1] !== null);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: t.compact ? 12 : 16, gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {onBack ? <IconButton t={t} icon="ArrowLeft" label="Back to the board" onPress={onBack} /> : null}
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(t.c, indicator) }} />
          <Text style={t.text.meta}>{[agent.provider, agent.model, agent.thinking].filter(Boolean).join(" · ")}</Text>
        </View>
        {renaming === null ? (
          <Text style={t.text.title} numberOfLines={3} selectable>
            {agent.title}
          </Text>
        ) : (
          <View style={{ gap: 6 }}>
            <Field t={t} value={renaming} onChangeText={setRenaming} autoFocus onSubmit={rename} accessibilityLabel={`New title for ${agent.title}`} error={renameState.error} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button t={t} variant="primary" label={renameState.busy ? "Saving" : "Save"} disabled={renameState.busy} onPress={rename} />
              <Button t={t} variant="ghost" label="Cancel" onPress={() => setRenaming(null)} />
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {onOpen ? <Button t={t} icon="MessageSquare" label={request?.answerInChat ? "Open to answer" : "Open chat"} onPress={() => onOpen(agent.id)} /> : null}
          {onStop ? <StopButton t={t} title={agent.title} onStop={onStop} /> : null}
          {onArchive ? <Button t={t} variant="ghost" icon="Archive" label="Archive" onPress={onArchive} /> : null}
          {cli.available && renaming === null && !agent.archivedAt ? <Button t={t} variant="ghost" icon="Pencil" label="Rename" onPress={() => setRenaming(agent.title)} /> : null}
          {cli.available && renaming === null && !agent.archivedAt ? <GenerateTitleButton t={t} client={client} agentId={agent.id} /> : null}
        </View>
      </View>

      {request ? (
        <Section t={t} title={request.answerInChat ? "Asks you a question" : `Wants to use ${request.tool || "a tool"}`}>
          {request.title ? <Text style={t.text.body}>{request.title}</Text> : null}
          {request.subject || request.body ? (
            <Panel t={t}>
              <Text selectable style={{ color: t.c.foreground, fontSize: 12 }}>
                {[request.subject, request.body].filter(Boolean).join("\n\n")}
              </Text>
            </Panel>
          ) : null}
          {request.answerInChat ? null : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {choices.map((choice) => (
                <Button key={`${choice.behavior}:${choice.id}:${choice.label}`} t={t} variant={choice.variant} icon={choice.behavior === "allow" ? "Check" : "X"} label={choice.label} disabled={answering.busy} onPress={() => answer(choice)} />
              ))}
            </View>
          )}
          {answering.sent ? <Text style={t.text.meta}>Answer sent. Waiting for the agent to continue.</Text> : null}
          {answering.error ? <Text style={t.text.danger}>{answering.error}</Text> : null}
        </Section>
      ) : null}
      {indicator === "failed" && agent.lastError ? (
        <Section t={t} title="Error">
          <Panel t={t}>
            <Text selectable style={{ color: t.c.statusDanger, fontSize: 12 }}>
              {agent.lastError}
            </Text>
          </Panel>
        </Section>
      ) : null}

      {history.status === "loading" ? <Text style={t.text.meta}>Reading the chat</Text> : null}
      {history.status === "error" ? <Text style={t.text.danger}>Could not read the chat: {history.error}</Text> : null}
      {history.status === "ready" && history.first ? (
        <Section t={t} title="First prompt">
          <Panel t={t}>
            <Markdown>{history.first}</Markdown>
          </Panel>
        </Section>
      ) : null}
      {history.status === "ready" && history.last ? (
        <Section t={t} title="Last reply">
          <Panel t={t}>
            <Markdown>{history.last}</Markdown>
          </Panel>
        </Section>
      ) : null}
      {history.status === "ready" && history.steps?.length ? (
        <Section t={t} title={`Plan, ${history.steps.filter((step) => step.status === "completed").length} of ${history.steps.length} done`}>
          {history.steps.map((step, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Icon name={step.status === "completed" ? "CircleCheck" : step.status === "in_progress" ? "CircleDot" : "Circle"} size={13} color={step.status === "completed" ? t.c.statusSuccess : t.c.foregroundMuted} />
              <Text style={[t.text.body, { flex: 1 }]}>{step.text}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {subAgents.length ? (
        <Section t={t} title={[`${subAgents.length} sub-agent${subAgents.length === 1 ? "" : "s"}`, counts.running ? `${counts.running} running` : null, counts.waiting ? `${counts.waiting} waiting` : null, counts.failed ? `${counts.failed} failed` : null].filter(Boolean).join(" · ")}>
          {subAgents.map((child) => (
            <Button key={child.agent.id} t={t} variant="ghost" label={child.agent.title} accessibilityLabel={`Show ${child.agent.title}`} style={{ justifyContent: "flex-start" }} onPress={() => onSelect(child.agent.id)} />
          ))}
        </Section>
      ) : null}

      <Section t={t} title="Properties">
        {agent.project ? <PropertyRow t={t} icon="FolderGit2" label="Project"><Text style={t.text.body}>{agent.project}</Text></PropertyRow> : null}
        {agent.workspace ? <PropertyRow t={t} icon="LayoutGrid" label="Workspace"><Text style={t.text.body}>{agent.workspace}</Text></PropertyRow> : null}
        {agent.branch ? (
          <PropertyRow t={t} icon="GitBranch" label="Branch">
            <Text style={t.text.body} selectable>
              {[agent.branch, facts.git?.ahead ? `${facts.git.ahead} ahead` : null, facts.git?.behind ? `${facts.git.behind} behind` : null, facts.git?.dirty ? "uncommitted changes" : null].filter(Boolean).join(" · ")}
            </Text>
          </PropertyRow>
        ) : null}
        {agent.cwd ? <PropertyRow t={t} icon="Folder" label="Directory"><Text style={t.text.body} selectable>{agent.cwd}</Text></PropertyRow> : null}
        {facts.pullRequest ? <PropertyRow t={t} icon="GitPullRequest" label="Pull request"><Text style={t.text.body}>{[facts.pullRequest.number ? `#${facts.pullRequest.number}` : null, facts.pullRequest.state].filter(Boolean).join(" ")}</Text></PropertyRow> : null}
        {parent ? (
          <PropertyRow t={t} icon="CornerLeftUp" label="Parent">
            <Button t={t} variant="ghost" label={parent.title} accessibilityLabel={`Show ${parent.title}`} style={{ alignSelf: "flex-start" }} onPress={() => onSelect(parent.id)} />
          </PropertyRow>
        ) : null}
        {agent.sessionId ? <PropertyRow t={t} icon="Fingerprint" label="Session"><Text style={t.text.small} selectable>{agent.sessionId}</Text></PropertyRow> : null}
        {!agent.project && !agent.cwd ? <Text style={t.text.meta}>Paseo gave no place for this agent.</Text> : null}
      </Section>

      {context || usage ? (
        <Section t={t} title="Usage">
          {context && share !== null ? <Text style={t.text.body}>{`Context ${tokens(context.used)} of ${tokens(context.max)} (${Math.round(share * 100)}%)`}</Text> : null}
          {usage && (usage.inputTokens !== null || usage.outputTokens !== null) ? (
            <Text style={t.text.body}>{[usage.inputTokens !== null ? `${tokens(usage.inputTokens)} in` : null, usage.cachedInputTokens !== null ? `${tokens(usage.cachedInputTokens)} cached` : null, usage.outputTokens !== null ? `${tokens(usage.outputTokens)} out` : null].filter(Boolean).join(" · ")}</Text>
          ) : null}
          {usage?.costUsd !== null && usage?.costUsd !== undefined ? <Text style={t.text.body}>{`$${usage.costUsd.toFixed(2)}`}</Text> : null}
        </Section>
      ) : null}

      {activity.length ? (
        <Section t={t} title="Activity">
          {activity.map(([label, value]) => (
            <View key={label} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={[t.text.meta, { width: 112 }]}>{label}</Text>
              <Text style={t.text.body}>{value}</Text>
            </View>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}
