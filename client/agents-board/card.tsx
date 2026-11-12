import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type BoardAgent, type CardSettings, contextShare, folderAddsSomething, folderOf, labelLimitCount, modelLabel } from "../../shared/agents-board";
import type { Indicator } from "../../shared/profile";
import { formatElapsed } from "../../shared/time-text";
import { statusColor, tileColor } from "../ui/hues";
import { Icon, IconButton, type Tokens } from "../ui/kit";
import type { CardLive } from "./data";
import { cannotHover, useTooltip } from "../web";
import { onRightClick } from "./web";

// One agent on the Agents view, read top to bottom: its title (with the context ring while it works),
// one quiet line of facts (project, workspace, model, time), pills for its checkout and plan, and the
// card's buttons on hover. Each part shows only when its field is on and Paseo gave its value.

export interface CardFacts {
  agent: BoardAgent;
  indicator: Indicator;
  // From the workspace list: uncommitted changes and commits ahead or behind the upstream.
  git: { dirty: boolean | null; ahead: number | null; behind: number | null } | null;
  pullRequest: { number: number | null; state: string } | null;
  subtasks: { total: number; running: number; waiting: number; failed: number } | null;
  // The parent's title, for a sub-agent.
  parent: string | null;
}

export interface CardButtons {
  open?(): void;
  stop?(): void;
  archive?(): void;
  allow?(): void;
  deny?(): void;
  busy?: boolean;
}

// Markers for the stylesheet that shows a card's buttons while focus is inside it (web only; ignored elsewhere).
const CARD_MARK = { dataSet: { mxCard: "" } } as object;
const ACTIONS_MARK = { dataSet: { mxCardActions: "" } } as object;

// "3m ago", or "Just now".
function agentAgo(updatedAt: string, now: Date): string | null {
  const elapsed = formatElapsed(updatedAt || null, now);
  return elapsed ? (elapsed === "now" ? "Just now" : `${elapsed} ago`) : null;
}

const STATUS_WORDS: Record<Indicator, string> = { needs_input: "Waiting", running: "Running", attention: "To review", failed: "Failed", done: "Done" };

function Pill({ t, icon, label, tone }: { t: Tokens; icon?: string; label: string; tone?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: t.c.surface2, maxWidth: "100%" }}>
      {icon ? <Icon name={icon} size={11} color={tone ?? t.c.foregroundMuted} /> : null}
      <Text style={{ fontSize: 11, color: tone ?? t.c.foreground, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="middle">
        {label}
      </Text>
    </View>
  );
}

// The share of the context window in use: a ring that turns amber from 80% and red from 95%.
export function ContextRing({ t, share }: { t: Tokens; share: number }) {
  const percent = Math.round(share * 100);
  const tone = share >= 0.95 ? t.c.statusDanger : share >= 0.8 ? t.c.statusWarning : t.c.foregroundMuted;
  const tooltip = useTooltip(`Context used: ${percent}%`, t.c);
  return (
    <View ref={tooltip} accessibilityLabel={`Context ${percent}% used`} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: tone, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 8, color: tone, fontWeight: "600" }}>{percent}%</Text>
    </View>
  );
}

// Stop asks for a second press within four seconds.
export function StopButton({ t, title, onStop, disabled }: { t: Tokens; title: string; onStop(): void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <IconButton
      t={t}
      size="sm"
      icon={armed ? "CircleStop" : "Power"}
      tone={armed ? t.c.statusDanger : undefined}
      label={armed ? `Press again to stop ${title}` : `Stop ${title}`}
      disabled={disabled}
      onPress={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onStop();
      }}
    />
  );
}

