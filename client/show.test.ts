import { describe, expect, it, vi } from "vitest";
import { showResult, showUsed } from "../shared/show";
import { createTypingCheck, createUseReporter, registerShowNavigator, runShow, startShow, type ShowDeps, type ShowNavigator } from "./show";

const web = vi.hoisted(() => ({ typed: () => {} }));
vi.mock("./web", () => ({
  windowInFront: () => true,
  watchWindowUse: (_report: unknown, typed: () => void) => ((web.typed = typed), () => {}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Keyboard: { isVisible: () => false }, AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } }));

function composer(prompt = "") {
  return { prompt, insertText: vi.fn(), focus: vi.fn(async () => {}) };
}

function deps(overrides: Partial<ShowDeps> = {}): ShowDeps {
  return { composers: () => [], openScreen: vi.fn(), navigator: () => null, typing: () => false, ...overrides };
}

describe("running a request in this window", () => {
  it("opens a chat", async () => {
    const box = composer();
    await expect(runShow({ action: "chat", agentId: "a1" }, deps({ composers: () => [box] }))).resolves.toEqual({ ok: true, message: "Opened the chat." });
    expect(box.focus).toHaveBeenCalled();
  });

  it("says so when the chat is unknown or cannot be reached", async () => {
    await expect(runShow({ action: "chat", agentId: "a9" }, deps())).resolves.toEqual({ ok: false, message: "No open chat for agent a9 here (it may be archived or on another host)." });
    const stuck = { ...composer(), focus: vi.fn(async () => Promise.reject(new Error("timed out"))) };
    await expect(runShow({ action: "chat", agentId: "a1" }, deps({ composers: () => [stuck] }))).resolves.toEqual({ ok: false, message: "Could not open the chat: timed out" });
  });

  it("puts a draft in an empty box without sending it, and opens the chat", async () => {
    const box = composer("  ");
    await expect(runShow({ action: "draft", agentId: "a1", text: "Please review." }, deps({ composers: () => [box] }))).resolves.toEqual({ ok: true, message: "Put the text in the chat's message box; it was not sent." });
    expect(box.insertText).toHaveBeenCalledWith("Please review.");
    expect(box.focus).toHaveBeenCalled();
  });

  it("writes a draft only after the chat is on screen, and not when that fails", async () => {
    const box = { ...composer(), focus: vi.fn(async () => Promise.reject(new Error("The composer did not come on screen."))) };
    await expect(runShow({ action: "draft", agentId: "a1", text: "Please review." }, deps({ composers: () => [box] }))).resolves.toEqual({ ok: false, message: "Could not open the chat: The composer did not come on screen." });
    expect(box.insertText).not.toHaveBeenCalled();
  });

  it("does not place a draft when M started typing while the chat opened", async () => {
    const box = composer();
    let typingNow = false;
    box.focus.mockImplementation(async () => void (typingNow = true));
    await expect(runShow({ action: "draft", agentId: "a1", text: "Please review." }, deps({ composers: () => [box], typing: () => typingNow }))).resolves.toEqual({
      ok: false,
      message: "Opened the chat, but the user is typing in Paseo right now, so nothing was changed; try again in a few seconds.",
    });
    expect(box.insertText).not.toHaveBeenCalled();
  });

  it("checks the box again once it is on screen", async () => {
    const before = composer();
    const shown = composer("typed meanwhile");
    let reads = 0;
    const result = runShow({ action: "draft", agentId: "a1", text: "Please review." }, deps({ composers: () => [reads++ === 0 ? before : shown] }));
    await expect(result).resolves.toEqual({ ok: false, message: "Opened the chat, but its message box now has text; the draft was not added." });
    expect([before.insertText, shown.insertText].map((fn) => fn.mock.calls.length)).toEqual([0, 0]);
  });

  it("never replaces text M already typed", async () => {
    const box = composer("half a thought");
    await expect(runShow({ action: "draft", agentId: "a1", text: "Please review." }, deps({ composers: () => [box] }))).resolves.toEqual({ ok: false, message: "That chat's message box already has text; nothing was changed." });
    expect(box.insertText).not.toHaveBeenCalled();
  });

  it("opens Morphise screens, with the Workbench view when given", async () => {
    const openScreen = vi.fn();
    await expect(runShow({ action: "screen", screen: "workbench", view: "board" }, deps({ openScreen }))).resolves.toEqual({ ok: true, message: "Opened the Workbench (board)." });
    await expect(runShow({ action: "screen", screen: "dispatch" }, deps({ openScreen }))).resolves.toEqual({ ok: true, message: "Opened Dispatch." });
    expect(openScreen.mock.calls).toEqual([
      ["workbench", { view: "board" }],
      ["dispatch", undefined],
    ]);
  });

  it("opens terminals and workspaces through the sidebar helper, and explains how when it is missing", async () => {
    const navigator = { openTerminal: vi.fn((id: string) => id === "t1"), openWorkspace: vi.fn((id: string) => id === "w1") };
    const withSidebar = deps({ navigator: () => navigator });
    await expect(runShow({ action: "terminal", terminalId: "t1" }, withSidebar)).resolves.toEqual({ ok: true, message: "Opened the terminal." });
    await expect(runShow({ action: "terminal", terminalId: "t9" }, withSidebar)).resolves.toEqual({ ok: false, message: "Terminal t9 was not found in this window." });
    await expect(runShow({ action: "workspace", workspaceId: "w1" }, withSidebar)).resolves.toEqual({ ok: true, message: "Opened the workspace." });
    await expect(runShow({ action: "workspace", workspaceId: "w9" }, withSidebar)).resolves.toEqual({ ok: false, message: "Workspace w9 was not found in this window." });
    const needs = "Turn on Morphise's sidebar view (Settings, Morphise, Sidebar) and select it in Paseo (Settings, Sidebar) so agents can open terminals and workspaces.";
    await expect(runShow({ action: "terminal", terminalId: "t1" }, deps())).resolves.toEqual({ ok: false, message: needs });
  });

  it("changes nothing while M is typing in this window", async () => {
    const box = composer();
    const openScreen = vi.fn();
    const typing = deps({ composers: () => [box], openScreen, typing: () => true });
    const answer = { ok: false, message: "The user is typing in Paseo right now, so nothing was changed; try again in a few seconds." };
    await expect(runShow({ action: "draft", agentId: "a1", text: "Please review." }, typing)).resolves.toEqual(answer);
    await expect(runShow({ action: "screen", screen: "dispatch" }, typing)).resolves.toEqual(answer);
    expect([box.insertText, box.focus, openScreen].map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it("answers with Paseo's error instead of leaving the agent waiting", async () => {
    const openScreen = vi.fn(() => {
      throw new Error("Plugin screen is unavailable");
    });
    await expect(runShow({ action: "screen", screen: "workbench" }, deps({ openScreen }))).resolves.toEqual({ ok: false, message: "Paseo could not do that: Plugin screen is unavailable" });
  });

  it("does not pin here: pinning runs on the daemon", async () => {
    await expect(runShow({ action: "pin", workspaceId: "w1", pinned: true }, deps())).resolves.toEqual({ ok: false, message: "Pinning runs on the daemon, not in a window." });
  });
});

describe("the sidebar helper registry", () => {
  it("keeps the newest helper and forgets it when it unmounts", () => {
    const first = { openTerminal: () => true, openWorkspace: () => true };
    const second = { openTerminal: () => false, openWorkspace: () => false };
    let current: ShowNavigator | null = null;
    const read = () => current;
    const dropFirst = registerShowNavigator(first, (next) => (current = next), read);
    const dropSecond = registerShowNavigator(second, (next) => (current = next), read);
    dropFirst();
    expect(current).toBe(second);
    dropSecond();
    expect(current).toBeNull();
  });
});

describe("reporting that M uses this window", () => {
  it("sends every change at once, and repeats while in front at most every second", () => {
    let time = 0;
    const send = vi.fn();
    const report = createUseReporter(send, () => time);
    report(true);
    time += 500;
    report(true);
    report(false);
    time += 500;
    report(true);
    time += 1_000;
    report(true);
    expect(send.mock.calls).toEqual([[true], [false], [true], [true]]);
  });
});

describe("this window's side, wired up", () => {
  function fakeClient() {
    const delivered: { deliver?: (request: unknown) => void } = {};
    const client = {
      rpc: vi.fn(async (_contract: unknown, _input: unknown) => ({ ok: true })),
      composers: () => [],
      openScreen: vi.fn(),
      subscribe: (_contract: unknown, _input: unknown, onEvent: (request: unknown) => void) => {
        delivered.deliver = onEvent;
        return Object.assign(() => {}, { ready: Promise.resolve() });
      },
    };
    return { client, delivered };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("refuses a request right after M presses a key in this window", async () => {
    const { client, delivered } = fakeClient();
    const show = startShow(client as never);
    show.reopen();
    web.typed();
    delivered.deliver!({ requestId: "r1", input: { action: "screen", screen: "dispatch" } });
    await flush();
    expect(client.openScreen).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith(showResult, { requestId: "r1", ok: false, message: "The user is typing in Paseo right now, so nothing was changed; try again in a few seconds." });
    show.stop();
  });

  it("runs one request at a time in this window", async () => {
    const { client, delivered } = fakeClient();
    const order: string[] = [];
    let finishFirst = () => {};
    client.composers = (() => [
      { prompt: "", insertText: vi.fn(), focus: () => new Promise<void>((resolve) => (order.push("focus a1"), (finishFirst = resolve))) },
    ]) as never;
    client.openScreen = vi.fn(() => void order.push("screen")) as never;
    const show = startShow(client as never);
    show.reopen();
    delivered.deliver!({ requestId: "r1", input: { action: "chat", agentId: "a1" } });
    delivered.deliver!({ requestId: "r2", input: { action: "screen", screen: "dispatch" } });
    await flush();
    expect(order).toEqual(["focus a1"]);
    finishFirst();
    await flush();
    expect(order).toEqual(["focus a1", "screen"]);
    show.stop();
  });

  it("reports use again on every subscribe, since a restarted daemon forgot the last report", async () => {
    const { client } = fakeClient();
    const show = startShow(client as never);
    show.reopen();
    await flush();
    show.reopen();
    await flush();
    expect(client.rpc.mock.calls.filter(([contract]) => contract === showUsed)).toHaveLength(2);
    show.stop();
  });
});

describe("telling whether M is typing", () => {
  it("on web and desktop, a key within the last 3 s", () => {
    let time = 0;
    const keys = createTypingCheck({ web: true, now: () => time, keyboardUp: () => true });
    expect(keys.typing()).toBe(false);
    keys.typed();
    time += 2_999;
    expect(keys.typing()).toBe(true);
    time += 1;
    expect(keys.typing()).toBe(false);
  });

  it("on a phone, the on-screen keyboard being up", () => {
    let up = true;
    const keys = createTypingCheck({ web: false, keyboardUp: () => up });
    expect(keys.typing()).toBe(true);
    up = false;
    expect(keys.typing()).toBe(false);
  });
});
