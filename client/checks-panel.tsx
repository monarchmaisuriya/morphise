import { openExternalUrl, type PluginClientContext, type PluginWorkspacePanelProps, useAgents } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { fixRequest, needsWork } from "./checks";
import { type ValueStore, useValue } from "./profile-store";
import { Button, type Tokens, useTokens } from "./ui/kit";
import { PURPLE } from "./ui/hues";
import type { CheckRun, PullRequestInfo, WorkspaceList } from "./workspaces";

// A workspace's pull request at a glance: its state, review, merge conflicts and every check, with
// "Ask the agent to fix" putting a message naming what failed into the open chat's message box.

export interface ChecksDeps {
  client: PluginClientContext;
  workspaces: ValueStore<WorkspaceList>;
}

const ORDER: Record<CheckRun["status"], number> = { failure: 0, cancelled: 1, pending: 2, success: 3, skipped: 4 };

function runColor(t: Tokens, status: CheckRun["status"]): string {
  return status === "success" ? t.c.statusSuccess : status === "failure" ? t.c.statusDanger : status === "pending" ? t.c.statusWarning : t.c.foregroundMuted;
}

function stateColor(t: Tokens, pr: PullRequestInfo): string {
  return pr.state === "open" ? t.c.statusSuccess : pr.state === "merged" ? PURPLE : pr.state === "closed" ? t.c.statusDanger : t.c.foregroundMuted;
}

function Fact({ t, icon, color, text }: { t: Tokens; icon: string; color: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon name={icon} size={13} color={color} />
      <Text style={{ color: t.c.foreground, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function createChecksPanel(deps: ChecksDeps) {
  return function ChecksPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
    const t = useTokens(theme, layout.compact);
    const pr = useValue(deps.workspaces).get(workspaceId)?.pullRequest ?? null;
    // This workspace's most recent chat. Not "the focused chat": this panel is itself a tab, so
    // while it is open no chat is focused.
    const [latestChat] = useAgents({ where: (agent) => agent.workspaceId === workspaceId && agent.parentAgentId === null, orderBy: ["lastActivityAt", "desc"] });
    const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
    if (!pr) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24, backgroundColor: theme.colors.surface0 }}>
          <Icon name="GitPullRequest" size={22} color={theme.colors.foregroundMuted} />
          <Text style={t.text.small}>No pull request for this workspace yet.</Text>
        </View>
      );
    }
    const work = needsWork(pr);
    const request = fixRequest(pr);
    const runs = [...pr.checkRuns].sort((left, right) => ORDER[left.status] - ORDER[right.status] || left.name.localeCompare(right.name));
    const askAgent = async () => {
      const [composer] = latestChat ? deps.client.composers({ agentId: latestChat.id }) : [];
      if (!composer || !request) return setMessage({ tone: "danger", text: "Start a chat in this workspace first, then try again." });
      composer.insertText(request);
      setMessage({ tone: "info", text: "Added to the latest chat's message box. Open it, review the message and send." });
      await composer.focus().catch(() => {});
    };
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 12 : 16, gap: 12 }}>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open pull request ${pr.number ?? ""} on GitHub`} onPress={() => void openExternalUrl(pr.url)} style={{ gap: 2 }}>
          <Text style={{ color: t.c.foreground, fontSize: 15, fontWeight: "600" }} numberOfLines={2}>
            {pr.number ? `#${pr.number} ` : ""}
            {pr.title || "Pull request"}
          </Text>
          <Text style={[t.text.meta, { color: stateColor(t, pr) }]}>{pr.state}</Text>
        </Pressable>
        <View style={{ gap: 6 }}>
          {pr.review ? <Fact t={t} icon={pr.review === "approved" ? "CircleCheck" : pr.review === "changes_requested" ? "CircleAlert" : "Clock"} color={pr.review === "approved" ? t.c.statusSuccess : pr.review === "changes_requested" ? t.c.statusDanger : t.c.statusWarning} text={pr.review === "approved" ? "Approved" : pr.review === "changes_requested" ? "Changes requested" : "Review pending"} /> : null}
          {pr.mergeable === "conflicting" ? <Fact t={t} icon="GitMerge" color={t.c.statusDanger} text="Has merge conflicts" /> : pr.mergeable === "mergeable" ? <Fact t={t} icon="GitMerge" color={t.c.statusSuccess} text="Merges cleanly" /> : null}
        </View>
        {request ? (
          <View style={{ gap: 6 }}>
            <Button t={t} variant="primary" icon="Wrench" label={`Ask the agent to fix${work.failing.length ? ` ${work.failing.length} failing` : ""}`} onPress={() => void askAgent()} />
            {message ? <Text style={message.tone === "danger" ? t.text.danger : t.text.small}>{message.text}</Text> : null}
          </View>
        ) : null}
        <View style={{ gap: 2 }}>
          <Text style={t.text.label}>Checks{runs.length ? ` · ${runs.length}` : ""}</Text>
          {runs.length === 0 ? <Text style={t.text.small}>No checks reported.</Text> : null}
          {runs.map((run, index) => (
            <Pressable
              key={`${index}:${run.workflow ?? ""}:${run.name}`}
              accessibilityRole={run.url ? "link" : "text"}
              accessibilityLabel={`${run.name}, ${run.status}${run.url ? ", open its page" : ""}`}
              disabled={!run.url}
              onPress={() => run.url && void openExternalUrl(run.url)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6, backgroundColor: pressed ? t.c.surface2 : "transparent" })}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: runColor(t, run.status) }} />
              <Text style={{ flex: 1, color: t.c.foreground, fontSize: 13 }} numberOfLines={1}>
                {run.name}
              </Text>
              {run.workflow ? <Text style={t.text.meta} numberOfLines={1}>{run.workflow}</Text> : null}
              {run.duration ? <Text style={t.text.meta}>{run.duration}</Text> : null}
              {run.url ? <Icon name="ExternalLink" size={12} color={t.c.foregroundMuted} /> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  };
}
