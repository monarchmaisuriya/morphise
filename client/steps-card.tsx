import { type AgentRef, useAgent, usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { chatName } from "../shared/chat-status";
import { cardMode, latestSteps, listedSteps, readSteps, type Step, stepCounts, type StepsOptions } from "../shared/steps";
import type { Tokens } from "./ui/kit";
import { Icon, IconButton } from "./ui/kit";
import { usePulse } from "./ui/pulse";

// How much history is searched for the current plan when a chat opens.
const TAIL = 300;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// The open chat's current plan: read once from its recent history, then kept current from its live
// timeline. `finishedAt` is when the plan last turned all-done while watched.
function usePlan(agentId: string | null) {
  const paseo = usePaseo();
  const [plan, setPlan] = useState<{ agentId: string | null; steps: Step[] | null; finishedAt: number | null }>({ agentId: null, steps: null, finishedAt: null });
  useEffect(() => {
    if (!agentId) return;
    let alive = true;
    const handle = paseo.agents.ref(agentId);
    // Live plans seen so far: a history read that started before one of them is older and must not
    // replace it.
    let liveSeen = 0;
    const apply = (steps: Step[] | null, live: boolean) => {
      if (!alive) return;
      setPlan((current) => {
        const wasOpen = current.agentId === agentId && current.steps?.some((step) => step.status !== "completed");
        const nowDone = !!steps && steps.length > 0 && steps.every((step) => step.status === "completed");
        return { agentId, steps, finishedAt: live && wasOpen && nowDone ? Date.now() : current.agentId === agentId ? current.finishedAt : null };
      });
    };
    const load = () => {
      const seenAtStart = liveSeen;
      return handle.timeline.refetch({ direction: "tail", limit: TAIL }).then(
        (page) => {
          if (liveSeen === seenAtStart) apply(latestSteps(page.entries), false);
        },
        (error: unknown) => console.error("[morphise] Could not read the chat's steps", error),
      );
    };
    setPlan({ agentId, steps: null, finishedAt: null });
    void load();
    const stop = handle.timeline.subscribe((update) => {
      const event = record(record(update)?.event);
      // After a replacement or a reconnect, live events may have been missed: read history again.
      if (event?.type === "replacement" || event?.type === "subscription_restored") return void load();
      if (event?.type !== "timeline") return;
      const steps = readSteps(event.item);
      if (!steps) return;
      liveSeen++;
      apply(steps, true);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [agentId, paseo]);
  return plan.agentId === agentId ? plan : { agentId, steps: null, finishedAt: null };
}

function StepRow({ step, t }: { step: Step; t: Tokens }) {
  const pulse = usePulse(step.status === "in_progress");
  const c = t.c;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 }}>
      <View style={{ width: 14, height: 18, alignItems: "center", justifyContent: "center" }}>
        {step.status === "completed" ? (
          <Icon name="CircleCheck" size={13} color={c.statusSuccess} />
        ) : step.status === "in_progress" ? (
          <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.foreground, opacity: pulse }} />
        ) : (
          <Icon name="Circle" size={13} color={c.foregroundMuted} />
        )}
      </View>
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: step.status === "completed" ? c.foregroundMuted : c.foreground, textDecorationLine: step.status === "completed" ? "line-through" : "none" }} numberOfLines={2}>
        {step.text}
      </Text>
    </View>
  );
}

