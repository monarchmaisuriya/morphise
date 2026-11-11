import { type AgentRef, getPaseoClient, type PluginTimelineItemProps, useAgent, type usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";
import { chatName } from "../shared/chat-status";
import { cardMode, latestPlan, listedSteps, readSteps, type Step, stepCounts, type StepsOptions, timeOf } from "../shared/steps";
import { createValueStore, useValue, type ValueStore } from "./profile-store";
import { Icon, IconButton, type Tokens, useTokens } from "./ui/kit";
import { usePulse } from "./ui/pulse";

type Paseo = ReturnType<typeof usePaseo>;

// How much history is searched for the current plan when a chat opens.
const TAIL = 300;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// ---------- One live plan per chat, shared by every card that shows it ----------

// A chat's current plan: read once from its recent history, then kept current from its live
// timeline. `status` says whether that read has finished or failed; `latestAt` is when the plan
// was posted (null when Paseo gave no time); `finishedAt` is when the plan last turned all-done
// while watched.
interface Plan {
  status: "loading" | "ready" | "failed";
  steps: Step[] | null;
  latestAt: number | null;
  finishedAt: number | null;
}

const NO_PLAN: Plan = { status: "loading", steps: null, latestAt: null, finishedAt: null };

// The chat a feed follows: its host and id. Two hosts can have chats with the same id.
export interface PlanTarget {
  hostId: string;
  agentId: string;
}

const feedKey = (target: PlanTarget) => `${target.hostId}:${target.agentId}`;

// The chat's host's own connection; the given one when the app does not know the host.
function clientFor(hostId: string, fallback: Paseo): Paseo {
  try {
    return getPaseoClient(hostId) as unknown as Paseo;
  } catch {
    return fallback;
  }
}
const NO_FEED = createValueStore<Plan>(NO_PLAN);

interface Feed {
  store: ValueStore<Plan>;
  users: number;
  stop(): void;
}

// Every card of one chat (the sidebar's, and each plan update drawn in the chat) reads the same
// feed, so a chat's history is read and followed once however many cards show it.
const feeds = new Map<string, Feed>();

function startFeed(paseo: Paseo, agentId: string): Feed {
  const store = createValueStore<Plan>(NO_PLAN);
  const handle = paseo.agents.ref(agentId);
  let alive = true;
  // Live plans seen so far: a history read that started before one of them is older and must not
  // replace it.
  let liveSeen = 0;
  const apply = (steps: Step[] | null, latestAt: number | null, live: boolean) => {
    if (!alive) return;
    const current = store.get();
    const wasOpen = current.steps?.some((step) => step.status !== "completed") ?? false;
    const nowDone = !!steps && steps.length > 0 && steps.every((step) => step.status === "completed");
    store.set({ status: "ready", steps, latestAt, finishedAt: live && wasOpen && nowDone ? Date.now() : current.finishedAt });
  };
  const load = () => {
    const seenAtStart = liveSeen;
    void handle.timeline.refetch({ direction: "tail", limit: TAIL }).then(
      (page) => {
        if (liveSeen !== seenAtStart) return;
        const plan = latestPlan(page.entries);
        apply(plan?.steps ?? null, plan?.at ?? null, false);
      },
      (error: unknown) => {
        console.error("[morphise] Could not read the chat's steps", error);
        if (alive && liveSeen === seenAtStart) store.set({ ...store.get(), status: "failed" });
      },
    );
  };
  load();
  const unsubscribe = handle.timeline.subscribe((update) => {
    const event = record(record(update)?.event);
    // After a replacement or a reconnect, live events may have been missed: read history again.
    if (event?.type === "replacement" || event?.type === "subscription_restored") return void load();
    if (event?.type !== "timeline") return;
    const steps = readSteps(event.item);
    if (!steps) return;
    liveSeen++;
    apply(steps, timeOf(record(update)?.timestamp) ?? timeOf(event.timestamp), true);
  });
  return {
    store,
    users: 0,
    stop() {
      alive = false;
      unsubscribe();
    },
  };
}

function usePlan(target: PlanTarget | null, fallback: Paseo): Plan {
  const key = target ? feedKey(target) : null;
  const [feed, setFeed] = useState<{ key: string; store: ValueStore<Plan> } | null>(null);
  useEffect(() => {
    if (!target || !key) return setFeed(null);
    const current = feeds.get(key) ?? startFeed(clientFor(target.hostId, fallback), target.agentId);
    feeds.set(key, current);
    current.users++;
    setFeed({ key, store: current.store });
    return () => {
      current.users--;
      if (current.users === 0 && feeds.get(key) === current) {
        current.stop();
        feeds.delete(key);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);
  const plan = useValue(feed && feed.key === key ? feed.store : NO_FEED);
  return feed && feed.key === key ? plan : NO_PLAN;
}

// ---------- The card ----------

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

// A plan's card: shown while it has unfinished steps, "All done" for `doneSeconds` when it
// finishes (or for as long as the plan stands when shown always). × hides this plan until it
// changes. `title` names the chat when several cards are shown. In the chat (`inline`), a finished
// plan whose moment has passed stays as one line instead of disappearing, so the chat does not
// jump. `hidden` keeps the card from drawing while it still follows its plan; `onShown` reports
// whether it has something to show.
function StepsCardView({ plan, t, options, title = null, inline = false, hidden = false, onShown }: { plan: Plan; t: Tokens; options: StepsOptions; title?: string | null; inline?: boolean; hidden?: boolean; onShown?(shown: boolean): void }) {
  const { steps, finishedAt } = plan;
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
  if (hidden || !steps || steps.length === 0) return null;
  const { done, total } = stepCounts(steps);
  if (!shown) return inline ? <PlanLine t={t} icon={done === total ? "CircleCheck" : "ListChecks"} text={done === total ? `Plan · all ${total} done` : `Plan · ${done} of ${total} done`} /> : null;
  const current = steps.find((step) => step.status === "in_progress") ?? steps.find((step) => step.status === "pending") ?? null;
  const { rows, more } = listedSteps(steps, options);
  return (
    <View accessibilityLabel={`Steps${title ? ` of ${title}` : ""}, ${done} of ${total} done`} style={{ marginHorizontal: inline ? 0 : 8, marginVertical: inline ? 6 : 3, padding: inline ? 12 : 8, gap: 4, borderRadius: inline ? 12 : 10, borderWidth: 1, borderColor: t.c.border, backgroundColor: t.c.surface1, maxWidth: inline ? 720 : undefined }}>
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
        <ScrollView style={{ maxHeight: inline ? 320 : 200 }}>
          {rows.map((step, index) => (
            <StepRow key={`${index}:${step.text}`} step={step} t={t} />
          ))}
          {more > 0 ? <Text style={{ fontSize: 11, color: t.c.foregroundMuted, paddingLeft: 22, paddingTop: 2 }}>{`${more} more`}</Text> : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

// One muted line in the chat for a plan update that is not the current plan, or a finished one.
function PlanLine({ t, icon, text }: { t: Tokens; icon: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
      <Icon name={icon} size={12} color={t.c.foregroundMuted} />
      <Text style={{ fontSize: 12, color: t.c.foregroundMuted }}>{text}</Text>
    </View>
  );
}

export function StepsCard({ agent, paseo, ...rest }: { agent: AgentRef | null; paseo: Paseo; t: Tokens; options: StepsOptions; title?: string | null; hidden?: boolean; onShown?(shown: boolean): void }) {
  return <StepsCardView plan={usePlan(agent ? { hostId: agent.hostId, agentId: agent.id } : null, paseo)} {...rest} />;
}

// ---------- In the sidebar ----------

// At most this many cards when every chat in the workspace shows its plan, chosen from the most
// recent chats this many (each one follows its chat's history).
const MAX_CARDS = 3;
const CHATS_CHECKED = 12;

// The cards the options ask for: the open chat's, or the latest chats of the open workspace that
// have a plan to show, up to MAX_CARDS of them.
export function StepsCards({ open, chats, paseo, t, options }: { open: AgentRef | null; chats: readonly AgentRef[]; paseo: Paseo; t: Tokens; options: StepsOptions }) {
  // Which chats currently draw a card; the first MAX_CARDS of them, latest first, are shown.
  const [showing, setShowing] = useState<ReadonlySet<string>>(new Set());
  if (options.scope === "open") return <StepsCard agent={open} paseo={paseo} t={t} options={options} />;
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
        <NamedStepsCard key={chat.key} chat={chat} paseo={paseo} t={t} options={options} allowed={allowed.has(chat.id)} report={report} />
      ))}
    </>
  );
}

function NamedStepsCard({ chat, paseo, t, options, allowed, report }: { chat: AgentRef; paseo: Paseo; t: Tokens; options: StepsOptions; allowed: boolean; report(id: string, shown: boolean): void }) {
  const title = useAgent(chat, (agent) => chatName(agent)) ?? null;
  return <StepsCard agent={chat} paseo={paseo} t={t} options={options} title={title} hidden={!allowed} onShown={(shown) => report(chat.id, shown)} />;
}

// ---------- In the chat ----------

// Each plan update an agent posts (a `todo` timeline item) is drawn by Morphise instead of Paseo:
// the newest as the live card, older ones as one line each.
export const CHAT_STEPS_KIND = "steps-card";
export const chatStepsSchema = z.object({ steps: z.array(z.object({ text: z.string(), status: z.enum(["pending", "in_progress", "completed"]) })) });
type ChatSteps = z.output<typeof chatStepsSchema>;

// An empty plan (the agent cleared it) keeps Paseo's own row.
export function toChatSteps(item: unknown): ChatSteps | null {
  const steps = readSteps(item);
  return steps && steps.length ? { steps } : null;
}

export function createChatStepsRow(paseo: Paseo, options: () => StepsOptions) {
  return function ChatStepsRow({ agentId, item, timestamp, theme, host, layout }: PluginTimelineItemProps<ChatSteps>) {
    const t = useTokens(theme, layout.compact);
    const plan = usePlan({ hostId: host.id, agentId }, paseo);
    const own = item.data.steps;
    // Only the newest plan update is the live card, found by when it was posted (by content only
    // when Paseo gave no time). Until the chat's plan is read, or when it cannot be, every update
    // is one line, so a chat never shows two live cards.
    const current = plan.status === "ready" && plan.steps !== null && (plan.latestAt !== null ? plan.latestAt === timestamp.getTime() : JSON.stringify(plan.steps) === JSON.stringify(own));
    if (!current) {
      const { done, total } = stepCounts(own);
      return <PlanLine t={t} icon="ListChecks" text={`Plan · ${done} of ${total} done`} />;
    }
    return <StepsCardView plan={plan} t={t} options={options()} inline />;
  };
}
