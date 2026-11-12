import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { agentHeadline, type CardSettings, contextShare, modelLabel, rowLine } from "../../shared/agents-board";
import { summarizePermission } from "../../shared/inbox";
import { formatElapsed } from "../../shared/time-text";
import { DONE_OPACITY, statusColor } from "../ui/hues";
import { IconButton, type Tokens } from "../ui/kit";
import { agentAgo, type CardButtons, type CardFacts, ContextPill, Pill, STATUS_WORDS, StopButton } from "./card";
import type { CardLive } from "./data";
import { onRightClick, reveal } from "./web";

// One agent in the Agents view's list, as agent overviews draw it (Claude Code, GitHub): a status dot,
// the title, one muted line saying what the agent asks or does, a few facts on the right, and its
// buttons, always visible. A press opens the details; the More button or a right-click opens the menu.
// Phones keep only Allow, Deny and More on the row, so the title keeps its room; Stop is in the details,
// Open and Archive in the menu.

export function AgentRow({ t, facts, card, now, live, selected, focused, buttons, onPress, onMenu, onScreenRef }: { t: Tokens; facts: CardFacts; card: CardSettings; now: Date; live: CardLive | null; selected: boolean; focused: boolean; buttons: CardButtons; onPress(): void; onMenu: (() => void) | null; onScreenRef?(node: unknown): void }) {
  const { agent, indicator } = facts;
  const node = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
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
  // Phones keep one column: the time joins the muted line and the facts on the right are left out.
  const second = t.compact ? [line, time].filter(Boolean).join(" · ") : line;
  const finished = indicator === "done";
  return (
    <Pressable
      ref={node}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${headline.title}, ${STATUS_WORDS[indicator]}${line ? `. ${line}` : ""}`}
      onPress={onPress}
      onLongPress={onMenu ?? undefined}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }: { pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: t.compact ? 56 : 48,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: t.radius.row,
        borderWidth: 1,
        borderColor: focused ? t.c.accent : "transparent",
        backgroundColor: pressed || hovered || selected ? t.c.surface1 : "transparent",
        opacity: agent.archivedAt ? 0.75 : 1,
      })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(t.c, indicator), opacity: finished ? DONE_OPACITY : 1 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: t.c.foreground, fontSize: 13, fontWeight: "500", lineHeight: 18 }} numberOfLines={1}>
          {headline.title}
        </Text>
        {second ? (
          <Text style={[t.text.small, indicator === "failed" ? { color: t.c.statusDanger } : null]} numberOfLines={1}>
            {second}
          </Text>
        ) : null}
      </View>
      {t.compact ? null : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {share !== null ? <ContextPill t={t} share={share} /> : null}
          {plan ? <Pill t={t} icon="ListChecks" label={`${plan.done}/${plan.total}`} /> : null}
          {pullRequest ? <Pill t={t} icon="GitPullRequest" label={pullRequest} /> : null}
          {model ? (
            <Text style={t.text.meta} numberOfLines={1}>
              {model}
            </Text>
          ) : null}
          {time ? <Text style={[t.text.meta, { minWidth: 56, textAlign: "right", fontVariant: ["tabular-nums"] }]}>{time}</Text> : null}
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 }}>
        {buttons.allow ? <IconButton t={t} size="sm" icon="Check" tone={t.c.statusSuccess} label={`Allow: ${headline.title}`} disabled={buttons.busy} onPress={buttons.allow} /> : null}
        {buttons.deny ? <IconButton t={t} size="sm" icon="X" label={`Deny: ${headline.title}`} disabled={buttons.busy} onPress={buttons.deny} /> : null}
        {t.compact ? null : (
          <>
            {buttons.stop ? <StopButton t={t} title={headline.title} disabled={buttons.busy} onStop={buttons.stop} /> : null}
            {buttons.archive ? <IconButton t={t} size="sm" icon="Archive" label={`Archive ${headline.title}`} disabled={buttons.busy} onPress={buttons.archive} /> : null}
            {buttons.open ? <IconButton t={t} size="sm" icon="ArrowUpRight" label={`Open ${headline.title}`} onPress={buttons.open} /> : null}
          </>
        )}
        {onMenu ? <IconButton t={t} size="sm" icon="Ellipsis" label={`More for ${headline.title}`} onPress={onMenu} /> : null}
      </View>
    </Pressable>
  );
}