// One chat's steps: shown while its plan has unfinished steps, "All done" for `doneSeconds` when it
// finishes (or for as long as the plan stands when shown always), hidden otherwise. × hides this
// plan until it changes. `title` names the chat when several cards are shown.
// `hidden` keeps the card from drawing while it still follows its plan; `onShown` reports whether
// it has something to show.
export function StepsCard({ agentId, t, options, title = null, hidden = false, onShown }: { agentId: string | null; t: Tokens; options: StepsOptions; title?: string | null; hidden?: boolean; onShown?(shown: boolean): void }) {
  const { steps, finishedAt } = usePlan(agentId);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [folded, setFolded] = useState(options.startFolded);
  const doneForMs = options.doneSeconds * 1000;
  const finishedRecently = finishedAt !== null && now - finishedAt < doneForMs;
  useEffect(() => {
    if (finishedAt === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, doneForMs - (Date.now() - finishedAt)) + 50);
    return () => clearTimeout(timer);
  }, [finishedAt, doneForMs]);
  const mode = cardMode(steps, finishedRecently, options.show);
  const planKey = steps ? JSON.stringify(steps) : null;
  const shown = !(mode === "hidden" || !steps || (planKey !== null && dismissed === planKey));
  useEffect(() => {
    onShown?.(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => () => onShown?.(false), []);
  if (!shown || hidden || !steps) return null;
  const { done, total } = stepCounts(steps);
  const current = steps.find((step) => step.status === "in_progress") ?? steps.find((step) => step.status === "pending") ?? null;
  const { rows, more } = listedSteps(steps, options);
  return (
    <View accessibilityLabel={`Steps${title ? ` of ${title}` : ""}, ${done} of ${total} done`} style={{ marginHorizontal: 8, marginVertical: 3, padding: 8, gap: 4, borderRadius: 10, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1 }}>
      {title ? (
        <Text style={{ fontSize: 11, color: t.c.foregroundMuted }} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={folded ? "Show the steps" : "Hide the step list"} onPress={() => setFolded(!folded)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 22 }}>
          <Icon name={mode === "done" ? "CircleCheck" : "ListChecks"} size={13} color={mode === "done" ? t.c.statusSuccess : t.c.foregroundMuted} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: t.c.foreground }}>{mode === "done" ? `All ${total} done` : "Steps"}</Text>
          {mode === "plan" ? <Text style={{ fontSize: 12, color: t.c.foregroundMuted }}>{`${done}/${total}`}</Text> : null}
          {mode === "plan" && folded && current ? (
            <Text style={{ flex: 1, fontSize: 12, color: t.c.foregroundMuted }} numberOfLines={1}>
              {current.text}
            </Text>
          ) : null}
        </Pressable>
        <IconButton t={t} size="sm" icon="X" label="Hide these steps until they change" onPress={() => setDismissed(planKey)} />
      </View>
      {mode === "plan" && options.progress ? <View style={{ height: 3, borderRadius: 2, backgroundColor: t.c.surface2, overflow: "hidden" }}><View style={{ width: `${Math.round((done / total) * 100)}%`, height: 3, backgroundColor: t.c.statusSuccess }} /></View> : null}
      {mode === "plan" && !folded ? (
        <ScrollView style={{ maxHeight: 200 }}>
          {rows.map((step, index) => (
            <StepRow key={`${index}:${step.text}`} step={step} t={t} />
          ))}
          {more > 0 ? <Text style={{ fontSize: 11, color: t.c.foregroundMuted, paddingLeft: 22, paddingTop: 2 }}>{`${more} more`}</Text> : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

// At most this many cards when every chat in the workspace shows its plan, chosen from the most
// recent chats this many (each one reads its chat's history).
const MAX_CARDS = 3;
const CHATS_CHECKED = 12;

// The cards the options ask for: the open chat's, or the latest chats of the open workspace that
// have a plan to show, up to MAX_CARDS of them.
export function StepsCards({ open, chats, t, options }: { open: string | null; chats: readonly AgentRef[]; t: Tokens; options: StepsOptions }) {
  // Which chats currently draw a card; the first MAX_CARDS of them, latest first, are shown.
  const [showing, setShowing] = useState<ReadonlySet<string>>(new Set());
  if (options.scope === "open") return <StepsCard agentId={open} t={t} options={options} />;
  const checked = chats.slice(0, CHATS_CHECKED);
  const allowed = new Set(checked.filter((chat) => showing.has(chat.id)).slice(0, MAX_CARDS).map((chat) => chat.id));
  const report = (id: string, shown: boolean) =>
    setShowing((current) => {
      if (current.has(id) === shown) return current;
      const next = new Set(current);
      if (shown) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <>
      {checked.map((chat) => (
        <NamedStepsCard key={chat.key} chat={chat} t={t} options={options} allowed={allowed.has(chat.id)} report={report} />
      ))}
    </>
  );
}

function NamedStepsCard({ chat, t, options, allowed, report }: { chat: AgentRef; t: Tokens; options: StepsOptions; allowed: boolean; report(id: string, shown: boolean): void }) {
  const title = useAgent(chat, (agent) => chatName(agent)) ?? null;
  return <StepsCard agentId={chat.id} t={t} options={options} title={title} hidden={!allowed} onShown={(shown) => report(chat.id, shown)} />;
}
