import type { PluginClientContext } from "@getpaseo/plugin/client";
import { describe, expect, it, vi } from "vitest";
import { polishPrefs } from "../../../shared/polish/prefs";
import { appendToComposer, cancelQueuedReplies, hasComposer, sendReply, shownActions, sideChatModel, startSideChat, workspaceOf } from "./actions";

type Paseo = PluginClientContext["paseo"];
type Composers = PluginClientContext["composers"];

function fakeComposer(prompt: string) {
  const composer = {
    prompt,
    setPrompt: vi.fn((text: string) => void (composer.prompt = text)),
    focus: vi.fn(async (_options?: { selection?: { start: number; end: number } }) => {}),
  };
  return composer;
}

const composersOf = (byAgent: Record<string, ReturnType<typeof fakeComposer>>): Composers =>
  ((selector: { agentId?: string }) => (selector.agentId && byAgent[selector.agentId] ? [byAgent[selector.agentId]] : [])) as unknown as Composers;

function fakeAgent(options: { status?: string; workspaceId?: string | null; entries?: Array<{ item: { type: string; text?: string } }> } = {}) {
  let finish: () => void = () => {};
  const snapshot = { status: options.status ?? "idle", workspaceId: options.workspaceId === undefined ? "w1" : options.workspaceId, provider: "claude", model: "opus", currentModeId: "plan", thinkingOptionId: "high", runtimeInfo: null };
  return {
    send: vi.fn(async (_text: string, _options?: { activeTurnBehavior?: string }) => {}),
    refresh: vi.fn(async () => ({ agent: snapshot })),
    current: vi.fn(() => null as typeof snapshot | null),
    waitForFinish: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    finish: () => finish(),
    timeline: { refetch: vi.fn(async () => ({ entries: options.entries ?? [] })) },
  };
}

function fakePaseo(agent: ReturnType<typeof fakeAgent>) {
  const create = vi.fn(async (_input: unknown) => ({ id: "child" }));
  const paseo = { agents: { ref: () => agent }, workspaces: { ref: () => ({ agents: { create } }) } } as unknown as Paseo;
  return { paseo, create };
}

describe("shownActions", () => {
  it("shows every action by default, in the bar's order", () => {
    expect(shownActions(polishPrefs(undefined))).toEqual(["quote", "reply", "side", "copy", "bookmark"]);
  });

  it("shows only the chosen actions, still in the bar's order, and none when the bar is off", () => {
    expect(shownActions({ selection: "on", selectionActions: ["bookmark", "quote"] })).toEqual(["quote", "bookmark"]);
    expect(shownActions({ selection: "off", selectionActions: ["quote"] })).toEqual([]);
  });
});

describe("appendToComposer", () => {
  it("adds the snippet as a new paragraph of that chat's message box and puts the cursor after it", async () => {
    const mine = fakeComposer("my draft");
    const other = fakeComposer("other chat");
    await appendToComposer(composersOf({ a1: mine, a2: other }), "a1", "> quote\n\n");
    expect(mine.prompt).toBe("my draft\n\n> quote\n\n");
    expect(mine.focus).toHaveBeenCalledWith({ selection: { start: mine.prompt.length, end: mine.prompt.length } });
    expect(other.setPrompt).not.toHaveBeenCalled();
  });

  it("fails with a message when the chat has no message box, and says so through hasComposer", async () => {
    const composers = composersOf({});
    expect(hasComposer(composers, "a1")).toBe(false);
    await expect(appendToComposer(composers, "a1", "x")).rejects.toThrow("message box");
  });
});

