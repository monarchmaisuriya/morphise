import type { PluginClientContext } from "@getpaseo/plugin/client";
import { describe, expect, it } from "vitest";
import { type ListState, watchAgentEntries } from "./data";

const agent = (id: string) => ({ agent: { id } });
const page = (ids: string[], nextCursor: string | null = null) => ({ entries: ids.map(agent), pageInfo: { hasMore: nextCursor !== null, nextCursor } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// A host whose live list is driven by the test; each older page waits until the test hands it over.
function fakeHost() {
  const live: { snapshot?(snapshot: unknown): void; update?(update: unknown): void } = {};
  const older = new Map<string, (result: unknown) => void>();
  const list = (input: { subscribe?: unknown; page: { cursor?: string } }) => {
    if (input.subscribe) return Promise.resolve({ subscription: { subscribe: (handlers: typeof live) => (Object.assign(live, handlers), () => {}), release: async () => {} } });
    return new Promise((resolve) => older.set(input.page.cursor!, resolve));
  };
  const reports: ListState[] = [];
  const release = watchAgentEntries({ paseo: { agents: { list } } } as unknown as PluginClientContext, (state) => reports.push(state));
  const shown = () => {
    const last = reports.at(-1);
    return last?.status === "ready" ? [...last.entries.keys()].sort() : last;
  };
  return { live, older, shown, release };
}

describe("watchAgentEntries", () => {
  it("drops the older pages of a snapshot a newer one replaced", async () => {
    const host = fakeHost();
    await flush();
    host.live.snapshot!(page(["a"], "c1"));
    await flush();
    // Reconnected: a was removed meanwhile, and the new first page is the whole list.
    host.live.snapshot!(page(["b"]));
    host.older.get("c1")!(page(["a", "old"]));
    await flush();
    expect(host.shown()).toEqual(["b"]);
    host.release();
  });

  it("does not bring back an agent removed while its older page was being read", async () => {
    const host = fakeHost();
    await flush();
    host.live.snapshot!(page(["a"], "c1"));
    await flush();
    host.live.update!({ type: "agent_update", payload: { kind: "remove", agentId: "x" } });
    host.older.get("c1")!(page(["x", "y"]));
    await flush();
    expect(host.shown()).toEqual(["a", "y"]);
    host.release();
  });
});
