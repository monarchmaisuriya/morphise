import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { agentHeadline, type CardSettings, contextShare, modelLabel, rowLine } from "../../shared/agents-board";
import { summarizePermission } from "../../shared/inbox";
import { formatElapsed } from "../../shared/time-text";
import type { Indicator } from "../../shared/profile";
import { Fact, GroupRow } from "../ui/grouped-list";
import { statusColor } from "../ui/hues";
import { Icon, IconButton, type Tokens } from "../ui/kit";
import { agentAgo, type CardButtons, type CardFacts, STATUS_WORDS, StopButton } from "./card";
import type { CardLive } from "./data";
import { onRightClick, reveal } from "./web";

// One agent in the Agents view's list, as agent overviews draw it (Claude Code, GitHub): a status icon, the title
// and, on the same line, what the agent asks, does or failed on (else its first prompt); quiet facts at the right.
// Allow and Deny always show; Stop, Archive, Open and More float over the row's end on hover or keyboard focus
// (in the row on touch). A press opens the details; right-click or a long press opens the menu.

// The icon each status gets, in its colour: a hand for waiting on you, a spinner circle while running.
export const STATUS_ICONS: Record<Indicator, string> = { needs_input: "Hand", running: "LoaderCircle", attention: "CircleDot", failed: "CircleX", done: "CircleCheck" };

export function AgentRow({ t, facts, card, now, live, selected, focused, buttons, onPress, onMenu, onScreenRef }: { t: Tokens; facts: CardFacts; card: CardSettings; now: Date; live: CardLive | null; selected: boolean; focused: boolean; buttons: CardButtons; onPress(): void; onMenu: (() => void) | null; onScreenRef?(node: unknown): void }) {
  const { agent, indicator } = facts;
  const node = useRef<View>(null);
  useEffect(() => (onMenu ? onRightClick(node.current, onMenu) : undefined), [onMenu]);
  useEffect(() => onScreenRef?.(node.current), [onScreenRef]);
  useEffect(() => (focused ? reveal(node.current) : undefined), [focused]);
  const headline = agentHeadline(agent, facts.workspaceShared);
  const running = indicator === "running" || !!agent.turnStartedAt;
  const permission = indicator === "needs_input" ? summarizePermission(agent.pendingPermissions[agent.pendingPermissions.length - 1]) : null;
  const line = rowLine({ indicator, permission, error: agent.lastError, step: card.plan ? live?.plan?.step ?? null : null, subtitle: headline.subtitle });
  const share = card.context && running ? contextShare(live?.usage?.context ?? agent.context) : null;
  const model = card.model || card.provider ? modelLabel(card.provider ? agent.provider : null, card.model ? agent.model : null) : null;
  const time = card.timer ? (agent.turnStartedAt ? formatElapsed(agent.turnStartedAt, now) : agentAgo(agent.updatedAt, now)) : null;
  const pullRequest = card.pullRequest && facts.pullRequest ? [facts.pullRequest.number ? `#${facts.pullRequest.number}` : "PR", facts.pullRequest.state].join(" ") : null;
  const plan = card.plan ? live?.plan ?? null : null;
  const tone = statusColor(t.c, indicator);
  const lineTone = indicator === "failed" ? t.c.statusDanger : indicator === "needs_input" ? t.c.statusWarning : t.c.foregroundMuted;
  // Phones keep two lines: the time joins the muted line, and the facts at the right are left out.
  const detail = t.compact ? [line, time].filter(Boolean).join(" · ") : line;
  const contextTone = share === null ? undefined : share >= 0.95 ? t.c.statusDanger : share >= 0.8 ? t.c.statusWarning : undefined;
  return (
    <GroupRow
      t={t}
      nodeRef={node}
      leading={<Icon name={STATUS_ICONS[indicator]} size={15} color={tone} />}
      title={headline.title}
      detail={
        detail ? (
          <Text style={{ fontSize: 12, color: lineTone, flex: 1, minWidth: 0 }} numberOfLines={1}>
            {detail}
          </Text>
        ) : undefined
      }
      facts={
        <>
          {plan ? <Fact t={t} icon="ListChecks" text={`${plan.done}/${plan.total}`} tone={plan.done === plan.total ? t.c.statusSuccess : undefined} /> : null}
          {share !== null ? <Fact t={t} icon="Gauge" text={`${Math.round(share * 100)}%`} tone={contextTone} /> : null}
          {pullRequest ? <Fact t={t} icon="GitPullRequest" text={pullRequest} /> : null}
          {model ? <Fact t={t} text={model} /> : null}
          {time ? (
            <Text style={{ fontSize: 12, color: t.c.foregroundMuted, minWidth: 52, textAlign: "right", fontVariant: ["tabular-nums"] }} numberOfLines={1}>
              {time}
            </Text>
          ) : null}
        </>
      }
      pinned={
        buttons.allow || buttons.deny ? (
          <>
            {buttons.allow ? <IconButton t={t} size="sm" icon="Check" tone={t.c.statusSuccess} label={`Allow: ${headline.title}`} disabled={buttons.busy} onPress={buttons.allow} /> : null}
            {buttons.deny ? <IconButton t={t} size="sm" icon="X" label={`Deny: ${headline.title}`} disabled={buttons.busy} onPress={buttons.deny} /> : null}
          </>
        ) : undefined
      }
      actions={
        !onMenu && (t.compact || !(buttons.stop || buttons.archive || buttons.open)) ? undefined : (
        <>
          {!t.compact && buttons.stop ? <StopButton t={t} title={headline.title} disabled={buttons.busy} onStop={buttons.stop} /> : null}
          {!t.compact && buttons.archive ? <IconButton t={t} size="sm" icon="Archive" label={`Archive ${headline.title}`} disabled={buttons.busy} onPress={buttons.archive} /> : null}
          {!t.compact && buttons.open ? <IconButton t={t} size="sm" icon="ArrowUpRight" label={`Open ${headline.title}`} onPress={buttons.open} /> : null}
          {onMenu ? <IconButton t={t} size="sm" icon="Ellipsis" label={`More for ${headline.title}`} onPress={onMenu} /> : null}
        </>
        )
      }
      selected={selected}
      dim={!!agent.archivedAt}
      focused={focused}
      label={`${headline.title}, ${STATUS_WORDS[indicator]}${line ? `. ${line}` : ""}`}
      onPress={onPress}
      onLongPress={onMenu ?? undefined}
    />
  );
}