describe("sendReply", () => {
  it("steers or interrupts a running turn as Default send says", async () => {
    const agent = fakeAgent({ status: "running" });
    const { paseo } = fakePaseo(agent);
    expect(await sendReply(paseo, "a1", "hi", "steer")).toBe("sent");
    expect(agent.send).toHaveBeenLastCalledWith("hi", { activeTurnBehavior: "steer" });
    await sendReply(paseo, "a1", "hi", "interrupt");
    expect(agent.send).toHaveBeenLastCalledWith("hi", { activeTurnBehavior: "interrupt" });
  });

  it("holds a queued reply until the running turn ends", async () => {
    const agent = fakeAgent({ status: "running" });
    const { paseo } = fakePaseo(agent);
    expect(await sendReply(paseo, "a1", "later", "queue")).toBe("queued");
    expect(agent.send).not.toHaveBeenCalled();
    agent.finish();
    await vi.waitFor(() => expect(agent.send).toHaveBeenCalledWith("later", { activeTurnBehavior: "interrupt" }));
  });

  it("drops a queued reply cancelled before the turn ends (the plugin unloaded)", async () => {
    const agent = fakeAgent({ status: "running" });
    expect(await sendReply(fakePaseo(agent).paseo, "a1", "later", "queue")).toBe("queued");
    cancelQueuedReplies();
    agent.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(agent.send).not.toHaveBeenCalled();
  });

  it("sends a queued reply at once when the agent is idle", async () => {
    const agent = fakeAgent({ status: "idle" });
    expect(await sendReply(fakePaseo(agent).paseo, "a1", "now", "queue")).toBe("sent");
    expect(agent.send).toHaveBeenCalledWith("now", { activeTurnBehavior: "interrupt" });
  });
});

describe("startSideChat", () => {
  it("starts a child of the chat with its provider, model, mode and thinking, and the quote and question as the first message", async () => {
    const agent = fakeAgent({ entries: [{ item: { type: "user_message", text: "q1" } }, { item: { type: "assistant_message", text: "a1" } }, { item: { type: "tool_call" } }, { item: { type: "assistant_message", text: "a2" } }] });
    const { paseo, create } = fakePaseo(agent);
    const side = await startSideChat(paseo, { agentId: "main", quote: "> passage", question: " why? " });
    expect(side).toEqual({ agentId: "child", workspaceId: "w1" });
    const input = create.mock.calls[0]![0] as { config: Record<string, string>; parent: string; title: string; prompt: string };
    expect(input).toMatchObject({ parent: "main", title: "Side chat: why?", prompt: "> passage\n\nwhy?", config: { provider: "claude/opus", modeId: "plan", thinkingOptionId: "high" } });
    // Text split by a tool call is one assistant turn.
    expect(input.config.systemPrompt).toContain("<assistant>\na1\n\na2\n</assistant>");
  });

  it("starts on the chosen model with the chat's provider, at that model's own thinking level", async () => {
    const { paseo, create } = fakePaseo(fakeAgent());
    await startSideChat(paseo, { agentId: "main", quote: "q", question: "x", model: "sonnet" });
    const input = create.mock.calls[0]![0] as { config: Record<string, string | undefined> };
    expect(input.config).toMatchObject({ provider: "claude/sonnet", modeId: "plan" });
    expect(input.config.thinkingOptionId).toBeUndefined();
  });

  it("refuses a chat with no workspace", async () => {
    await expect(startSideChat(fakePaseo(fakeAgent({ workspaceId: null })).paseo, { agentId: "main", quote: "q", question: "x" })).rejects.toThrow("no workspace");
  });
});

describe("workspaceOf", () => {
  it("reads the chat's workspace from Paseo, null when it has none", async () => {
    expect(await workspaceOf(fakePaseo(fakeAgent({ workspaceId: "w9" })).paseo, "a1")).toBe("w9");
    expect(await workspaceOf(fakePaseo(fakeAgent({ workspaceId: null })).paseo, "a1")).toBeNull();
  });
});

describe("sideChatModel", () => {
  it("keeps the chat's model unless another is chosen, and never drops the provider", () => {
    expect(sideChatModel("claude", "opus", "")).toEqual({ provider: "claude/opus", ownModel: true });
    expect(sideChatModel("claude", "opus", "sonnet")).toEqual({ provider: "claude/sonnet", ownModel: false });
    expect(sideChatModel("claude", "opus", "opus")).toEqual({ provider: "claude/opus", ownModel: true });
    expect(sideChatModel("codex", null, "")).toEqual({ provider: "codex", ownModel: true });
    expect(sideChatModel("codex", null, "gpt-5")).toEqual({ provider: "codex/gpt-5", ownModel: false });
  });
});
