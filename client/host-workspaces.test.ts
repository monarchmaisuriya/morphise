import { describe, expect, it, vi } from "vitest";
import { atRiskOfArchive, attentionOn, createHostAttention, createHostWorkspaces, type HostListSource, lookupWorkspace, markableDone } from "./host-workspaces";
import { reduceWorkspaceInfo } from "./workspaces";

type Observer = { snapshot(snapshot: { entries: readonly unknown[] }): void; update(message: { type: string; payload?: unknown }): void };

// A host whose workspace list the test drives by hand.
function fakeHost() {
  let observer: Observer | null = null;
  const released = vi.fn(async () => {});
  let resolve: (value: { subscription: { subscribe(observer: Observer): () => void; release(): Promise<void> } }) => void = () => {};
  const source: HostListSource = {
    workspaces: {
      list: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  };
  return {
    source,
    released,
    open() {
      resolve({
        subscription: {
          subscribe(next) {
            observer = next;
            return () => (observer = null);
          },
          release: released,
        },
      });
    },
    snapshot: (entries: unknown[]) => observer?.snapshot({ entries }),
    update: (payload: unknown) => observer?.update({ type: "workspace_update", payload }),
  };
}

const flush = () => new Promise((done) => setTimeout(done, 0));
const ref = (hostId: string, id: string) => ({ hostId, id });

describe("per-host workspace lists", () => {
  it("is loading until the host's first snapshot, then answers by host and id", async () => {
    const one = fakeHost();
    const two = fakeHost();
    const feeds = createHostWorkspaces((hostId) => (hostId === "one" ? one.source : two.source));
    feeds.acquire("one");
    feeds.acquire("two");
    const wanted = ["one", "two"];
    expect(lookupWorkspace(feeds.state.get(), wanted, ref("two", "w1"))).toBe("loading");
    one.open();
    two.open();
    await flush();
    one.snapshot([{ id: "w1", name: "On one" }]);
    expect(lookupWorkspace(feeds.state.get(), wanted, ref("two", "w1"))).toBe("loading");
    two.snapshot([{ id: "w1", name: "On two", gitRuntime: { isDirty: true } }]);
    const info = lookupWorkspace(feeds.state.get(), wanted, ref("two", "w1"));
    expect(info !== "loading" && info?.name).toBe("On two");
    expect(info !== "loading" && info?.dirty).toBe(true);
    const own = lookupWorkspace(feeds.state.get(), wanted, ref("one", "w1"));
    expect(own !== "loading" && own?.name).toBe("On one");
    expect(lookupWorkspace(feeds.state.get(), wanted, ref("two", "missing"))).toBeNull();
  });

  it("applies updates to the host they came from only", async () => {
    const one = fakeHost();
    const two = fakeHost();
    const feeds = createHostWorkspaces((hostId) => (hostId === "one" ? one.source : two.source));
    feeds.acquire("one");
    feeds.acquire("two");
    one.open();
    two.open();
    await flush();
    one.snapshot([{ id: "w1", name: "On one" }]);
    two.snapshot([{ id: "w1", name: "On two" }]);
    two.update({ kind: "upsert", workspace: { id: "w1", name: "Renamed on two" } });
    const wanted = ["one", "two"];
    const onTwo = lookupWorkspace(feeds.state.get(), wanted, ref("two", "w1"));
    const onOne = lookupWorkspace(feeds.state.get(), wanted, ref("one", "w1"));
    expect(onTwo !== "loading" && onTwo?.name).toBe("Renamed on two");
    expect(onOne !== "loading" && onOne?.name).toBe("On one");
  });

  it("answers null, not loading, for a host that is not wanted or whose list failed", async () => {
    const feeds = createHostWorkspaces((hostId) => {
      if (hostId === "broken") return { workspaces: { list: () => Promise.reject(new Error("offline")) } };
      throw new Error(`No host ${hostId}`);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    feeds.acquire("broken");
    feeds.acquire("unknown");
    await flush();
    expect(lookupWorkspace(feeds.state.get(), ["broken", "unknown"], ref("broken", "w1"))).toBeNull();
    expect(lookupWorkspace(feeds.state.get(), ["broken", "unknown"], ref("unknown", "w1"))).toBeNull();
    expect(lookupWorkspace(feeds.state.get(), [], ref("other", "w1"))).toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("shares one subscription per host and releases it when the last user leaves", async () => {
    const host = fakeHost();
    const connect = vi.fn(() => host.source);
    const feeds = createHostWorkspaces(connect);
    const first = feeds.acquire("one");
    const second = feeds.acquire("one");
    expect(connect).toHaveBeenCalledTimes(1);
    host.open();
    await flush();
    host.snapshot([{ id: "w1", name: "One" }]);
    first();
    expect(host.released).not.toHaveBeenCalled();
    second();
    expect(host.released).toHaveBeenCalledTimes(1);
    expect(feeds.state.get().has("one")).toBe(false);
  });

  it("releases a list that opens after its last user left", async () => {
    const host = fakeHost();
    const feeds = createHostWorkspaces(() => host.source);
    feeds.acquire("one")();
    host.open();
    await flush();
    expect(host.released).toHaveBeenCalledTimes(1);
    expect(feeds.state.get().has("one")).toBe(false);
  });
});

const info = (workspace: Record<string, unknown>) => reduceWorkspaceInfo(new Map(), { snapshot: [{ id: "w1", name: "W", ...workspace }] }).get("w1")!;

describe("bulk bar rules for workspaces whose data is not known yet", () => {
  it("counts a workspace not loaded yet, or on a host whose list failed, as at risk of losing work", () => {
    expect(atRiskOfArchive("loading")).toBe(true);
    expect(atRiskOfArchive(null)).toBe(true);
  });

  it("counts a Paseo worktree as safe to archive only when it is known clean and pushed", () => {
    expect(atRiskOfArchive(info({ gitRuntime: { isPaseoOwnedWorktree: true, isDirty: false, aheadOfOrigin: 0 } }))).toBe(false);
    expect(atRiskOfArchive(info({ gitRuntime: { isPaseoOwnedWorktree: true, isDirty: true, aheadOfOrigin: 0 } }))).toBe(true);
    expect(atRiskOfArchive(info({ gitRuntime: { isPaseoOwnedWorktree: true, isDirty: false } }))).toBe(true);
    expect(atRiskOfArchive(info({ gitRuntime: { isPaseoOwnedWorktree: false, isDirty: true } }))).toBe(false);
  });

  it("marks done only workspaces known not to need the user", () => {
    expect(markableDone("loading")).toBe(false);
    expect(markableDone(null)).toBe(false);
    expect(markableDone(info({ status: "needs_input" }))).toBe(false);
    expect(markableDone(info({ status: "failed" }))).toBe(false);
    expect(markableDone(info({ status: "running" }))).toBe(true);
  });
});

describe("per-host attention lists", () => {
  it("keeps each host's chats waiting on the user apart, by host", async () => {
    const one = fakeHost();
    const two = fakeHost();
    const feeds = createHostAttention((hostId) => {
      const host = hostId === "one" ? one : two;
      return { agents: host.source.workspaces };
    });
    feeds.acquire("one");
    feeds.acquire("two");
    one.open();
    two.open();
    await flush();
    one.snapshot([{ agent: { id: "a1", status: "running", requiresAttention: false } }]);
    two.snapshot([{ agent: { id: "a1", status: "running", requiresAttention: false, pendingPermissions: [{ id: "p1" }] } }]);
    expect(attentionOn(feeds.state.get(), "two").get("a1")?.reason).toBe("permission");
    expect(attentionOn(feeds.state.get(), "one").has("a1")).toBe(false);
    expect(attentionOn(feeds.state.get(), "three").size).toBe(0);
  });
});
