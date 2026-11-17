import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationSearch } from "../../shared/conversation-search";
import { statsRead, statsSettings } from "../../shared/stats";
import { createStatsHandlers, registerStats, type StatsAgent, type StatsPaseo } from "./register";
import { SessionReader } from "./sessions";

const FIXTURES = join(__dirname, "fixtures");
const CODEX_ID = "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000";

// Paseo whose agent handle offers only `refresh()`: `reload()` and any timeline call resume the
// agent, so touching them fails the test.
function fakePaseo(agent: Partial<StatsAgent> | null) {
  const refresh = vi.fn(async () => (agent ? { agent: { provider: "claude", cwd: "/repo/app", persistence: null, ...agent } } : null));
  const handle = new Proxy(
    { refresh },
    {
      get(target, key) {
        if (key === "reload" || key === "timeline") throw new Error(`The handler touched ${String(key)}`);
        return target[key as keyof typeof target];
      },
    },
  );
  const paseo: StatsPaseo = { agents: { ref: vi.fn(() => handle) } };
  return { paseo, refresh };
}

const handlers = () => createStatsHandlers(new SessionReader({ claude: join(FIXTURES, "claude"), codex: join(FIXTURES, "codex") }));

afterEach(() => vi.restoreAllMocks());

describe("stats read", () => {
  it("counts a Claude chat's log through refresh() only, and logs the agent it read", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { paseo, refresh } = fakePaseo({ persistence: { sessionId: "claude-session-1" } });
    const result = await handlers().read({ agentId: "a1" }, paseo);
    expect(result).toMatchObject({ status: "ready", provider: "claude", partial: false, stats: { steps: 2, turns: 1, outputTokens: 40 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[morphise] stats a1");
  });

  it("prefers the native handle, then the persisted session id, then the runtime's", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const codex = { provider: "codex", cwd: "/repo/app" };
    for (const agent of [
      { ...codex, persistence: { sessionId: "other", nativeHandle: CODEX_ID } },
      { ...codex, persistence: { sessionId: CODEX_ID } },
      { ...codex, persistence: null, runtimeInfo: { sessionId: CODEX_ID } },
    ]) {
      expect(await handlers().read({ agentId: "a1" }, fakePaseo(agent).paseo)).toMatchObject({ status: "ready", provider: "codex", stats: { steps: 1, inputTokens: 100, cachedTokens: 40 } });
    }
  });

  it("says why there is nothing to read: no agent, no session yet, another provider, no log", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await handlers().read({ agentId: "a1" }, fakePaseo(null).paseo)).toMatchObject({ status: "unavailable" });
    expect(await handlers().read({ agentId: "a1" }, fakePaseo({}).paseo)).toEqual({ status: "unavailable", reason: "The chat has no session yet" });
    expect(await handlers().read({ agentId: "a1" }, fakePaseo({ provider: "opencode", runtimeInfo: { sessionId: "s1" } }).paseo)).toMatchObject({ status: "unavailable" });
    expect(await handlers().read({ agentId: "a1" }, fakePaseo({ runtimeInfo: { sessionId: "missing" } }).paseo)).toEqual({ status: "unavailable", reason: "No session log yet" });
  });

  it("answers an error, without reading, for a session id that could name another file or a bad agent id", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await handlers().read({ agentId: "a1" }, fakePaseo({ runtimeInfo: { sessionId: "../../etc/passwd" } }).paseo)).toEqual({ status: "error", error: "Not a session id" });
    const { paseo, refresh } = fakePaseo({});
    expect(await handlers().read({ agentId: "-rf" }, paseo)).toEqual({ status: "error", error: "Not an agent id" });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("conversation search", () => {
  it("searches a chat's log through refresh() only, and logs the agent it searched", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { paseo, refresh } = fakePaseo({ provider: "codex", persistence: { sessionId: CODEX_ID } });
    expect(await handlers().search({ agentId: "a2", query: "tokenizer" }, paseo)).toEqual({ match: "Looking at the tokenizer escapes", nextCursor: null, unavailable: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[morphise] search a2");
  });

  it("marks a chat whose conversation cannot be searched", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await handlers().search({ agentId: "a2", query: "x" }, fakePaseo({ provider: "opencode", runtimeInfo: { sessionId: "s1" } }).paseo)).toEqual({
      match: null,
      nextCursor: null,
      unavailable: "No log Morphise can read for opencode chats",
    });
  });

  it("refuses a bad agent id or session id", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(handlers().search({ agentId: "a b", query: "x" }, fakePaseo({}).paseo)).rejects.toThrow("Not an agent id");
    await expect(handlers().search({ agentId: "a2", query: "x" }, fakePaseo({ runtimeInfo: { sessionId: "../x" } }).paseo)).rejects.toThrow("Not a session id");
  });
});

describe("registerStats", () => {
  it("registers the stats document, its watch and both RPCs, and clears the reader on cleanup", () => {
    const handle = vi.fn();
    const registerSettings = vi.fn();
    const cleanup = registerStats({ handle, registerSettings } as unknown as PluginServerContext);
    expect(registerSettings).toHaveBeenCalledWith(statsSettings);
    expect(handle.mock.calls.map(([contract]) => contract.name)).toEqual(["stats.watch", statsRead.name, conversationSearch.name]);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });
});
