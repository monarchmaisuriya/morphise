import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { type AgentEntries, applyAgentUpdate, dueForRefresh, entriesFromSnapshot, readUsage, type UsageFacts } from "../../shared/agents-board";
import { type AgentActionResult, agentActionsAvailable, renameAgent, stopAgent } from "../../shared/agent-actions";
import { latestPlan } from "../../shared/steps";

// What the Agents view reads from Paseo: every agent on the host, archived ones included, while
// the view is open; each card's usage and plan while it is on screen; and the daemon's Stop and Rename.

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type ListState = { status: "loading" } | { status: "ready"; entries: AgentEntries } | { status: "error"; error: string };

// The daemon sends at most 200 agents a page (newest first); later pages are read once, up to this many agents.
const PAGE = 200;
const MAX_AGENTS = 2000;

// Paseo's own agent list leaves archived agents out; this asks for them too. The subscription
// carries the first page and every change after it; older pages are read once and merged.
// Released on unmount.
export function useAgentEntries(client: PluginClientContext): ListState {
  const [state, setState] = useState<ListState>({ status: "loading" });
  useEffect(() => watchAgentEntries(client, setState), [client]);
  return state;
}

/** Reports every agent on the host to `report` until the returned function releases the watch. */
export function watchAgentEntries(client: PluginClientContext, report: (state: ListState) => void): () => void {
  let released = false;
  let release = () => {};
  const filter = { includeArchived: true };
  client.paseo.agents.list({ subscribe: {}, filter, page: { limit: PAGE } }).then(
    ({ subscription }) => {
      if (released) return void subscription.release();
      let entries: AgentEntries = new Map();
      // Each snapshot starts the list over: older pages read for an earlier one are dropped, and so are agents removed
      // since this one, which an older page read afterwards may still hold.
      let generation = 0;
      let removed = new Set<string>();
      // Older pages fill in behind the live first page; a live entry is never replaced by an older read.
      const readOlder = async (cursor: string | null, from: number) => {
        let read = entries.size;
        while (cursor && !released && read < MAX_AGENTS) {
          const page = await client.paseo.agents.list({ filter, page: { limit: PAGE, cursor } });
          if (released || from !== generation) return;
          const older = [...entriesFromSnapshot(page.entries)].filter(([id]) => !removed.has(id));
          entries = new Map([...older, ...entries]);
          report({ status: "ready", entries });
          read += page.entries.length;
          cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
        }
      };
      const stop = subscription.subscribe({
        snapshot: (snapshot) => {
          generation += 1;
          removed = new Set();
          entries = entriesFromSnapshot(snapshot.entries);
          report({ status: "ready", entries });
          readOlder(snapshot.pageInfo.hasMore ? snapshot.pageInfo.nextCursor : null, generation).catch((error: unknown) => console.warn("[morphise] Could not read older agents for the Agents view", error));
        },
        update: (update) => {
          const change = update as { type: string; payload?: { kind?: unknown; agentId?: unknown } };
          if (change.type === "agent_update" && change.payload?.kind === "remove" && typeof change.payload.agentId === "string") removed.add(change.payload.agentId);
          const next = applyAgentUpdate(entries, change);
          if (next === entries) return;
          entries = next;
          report({ status: "ready", entries });
        },
      });
      release = () => {
        stop();
        void subscription.release();
      };
    },
    (error: unknown) => !released && report({ status: "error", error: message(error) }),
  );
  return () => {
    released = true;
    release();
  };
}

// ---------- Usage and plan, for cards on screen ----------

export interface CardLive {
  usage: UsageFacts | null;
  // With the step the agent is on, for the list's row line.
  plan: { done: number; total: number; step: string | null } | null;
}

// Read at most once a minute per agent, and kept across re-sorts and lane changes. A finished
// agent is read once per change Paseo reports, since its usage cannot move in between.
const cache = new Map<string, { at: number; updatedAt: string; live: CardLive }>();
const PLAN_TAIL = 50;

async function readLive(client: PluginClientContext, agentId: string, withPlan: boolean): Promise<CardLive> {
  const handle = client.paseo.agents.ref(agentId);
  const refreshed = await handle.refresh();
  const usage = readUsage(refreshed?.agent.lastUsage ?? handle.lastUsage);
  if (!withPlan) return { usage, plan: null };
  const page = await handle.timeline.refetch({ direction: "tail", limit: PLAN_TAIL });
  const plan = latestPlan(page.entries);
  if (!plan) return { usage, plan: null };
  const step = plan.steps.find((item) => item.status === "in_progress")?.text ?? null;
  return { usage, plan: { done: plan.steps.filter((item) => item.status === "completed").length, total: plan.steps.length, step } };
}

export function useCardLive(client: PluginClientContext | null, agent: { id: string; updatedAt: string; running: boolean; archived: boolean }, options: { onScreen: boolean; usage: boolean; plan: boolean }): CardLive | null {
  const [live, setLive] = useState<CardLive | null>(() => cache.get(agent.id)?.live ?? null);
  const wanted = client !== null && options.onScreen && !agent.archived && (options.usage || options.plan);
  useEffect(() => {
    if (!wanted || !client) return;
    let alive = true;
    const check = () => {
      const cached = cache.get(agent.id);
      const changed = !cached || cached.updatedAt !== agent.updatedAt || agent.running;
      if (!changed || !dueForRefresh(cached?.at, Date.now())) return;
      cache.set(agent.id, { at: Date.now(), updatedAt: agent.updatedAt, live: cached?.live ?? { usage: null, plan: null } });
      readLive(client, agent.id, options.plan).then(
        (next) => {
          cache.set(agent.id, { at: Date.now(), updatedAt: agent.updatedAt, live: next });
          if (alive) setLive(next);
        },
        (error: unknown) => console.warn(`[morphise] Could not read ${agent.id}'s usage for the Agents view`, error),
      );
    };
    check();
    const timer = setInterval(check, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client, wanted, agent.id, agent.updatedAt, agent.running, options.plan]);
  return live;
}

// ---------- Stop and Rename ----------

export interface CliActions {
  // False until the daemon says its machine has the CLI; the buttons stay hidden until then.
  available: boolean;
  stop(agentId: string): Promise<AgentActionResult>;
  rename(agentId: string, title: string): Promise<AgentActionResult>;
}

export function useCliActions(client: PluginClientContext): CliActions {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    client.rpc(agentActionsAvailable, {}).then(
      (result) => alive && setAvailable(result.available),
      (error: unknown) => console.warn("[morphise] Could not ask the daemon for the paseo command; Stop and Rename stay hidden", error),
    );
    return () => {
      alive = false;
    };
  }, [client]);
  const call = (run: () => Promise<AgentActionResult>) => run().catch((error: unknown): AgentActionResult => ({ ok: false, error: message(error) }));
  return {
    available,
    stop: (agentId) => call(() => client.rpc(stopAgent, { agentId })),
    rename: (agentId, title) => call(() => client.rpc(renameAgent, { agentId, title })),
  };
}