export function AgentCard({ t, facts, card, now, live, selected, focused, buttons, onPress, onMenu, onScreenRef }: { t: Tokens; facts: CardFacts; card: CardSettings; now: Date; live: CardLive | null; selected: boolean; focused: boolean; buttons: CardButtons; onPress(): void; onMenu: (() => void) | null; onScreenRef?(node: unknown): void }) {
  const { agent, indicator } = facts;
  const node = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => (onMenu ? onRightClick(node.current, onMenu) : undefined), [onMenu]);
  useEffect(() => onScreenRef?.(node.current), [onScreenRef]);
  const running = indicator === "running" || !!agent.turnStartedAt;
  // The lane says the status; a dot is kept only for what asks for attention.
  const dot = indicator === "needs_input" || indicator === "failed" ? statusColor(t.c, indicator) : null;
  // The context ring means something only while the agent works.
  const share = card.context && running ? contextShare(live?.usage?.context ?? agent.context) : null;
  const project = card.project ? agent.project : null;
  const workspace = card.workspace && agent.workspace && agent.workspace !== agent.project && !agent.title.startsWith(agent.workspace) ? agent.workspace : null;
  const model = card.model || card.provider ? modelLabel(card.provider ? agent.provider : null, card.model ? agent.model : null) : null;
  const thinking = card.thinking ? agent.thinking : null;
  const timer = card.timer ? (agent.turnStartedAt ? `Running ${formatElapsed(agent.turnStartedAt, now)}` : agentAgo(agent.updatedAt, now)) : null;
  const facts1 = [workspace, [model, thinking].filter(Boolean).join(" ") || null, facts.parent ? `sub-agent of ${facts.parent}` : null, timer].filter(Boolean) as string[];
  const git = card.gitStatus && facts.git ? [facts.git.ahead ? `↑${facts.git.ahead}` : null, facts.git.behind ? `↓${facts.git.behind}` : null, facts.git.dirty ? "•" : null].filter(Boolean).join(" ") : "";
  const labelCount = labelLimitCount(card.labelLimit);
  const labels = card.labels ? agent.labels.slice(0, labelCount) : [];
  const moreLabels = card.labels ? Math.max(0, agent.labels.length - labels.length) : 0;
  const folder = agent.cwd ? (card.path ? agent.cwd : card.folder && folderAddsSomething(folderOf(agent.cwd), agent.project, agent.workspace) ? folderOf(agent.cwd) : null) : null;
  const subtasks = card.subtasks && facts.subtasks ? facts.subtasks : null;
  const plan = card.plan ? live?.plan ?? null : null;
  const pills = !!(card.branch && agent.branch) || !!git || !!folder || labels.length > 0 || !!(card.pullRequest && facts.pullRequest) || !!plan || !!subtasks;
  // The button row is always laid out (so cards do not jump) and reachable by Tab; with a pointer it is
  // transparent until the card is hovered, chosen, or has keyboard focus inside (CSS in plugin-views.ts).
  const showButtons = cannotHover() || hovered || selected || focused || !!buttons.allow;
  const hasButtons = !!(buttons.allow || buttons.deny || buttons.stop || buttons.archive || buttons.open);
  return (
    <Pressable
      ref={node}
      {...CARD_MARK}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${agent.title}, ${STATUS_WORDS[indicator]}${project ? `, ${project}` : ""}`}
      onPress={onPress}
      onLongPress={onMenu ?? undefined}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }: { pressed: boolean }) => ({
        gap: 6,
        padding: 10,
        borderRadius: t.radius.card,
        borderWidth: 1,
        borderColor: selected || focused ? t.c.accent : indicator === "failed" ? t.c.statusDanger : t.c.border,
        backgroundColor: pressed || hovered || selected ? t.c.surface2 : t.c.surface1,
        opacity: agent.archivedAt ? 0.75 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: dot }} /> : null}
        <Text style={{ flex: 1, color: t.c.foreground, fontSize: 13, fontWeight: "500", lineHeight: 18 }} numberOfLines={2}>
          {agent.title}
        </Text>
        {share !== null ? <ContextRing t={t} share={share} /> : null}
      </View>
      {project || facts1.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
          {project && card.projectIcon ? (
            <View style={{ width: 14, height: 14, borderRadius: 3, alignItems: "center", justifyContent: "center", backgroundColor: tileColor(project) }}>
              <Text style={{ fontSize: 9, color: "#ffffff", fontWeight: "700" }}>{project.slice(0, 1).toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={[t.text.small, { flex: 1 }]} numberOfLines={1}>
            {[project, ...facts1].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ) : null}
      {pills ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {card.branch && agent.branch ? <Pill t={t} icon="GitBranch" label={git ? `${agent.branch} ${git}` : agent.branch} /> : !card.branch && git ? <Pill t={t} icon="GitBranch" label={git} /> : null}
          {folder ? <Pill t={t} icon="Folder" label={folder} /> : null}
          {labels.map((label) => (
            <Pill key={label} t={t} icon="Tag" label={label} />
          ))}
          {moreLabels ? <Pill t={t} label={`+${moreLabels}`} /> : null}
          {card.pullRequest && facts.pullRequest ? <Pill t={t} icon="GitPullRequest" label={[facts.pullRequest.number ? `#${facts.pullRequest.number}` : "PR", facts.pullRequest.state].join(" ")} /> : null}
          {plan ? <Pill t={t} icon="ListChecks" label={`${plan.done}/${plan.total}`} /> : null}
          {subtasks ? <Pill t={t} icon="Network" label={[`${subtasks.total} sub-agent${subtasks.total === 1 ? "" : "s"}`, subtasks.running ? `${subtasks.running} running` : null, subtasks.waiting ? `${subtasks.waiting} waiting` : null, subtasks.failed ? `${subtasks.failed} failed` : null].filter(Boolean).join(" · ")} /> : null}
        </View>
      ) : null}
      {hasButtons ? (
        <View {...ACTIONS_MARK} style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, minHeight: t.compact ? 32 : 24, opacity: showButtons ? 1 : 0 }}>
          {buttons.allow ? <IconButton t={t} size="sm" icon="Check" tone={t.c.statusSuccess} label={`Allow: ${agent.title}`} disabled={buttons.busy} onPress={buttons.allow} /> : null}
          {buttons.deny ? <IconButton t={t} size="sm" icon="X" label={`Deny: ${agent.title}`} disabled={buttons.busy} onPress={buttons.deny} /> : null}
          {buttons.stop ? <StopButton t={t} title={agent.title} disabled={buttons.busy} onStop={buttons.stop} /> : null}
          {buttons.archive ? <IconButton t={t} size="sm" icon="Archive" label={`Archive ${agent.title}`} disabled={buttons.busy} onPress={buttons.archive} /> : null}
          {buttons.open ? <IconButton t={t} size="sm" icon="ArrowUpRight" label={`Open ${agent.title}`} onPress={buttons.open} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
