import { getPaseoClient } from "@getpaseo/plugin/client";
import { useEffect, useMemo } from "react";
import { type AttentionList, reduceAttention } from "./attention";
import { createValueStore, useValue, type ValueStore } from "./profile-store";
import { reduceWorkspaceInfo, type WorkspaceInfo, type WorkspaceList } from "./workspaces";

// Morphise's data about every connected host, one owned list subscription per host and list:
// workspace data (pull requests, checks, services, git state, marks) and the chats waiting on the
// user (pending permission requests). Paseo's hooks list every host's workspaces and chats but
// carry none of this, so anything shown beside those rows is looked up here by the row's host and
// id together: the same id can exist on two hosts.

export interface ListSubscription {
  subscribe(observer: { snapshot(snapshot: { entries: readonly unknown[] }): void; update(message: { type: string; payload?: unknown }): void }): () => void;
  release(): Promise<void>;
}

interface OwnedList {
  list(options: { subscribe: Record<string, never> }): Promise<{ subscription: ListSubscription }>;
}

// The calls this module makes on a host's API.
export interface HostListSource {
  workspaces: OwnedList;
}
export interface HostAgentSource {
  agents: OwnedList;
}

type Change = { snapshot: readonly unknown[] } | { message: { type: string; payload?: unknown } };
type HostState<List> = { status: "loading" } | { status: "ready"; list: List } | { status: "failed" };
export type HostStates<List> = ReadonlyMap<string, HostState<List>>;

// "loading" until the host's first snapshot: readers decide on purpose what an unknown workspace
// means, instead of reading it as one with no changes and no mark.
export type HostWorkspace = WorkspaceInfo | null | "loading";

export function lookupWorkspace(states: HostStates<WorkspaceList>, wanted: readonly string[], ref: { hostId: string; id: string }): HostWorkspace {
  if (!wanted.includes(ref.hostId)) return null;
  const state = states.get(ref.hostId);
  if (!state || state.status === "loading") return "loading";
  return state.status === "ready" ? state.list.get(ref.id) ?? null : null;
}

// One host's chats waiting on the user; empty until its first snapshot, as before any snapshot.
const NO_ATTENTION: AttentionList = new Map();
export function attentionOn(states: HostStates<AttentionList>, hostId: string): AttentionList {
  const state = states.get(hostId);
  return state?.status === "ready" ? state.list : NO_ATTENTION;
}

// Archiving deletes a Paseo worktree's folder. Work is at stake unless the workspace is known to be
// clean and pushed, or known not to be a Paseo worktree: not knowing yet counts as at risk.
export function atRiskOfArchive(info: HostWorkspace): boolean {
  if (info === "loading" || info === null) return true;
  return info.paseoWorktree === true && !(info.dirty === false && info.ahead === 0);
}

// Done marks skip workspaces that need the user (permission or failed), and ones whose status is
// not known yet.
export function markableDone(info: HostWorkspace): info is WorkspaceInfo {
  return info !== "loading" && info !== null && info.status !== "needs_input" && info.status !== "failed";
}

// Every workspace of every loaded host.
export function loadedWorkspaces(states: HostStates<WorkspaceList>): WorkspaceInfo[] {
  return [...states.values()].flatMap((state) => (state.status === "ready" ? [...state.list.values()] : []));
}

function createHostLists<List>(what: string, open: (hostId: string) => OwnedList, reduce: (current: List, change: Change) => List, empty: List) {
  const state: ValueStore<HostStates<List>> = createValueStore<HostStates<List>>(new Map());
  const feeds = new Map<string, { users: number; stop(): void }>();
  const put = (hostId: string, next: HostState<List> | null) => {
    const states = new Map(state.get());
    if (next) states.set(hostId, next);
    else states.delete(hostId);
    state.set(states);
  };
  const failed = (hostId: string, error: unknown) => {
    console.error(`[morphise] ${what} list for host ${hostId} is unavailable; its rows show no Morphise details`, error);
    put(hostId, { status: "failed" });
  };

  function start(hostId: string) {
    let stopped = false;
    let release: (() => void) | null = null;
    put(hostId, { status: "loading" });
    let source: OwnedList;
    try {
      source = open(hostId);
    } catch (error) {
      failed(hostId, error);
      return { users: 0, stop: () => put(hostId, null) };
    }
    source
      .list({ subscribe: {} })
      .then(({ subscription }) => {
        if (stopped) return void subscription.release();
        const stopObserving = subscription.subscribe({
          snapshot: (snapshot) => put(hostId, { status: "ready", list: reduce(empty, { snapshot: snapshot.entries }) }),
          update: (message) => {
            const current = state.get().get(hostId);
            if (current?.status !== "ready") return;
            const next = reduce(current.list, { message });
            if (next !== current.list) put(hostId, { status: "ready", list: next });
          },
        });
        release = () => {
          stopObserving();
          void subscription.release();
        };
      })
      .catch((error: unknown) => {
        if (!stopped) failed(hostId, error);
      });
    return {
      users: 0,
      stop() {
        stopped = true;
        release?.();
        put(hostId, null);
      },
    };
  }

  // Each user holds the host's list until it calls the returned function.
  function acquire(hostId: string): () => void {
    const feed = feeds.get(hostId) ?? start(hostId);
    feeds.set(hostId, feed);
    feed.users++;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      feed.users--;
      if (feed.users === 0 && feeds.get(hostId) === feed) {
        feeds.delete(hostId);
        feed.stop();
      }
    };
  }

  return { state, acquire };
}

type HostLists<List> = ReturnType<typeof createHostLists<List>>;

export function createHostWorkspaces(connect: (hostId: string) => HostListSource): HostLists<WorkspaceList> {
  return createHostLists<WorkspaceList>("Workspace", (hostId) => connect(hostId).workspaces, reduceWorkspaceInfo, new Map());
}

export function createHostAttention(connect: (hostId: string) => HostAgentSource): HostLists<AttentionList> {
  return createHostLists<AttentionList>("Agent", (hostId) => connect(hostId).agents, (current, change) => reduceAttention(current, change as Parameters<typeof reduceAttention>[1]), new Map());
}

// Shared by every surface in this app session.
const hostWorkspaces = createHostWorkspaces((hostId) => getPaseoClient(hostId) as unknown as HostListSource);
const hostAttention = createHostAttention((hostId) => getPaseoClient(hostId) as unknown as HostAgentSource);

// Holds the given hosts' lists while mounted.
function useHeld<List>(lists: HostLists<List>, hostIds: readonly string[]): { key: string; states: HostStates<List> } {
  const key = [...new Set(hostIds)].sort().join("\n");
  useEffect(() => {
    const releases = key ? key.split("\n").map((hostId) => lists.acquire(hostId)) : [];
    return () => releases.forEach((release) => release());
  }, [lists, key]);
  return { key, states: useValue(lists.state) };
}

// The workspace lookup by host and id, and every loaded workspace.
export function useHostWorkspaces(hostIds: readonly string[]) {
  const { key, states } = useHeld(hostWorkspaces, hostIds);
  return useMemo(() => {
    const wanted = key ? key.split("\n") : [];
    return { infoOf: (ref: { hostId: string; id: string }) => lookupWorkspace(states, wanted, ref), all: loadedWorkspaces(states) };
  }, [states, key]);
}

// Each host's chats waiting on the user.
export function useHostAttention(hostIds: readonly string[]) {
  const { states } = useHeld(hostAttention, hostIds);
  return useMemo(() => (hostId: string) => attentionOn(states, hostId), [states]);
}
