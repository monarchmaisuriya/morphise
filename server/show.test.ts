import type { PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { describe, expect, it, vi } from "vitest";
import type { ShowInput, ShowRequest } from "../shared/show";
import { createRateLimit, createShowHook, createShowTool, createShowWindows, readShowSetting } from "./show";

const chat: ShowInput = { action: "chat", agentId: "a2" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function windowsWithClock(options: { timeoutMs?: number } = {}) {
  let time = 1_000;
  let next = 0;
  const windows = createShowWindows({ now: () => time, newId: () => `r${++next}`, ...options });
  return { windows, advance: (ms: number) => (time += ms) };
}

// A window that records what it was asked and can answer.
function openWindow(windows: ReturnType<typeof createShowWindows>, windowId: string) {
  const asked: ShowRequest[] = [];
  const controller = new AbortController();
  const served = windows.serve(windowId, async (request) => void asked.push(request), controller.signal);
  return { asked, close: () => controller.abort(), served };
}

describe("choosing the window", () => {
  it("asks the window M used last, and only that one", async () => {
    const { windows, advance } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const phone = openWindow(windows, "phone");
    windows.used("desk", true);
    advance(10);
    windows.used("phone", true);
    advance(10);
    windows.used("desk", true);
    const answer = windows.request("a1", chat);
    await flush();
    expect(desk.asked).toHaveLength(1);
    expect(phone.asked).toHaveLength(0);
    windows.answer(desk.asked[0]!.requestId, true, "Opened the chat");
    await expect(answer).resolves.toEqual({ ok: true, message: "Opened the chat" });
  });

  it("skips a window M left for one still in front", async () => {
    const { windows, advance } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const phone = openWindow(windows, "phone");
    windows.used("desk", true);
    advance(10);
    windows.used("phone", true);
    advance(10);
    windows.used("phone", false);
    void windows.request("a1", chat);
    await flush();
    expect(desk.asked).toHaveLength(1);
    expect(phone.asked).toHaveLength(0);
  });

  it("falls back to the window used last when every window was left, then to the newest one", async () => {
    const { windows, advance } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    windows.used("desk", true);
    advance(10);
    windows.used("desk", false);
    advance(10);
    const phone = openWindow(windows, "phone");
    void windows.request("a1", chat);
    await flush();
    expect(desk.asked).toHaveLength(1);
    // A window that only ever reported leaving was never used, so it ranks like an unused one.
    const hidden = windowsWithClock();
    const shown = openWindow(hidden.windows, "shown");
    hidden.windows.used("shown", true);
    hidden.advance(10);
    hidden.windows.used("shown", false);
    hidden.advance(10);
    const background = openWindow(hidden.windows, "background");
    hidden.windows.used("background", false);
    void hidden.windows.request("a1", chat);
    await flush();
    expect([shown.asked.length, background.asked.length]).toEqual([1, 0]);
    const fresh = windowsWithClock();
    const first = openWindow(fresh.windows, "w1");
    fresh.advance(10);
    const second = openWindow(fresh.windows, "w2");
    void fresh.windows.request("a1", chat);
    await flush();
    expect([first.asked.length, second.asked.length, phone.asked.length]).toEqual([0, 1, 0]);
  });

  it("keeps a reopened window when the old subscription's close arrives late", async () => {
    const { windows } = windowsWithClock();
    const old = openWindow(windows, "desk");
    const reopened = openWindow(windows, "desk");
    old.close();
    await old.served;
    void windows.request("a1", chat);
    await flush();
    expect(reopened.asked).toHaveLength(1);
  });

  it("answers at once when no window is open", async () => {
    const { windows } = windowsWithClock();
    await expect(windows.request("a1", chat)).resolves.toEqual({ ok: false, message: "No Paseo window is open, so nothing could be shown." });
  });
});

describe("waiting for the answer", () => {
  it("says so at once when the window closes during the wait", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const answer = windows.request("a1", chat);
    await flush();
    desk.close();
    await expect(answer).resolves.toEqual({ ok: false, message: "The Paseo window closed before it answered." });
  });

  it("gives up after the timeout, warns the item may still open, and ignores a late answer", async () => {
    vi.useFakeTimers();
    try {
      const { windows } = windowsWithClock();
      const desk = openWindow(windows, "desk");
      const answer = windows.request("a1", chat);
      let settled = false;
      void answer.then(() => (settled = true));
      // Still waiting past Paseo's own 15 s wait for a chat to come on screen.
      await vi.advanceTimersByTimeAsync(19_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(answer).resolves.toEqual({ ok: false, message: "The Paseo window did not answer within 20 s; it may still open. Do not ask again at once." });
      expect(() => windows.answer(desk.asked[0]!.requestId, true, "Opened the chat")).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops waiting when the tool call is cancelled", async () => {
    const { windows } = windowsWithClock();
    openWindow(windows, "desk");
    const cancel = new AbortController();
    const answer = windows.request("a1", chat, cancel.signal);
    await flush();
    cancel.abort();
    await expect(answer).resolves.toEqual({ ok: false, message: "Cancelled." });
  });

  it("answers every waiting call when Morphise stops", async () => {
    const { windows } = windowsWithClock();
    openWindow(windows, "desk");
    const answer = windows.request("a1", chat);
    await flush();
    windows.stop();
    await expect(answer).resolves.toEqual({ ok: false, message: "Morphise stopped before the window answered." });
  });
});

describe("limits per agent", () => {
  it("refuses a second call from the same agent while one is waiting, but not from another agent", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    void windows.request("a1", chat);
    await flush();
    await expect(windows.request("a1", chat)).resolves.toEqual({ ok: false, message: "A request from this agent is still waiting; try again when it answers." });
    void windows.request("a3", chat);
    await flush();
    expect(desk.asked).toHaveLength(2);
  });
});

const topLevel = { id: "a1", parentAgentId: null } as never;

function toolWith(options: { enabled?: boolean | Error; windows?: ReturnType<typeof createShowWindows>; rate?: ReturnType<typeof createRateLimit> } = {}) {
  const log = vi.fn();
  const windows = options.windows ?? windowsWithClock().windows;
  const enabled = async () => {
    if (options.enabled instanceof Error) throw options.enabled;
    return options.enabled ?? true;
  };
  return { tool: createShowTool({ windows, enabled, log, rate: options.rate }), log };
}

const run = (tool: ReturnType<typeof createShowTool>, input: unknown, agent: unknown = topLevel, paseo: unknown = {}) =>
  Promise.resolve(tool.execute(input, { agent, paseo, signal: new AbortController().signal } as never));

describe("the show_in_paseo tool", () => {
  it("refuses when M turned it off, even in a chat that still has it", async () => {
    const { tool } = toolWith({ enabled: false });
    await expect(run(tool, chat)).resolves.toEqual({ text: "Show in Paseo is turned off in Morphise's settings.", isError: true });
  });

  it("refuses sub-agents and background helpers", async () => {
    const { tool } = toolWith();
    await expect(run(tool, chat, { id: "a5", parentAgentId: "a1" })).resolves.toEqual({ text: "Only the user's own chats can show things in Paseo, not sub-agents or background helpers.", isError: true });
    await expect(run(tool, chat, { id: "a6", parentAgentId: null, background: true })).resolves.toEqual({ text: "Only the user's own chats can show things in Paseo, not sub-agents or background helpers.", isError: true });
  });

  it("pins and unpins on the daemon without a window", async () => {
    const setPinned = vi.fn(async () => ({}));
    const paseo = { workspaces: { ref: vi.fn(() => ({ setPinned })) } };
    const { tool, log } = toolWith();
    await expect(run(tool, { action: "pin", workspaceId: "w1", pinned: true }, topLevel, paseo)).resolves.toEqual({ text: "Pinned the workspace." });
    await expect(run(tool, { action: "pin", workspaceId: "w1", pinned: false }, topLevel, paseo)).resolves.toEqual({ text: "Unpinned the workspace." });
    expect(paseo.workspaces.ref).toHaveBeenCalledWith("w1");
    expect(setPinned.mock.calls).toEqual([[true], [false]]);
    expect(log).toHaveBeenCalledWith("[morphise] show_in_paseo a1 pin w1: Pinned the workspace.");
  });

  it("passes other actions to the window and returns its answer", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const { tool, log } = toolWith({ windows });
    const result = run(tool, chat);
    await flush();
    windows.answer(desk.asked[0]!.requestId, true, "Opened the chat.");
    await expect(result).resolves.toEqual({ text: "Opened the chat." });
    expect(log).toHaveBeenCalledWith("[morphise] show_in_paseo a1 chat a2: Opened the chat.");
  });

  it("refuses, and logs why, when the setting cannot be read", async () => {
    const { tool, log } = toolWith({ enabled: new Error("daemon store unavailable") });
    await expect(run(tool, chat)).resolves.toEqual({ text: "Show in Paseo is turned off in Morphise's settings.", isError: true });
    expect(log).toHaveBeenCalledWith("[morphise] show_in_paseo setting unreadable, treated as off: daemon store unavailable");
  });

  it("logs refusals too", async () => {
    const { tool, log } = toolWith({ enabled: false });
    await run(tool, chat);
    expect(log).toHaveBeenCalledWith("[morphise] show_in_paseo a1 chat a2: Show in Paseo is turned off in Morphise's settings.");
  });

  it("allows at most 10 calls per agent per minute, pins included", async () => {
    let time = 0;
    const rate = createRateLimit({ perMinute: 10, now: () => time });
    const paseo = { workspaces: { ref: () => ({ setPinned: async () => ({}) }) } };
    const { tool } = toolWith({ rate });
    const pin = { action: "pin", workspaceId: "w1", pinned: true };
    for (let i = 0; i < 10; i++) await expect(run(tool, pin, topLevel, paseo)).resolves.toEqual({ text: "Pinned the workspace." });
    await expect(run(tool, pin, topLevel, paseo)).resolves.toEqual({ text: "Too many requests from this agent; at most 10 a minute.", isError: true });
    await expect(run(tool, pin, { id: "a7", parentAgentId: null }, paseo)).resolves.toEqual({ text: "Pinned the workspace." });
    time += 60_001;
    await expect(run(tool, pin, topLevel, paseo)).resolves.toEqual({ text: "Pinned the workspace." });
  });

  it("reports a failed pin instead of throwing", async () => {
    const paseo = { workspaces: { ref: () => ({ setPinned: async () => Promise.reject(new Error("Unknown workspace w9")) }) } };
    const { tool } = toolWith();
    await expect(run(tool, { action: "pin", workspaceId: "w9", pinned: true }, topLevel, paseo)).resolves.toEqual({ text: "Could not pin: Unknown workspace w9", isError: true });
  });
});

describe("attaching the tool", () => {
  const request: PluginSessionOpenRequest = {
    agentId: "a1", workspaceId: null, provider: "actual-alias", cwd: "/w", reason: "create", purpose: "interactive", title: null,
    tools: [], metadata: {}, labels: {}, background: false, env: {}, mcpServers: {}, baseConfig: { provider: "actual-alias", cwd: "/w" },
    openSupport: {
      adapter: { kind: "acp" }, instructions: "unsupported", mcpHttp: "unsupported", exactMcpPreapproval: "unsupported",
      attachedTools: { delivery: "native", enabled: true, disabledTools: [] },
      restrictions: { mcpConfiguration: "none", processEnvironment: "none" }, providerOptions: [],
    },
  };

  it("adds the tool to a session while the setting is on", async () => {
    const { tool } = toolWith();
    const hook = createShowHook({ enabled: async () => true, tool });
    const opened = await hook({ request } as never);
    expect(opened?.tools).toEqual([tool]);
  });

  it("leaves the session alone when off, when the setting cannot be read, and for Morphise's title helper", async () => {
    const { tool } = toolWith();
    expect(await createShowHook({ enabled: async () => false, tool })({ request } as never)).toBeUndefined();
    const unreadable = createShowHook({ enabled: async () => Promise.reject(new Error("bad document")), tool });
    expect(await unreadable({ request } as never)).toBeUndefined();
    const helper = { ...request, metadata: { "morphise.titleHelper": true } };
    expect(await createShowHook({ enabled: async () => true, tool })({ request: helper } as never)).toBeUndefined();
  });

  it("does not give the tool to sub-agents or background helpers", async () => {
    const { tool } = toolWith();
    const hook = createShowHook({ enabled: async () => true, tool });
    expect(await hook({ request: { ...request, labels: { "paseo.parent-agent-id": "a0" } } } as never)).toBeUndefined();
    expect(await hook({ request: { ...request, labels: {}, background: true } } as never)).toBeUndefined();
    expect((await hook({ request: { ...request, labels: {}, background: false } } as never))?.tools).toEqual([tool]);
  });

  it("retains native Show without external HTTP or exact approvals and does not change the alias", async () => {
    const { tool } = toolWith();
    const opened = await createShowHook({ enabled: async () => true, tool })({ request });
    expect(opened?.tools).toEqual([tool]);
    expect(opened?.provider).toBe("actual-alias");
    expect(opened?.toolPolicy).toBeUndefined();
  });

  it.each(["none", "unknown"] as const)("omits only Show when attached delivery is %s", async (delivery) => {
    const { tool } = toolWith();
    const input = { ...request, openSupport: { ...request.openSupport!, attachedTools: { delivery, enabled: true, disabledTools: [] } } };
    expect(await createShowHook({ enabled: async () => true, tool })({ request: input })).toBeUndefined();
  });

  it("respects explicit host and per-tool disable and restores only on an eligible open", async () => {
    const { tool } = toolWith();
    const hook = createShowHook({ enabled: async () => true, tool });
    expect(await hook({ request: { ...request, openSupport: { ...request.openSupport!, attachedTools: { delivery: "native", enabled: false, disabledTools: [] } } } })).toBeUndefined();
    expect(await hook({ request: { ...request, openSupport: { ...request.openSupport!, attachedTools: { delivery: "native", enabled: true, disabledTools: ["show_in_paseo"] } } } })).toBeUndefined();
    expect((await hook({ request }))?.tools).toEqual([tool]);
    expect(request.tools).toEqual([]);
  });

  it("accepts host-attached MCP delivery without requiring Morphise's external HTTP feature", async () => {
    const { tool } = toolWith();
    const opened = await createShowHook({ enabled: async () => true, tool })({ request: { ...request, openSupport: { ...request.openSupport!, attachedTools: { delivery: "mcp", enabled: true, disabledTools: [] } } } });
    expect(opened?.tools).toEqual([tool]);
  });

  it("never attaches in history or to an internal agent", async () => {
    const { tool } = toolWith();
    const hook = createShowHook({ enabled: async () => true, tool });
    expect(await hook({ request: { ...request, purpose: "history" } })).toBeUndefined();
    expect(await hook({ request: { ...request, baseConfig: { provider: "actual-alias", cwd: "/w", internal: true } } })).toBeUndefined();
  });
});

describe("reading the setting", () => {
  it("is on when missing, off when turned off, and off with a log line when the document is invalid", async () => {
    const log = vi.fn();
    expect(await readShowSetting(async () => ({ status: "ready", values: {} }), log)()).toBe(true);
    expect(await readShowSetting(async () => ({ status: "ready", values: { enabled: false } }), log)()).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(await readShowSetting(async () => ({ status: "invalid", error: "enabled: expected boolean" }), log)()).toBe(false);
    expect(log).toHaveBeenCalledWith("[morphise] show_in_paseo setting is invalid, treated as off (reset it in Settings, Chat): enabled: expected boolean");
  });
});

describe("leaving the id out to mean the caller's own", () => {
  const caller = { id: "a1", parentAgentId: null, workspaceId: "w7" } as never;
  const pinning = () => {
    const setPinned = vi.fn(async () => ({}));
    return { paseo: { workspaces: { ref: vi.fn(() => ({ setPinned })) } }, setPinned };
  };

  it("opens the caller's own chat and says which one", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const { tool, log } = toolWith({ windows });
    const result = run(tool, { action: "chat" }, caller);
    await flush();
    expect(desk.asked[0]!.input).toEqual({ action: "chat", agentId: "a1" });
    windows.answer(desk.asked[0]!.requestId, true, "Opened the chat.");
    await expect(result).resolves.toEqual({ text: "Opened the chat. (your own chat: a1)" });
    expect(log).toHaveBeenCalledWith("[morphise] show_in_paseo a1 chat a1: Opened the chat. (your own chat: a1)");
  });

  it("drafts into the caller's own chat", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const { tool } = toolWith({ windows });
    void run(tool, { action: "draft", text: "Commit message: fix the chime." }, caller);
    await flush();
    expect(desk.asked[0]!.input).toEqual({ action: "draft", agentId: "a1", text: "Commit message: fix the chime." });
  });

  it("opens and pins the caller's workspace", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const { tool } = toolWith({ windows });
    void run(tool, { action: "workspace" }, caller);
    await flush();
    expect(desk.asked[0]!.input).toEqual({ action: "workspace", workspaceId: "w7" });
    const { paseo, setPinned } = pinning();
    await expect(run(toolWith().tool, { action: "pin", pinned: true }, caller, paseo)).resolves.toEqual({ text: "Pinned the workspace. (your workspace: w7)" });
    expect(paseo.workspaces.ref).toHaveBeenCalledWith("w7");
    expect(setPinned).toHaveBeenCalledWith(true);
  });

  it("refuses when the caller has no workspace, and pins nothing", async () => {
    const { paseo, setPinned } = pinning();
    const noWorkspace = { id: "a1", parentAgentId: null, workspaceId: null } as never;
    await expect(run(toolWith().tool, { action: "pin", pinned: true }, noWorkspace, paseo)).resolves.toEqual({ text: "This chat has no workspace; give a workspaceId.", isError: true });
    expect(setPinned).not.toHaveBeenCalled();
  });

  it("refuses a sub-agent before filling anything", async () => {
    const { windows } = windowsWithClock();
    const desk = openWindow(windows, "desk");
    const { tool } = toolWith({ windows });
    const refused = { text: "Only the user's own chats can show things in Paseo, not sub-agents or background helpers.", isError: true };
    await expect(run(tool, { action: "chat" }, { id: "a5", parentAgentId: "a1", workspaceId: "w7" })).resolves.toEqual(refused);
    // With no workspace, filling first would answer "no workspace" instead of refusing the sub-agent.
    await expect(run(tool, { action: "pin", pinned: true }, { id: "a5", parentAgentId: "a1", workspaceId: null })).resolves.toEqual(refused);
    await expect(run(tool, { action: "pin", pinned: true }, { id: "a6", parentAgentId: null, background: true, workspaceId: null })).resolves.toEqual(refused);
    expect(desk.asked).toHaveLength(0);
  });

  it("leaves explicit ids alone, with no suffix", async () => {
    const { paseo } = pinning();
    await expect(run(toolWith().tool, { action: "pin", workspaceId: "w2", pinned: true }, caller, paseo)).resolves.toEqual({ text: "Pinned the workspace." });
    expect(paseo.workspaces.ref).toHaveBeenCalledWith("w2");
  });

  it("names the filled id even when the action fails", async () => {
    await expect(run(toolWith().tool, { action: "workspace" }, caller)).resolves.toEqual({
      text: "No Paseo window is open, so nothing could be shown. (your workspace: w7)",
      isError: true,
    });
  });
});
