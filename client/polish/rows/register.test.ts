import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSettings } from "../../../shared/chat-view";
import { polishPrefs } from "../../../shared/polish/prefs";
import type { RowActions } from "../../chat-rows";
import { setPrefs } from "../prefs";
import { currentRowSetup } from "./look";
import { registerChatRows } from "./register";
import { noteShownAgent } from "./steps";

// The transformers as Paseo would call them; the row components are not drawn here.
const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("./tool-row", () => ({ ToolItem: () => null }));
vi.mock("./thought-row", () => ({ ThoughtItem: () => null }));
vi.mock("./steps-row", () => ({ StepsItem: () => null }));
vi.mock("./todo-row", () => ({ TodoItem: () => null }));
vi.mock("./plan-row", () => ({ PlanItem: () => null }));
vi.mock("./notice-row", () => ({ NoticeItem: () => null }));
vi.mock("../web/dom", () => ({ openAgentIds: () => [], subagentPaneShown: () => false, watchDom: () => () => {} }));
vi.mock("../../steps-card", () => ({ CHAT_STEPS_KIND: "steps-card", chatStepsSchema: {}, createChatStepsRow: () => () => null }));

type Transform = (input: { item: unknown; phase: "streaming" | "complete" }) => { items: { kind: string; data: Record<string, unknown> }[] } | undefined;

function fakeClient() {
  const transformers = new Map<string, Transform>();
  const renderers: string[] = [];
  const client = {
    addTimelineTransformer: (t: { query: { itemType: string }; transform: Transform }) => (transformers.set(t.query.itemType, t.transform), () => transformers.delete(t.query.itemType)),
    addTimelineRenderer: (r: { kind: string }) => (renderers.push(r.kind), () => renderers.splice(renderers.indexOf(r.kind), 1)),
    paseo: { agents: { ref: () => ({ timeline: { refetch: async () => ({ entries: [] }), subscribe: () => Object.assign(() => {}, { ready: new Promise(() => {}) }) } }) } },
  };
  return { client: client as unknown as Parameters<typeof registerChatRows>[0], transformers, renderers };
}

const actions = {} as RowActions;
const call = (detail: Record<string, unknown>, status = "completed", extra: Record<string, unknown> = {}) => ({ type: "tool_call", callId: "c1", name: "Bash", detail, status, error: null, ...extra });

function register(chat: ChatSettings | undefined, hidden: string[] = [], stepsInChat = false) {
  setPrefs(polishPrefs(chat));
  const fake = fakeClient();
  const stop = registerChatRows(fake.client, actions, { chat, hidden, stepsInChat, steps: () => ({}) as never });
  const run = (itemType: string, item: unknown, phase: "streaming" | "complete" = "complete") => fake.transformers.get(itemType)?.({ item, phase });
  return { ...fake, stop, run };
}

describe("chat rows in the timeline", () => {
  beforeEach(() => {
    platform.OS = "web";
  });

  it("draws nothing with the master switch off, but still hides what was hidden", () => {
    const { run, transformers, stop } = register({ enabled: false, toolCalls: "cards", reasoning: "fold", hideFinished: ["read"] }, ["error"]);
    expect([...transformers.keys()].sort()).toEqual(["error", "tool_call"]);
    expect(run("tool_call", call({ type: "read", filePath: "/w/a.ts" }))).toEqual({ items: [] });
    expect(run("tool_call", call({ type: "shell", command: "ls" }))).toBeUndefined();
    expect(run("error", { type: "error", message: "x" })).toEqual({ items: [] });
    stop();
  });

  it("leaves tool calls to Paseo by default, and draws them as Chat Polish's rows with cards or lines", () => {
    expect(register(undefined).transformers.size).toBe(0);
    const lines = register({ toolCalls: "compact", polish: { merge: false } });
    const row = lines.run("tool_call", call({ type: "shell", command: "npm test", output: "ok" }));
    expect(row?.items[0]).toMatchObject({ kind: "polish-tool", data: { verb: "Ran", target: "npm test", kind: "shell" } });
    expect(currentRowSetup().look.style).toBe("compact");
    lines.stop();
    const cards = register({ toolCalls: "cards", polish: { merge: false } });
    expect(currentRowSetup().look.style).toBe("cards");
    cards.stop();
  });

  it("folds steps into one merged row when merging is on", () => {
    const { run, stop } = register({ toolCalls: "cards" });
    // A step the followed timelines don't have yet leads a run of one, which the merged row draws as itself.
    expect(run("tool_call", call({ type: "shell", command: "ls" }, "completed", { callId: "m1" }))?.items[0]).toMatchObject({ kind: "polish-steps", data: { head: "t:m1" } });
    expect(run("reasoning", { type: "reasoning", text: "Let me look" })?.items[0]?.kind).toBe("polish-steps");
    stop();
  });

  it("draws thinking as a row, and hides it when asked", () => {
    const fold = register({ reasoning: "fold" });
    expect(fold.run("reasoning", { type: "reasoning", text: "why" }, "streaming")?.items[0]).toMatchObject({ kind: "polish-thought", data: { text: "why", phase: "streaming" } });
    fold.stop();
    const hide = register({ reasoning: "hide" });
    expect(hide.run("reasoning", { type: "reasoning", text: "why" })).toEqual({ items: [] });
    hide.stop();
    const show = register(undefined);
    expect(show.run("reasoning", { type: "reasoning", text: "why" })).toBeUndefined();
    show.stop();
  });

  it("draws plans, todo updates, notices and the steps card", () => {
    const { run, stop } = register({ toolCalls: "cards", notices: true, polish: { merge: false } });
    expect(run("tool_call", call({ type: "plan", text: "1. Do it" }, "running"))?.items[0]).toMatchObject({ kind: "polish-plan", data: { text: "1. Do it" } });
    expect(run("todo", { type: "todo", items: [{ text: "a", completed: false, status: "in_progress" }] })?.items[0]).toMatchObject({ kind: "polish-todo", data: { active: "a" } });
    expect(run("compaction", { type: "compaction", status: "loading" })?.items[0]).toMatchObject({ kind: "polish-notice", data: { variant: "divider", pulsing: true } });
    expect(run("notification", { type: "notification", level: "error", message: "boom" })?.items[0]).toMatchObject({ kind: "polish-notice", data: { tone: "danger", text: "boom" } });
    stop();
    const card = register({ toolCalls: "cards" }, [], true);
    expect(card.run("todo", { type: "todo", items: [{ text: "a", completed: true }] })?.items[0]).toMatchObject({ kind: "steps-card", data: { steps: [{ text: "a", status: "completed" }] } });
    expect(card.renderers).toContain("steps-card");
    card.stop();
  });

  it("never redraws prompts, and replies only as image rows", () => {
    const { run, transformers, stop } = register({ toolCalls: "cards", polish: { images: "small" } });
    expect(transformers.has("user_message")).toBe(false);
    expect(run("assistant_message", { type: "assistant_message", text: "Here you go" })).toBeUndefined();
    expect(run("assistant_message", { type: "assistant_message", text: "![shot](file:///a.png)" })?.items[0]?.kind).toBe("polish-images");
    stop();
  });

  it("leaves the chat to Paseo on phones set to Paseo's rows", () => {
    platform.OS = "ios";
    const { transformers, stop } = register({ toolCalls: "cards", phones: "paseo" });
    expect(transformers.size).toBe(0);
    stop();
  });

  it("with more chats on screen than it follows, following one never re-shows another (no follow loop)", async () => {
    vi.useFakeTimers();
    try {
      setPrefs(polishPrefs({ toolCalls: "cards" }));
      // Four chats is one more than the three recently shown agents followed; twelve also passes the frozen limit (3 shown + 8 frozen).
      const agents = Array.from({ length: 12 }, (_, i) => `loop-${i}`);
      const steps = new Map(agents.map((id) => [id, [1, 2].map((n) => call({ type: "shell", command: "ls" }, "completed", { callId: `${id}-${n}` }))]));
      let follows = 0;
      const transformers = new Map<string, Transform>();
      const client = {
        addTimelineTransformer: (t: { query: { itemType: string }; transform: Transform }) => (transformers.set(t.query.itemType, t.transform), () => transformers.delete(t.query.itemType)),
        addTimelineRenderer: () => () => {},
        paseo: {
          agents: {
            ref: (id: string) => ({
              timeline: {
                refetch: async () => ({ entries: [{ type: "user_message", text: "go" }, ...steps.get(id)!].map((item, i) => ({ item, timestamp: new Date(i).toISOString() })), endCursor: { seq: 3 } }),
                subscribe: () => (follows++, Object.assign(() => {}, { ready: Promise.resolve() })),
              },
            }),
          },
        },
      } as unknown as Parameters<typeof registerChatRows>[0];
      const stop = registerChatRows(client, actions, { chat: { toolCalls: "cards" }, hidden: [], stepsInChat: false, steps: () => ({}) as never });
      // Each tick Paseo draws every mounted chat; a merged row that wasn't drawn before mounts, and after the pass its effect notes its
      // agent (StepsItem's useEffect), as React runs effects after the commit.
      const drawn = new Map<string, Set<string>>();
      const draw = (id: string) => {
        const before = drawn.get(id) ?? new Set<string>();
        const now = new Set<string>();
        for (const item of steps.get(id)!) {
          const row = transformers.get("tool_call")?.({ item, phase: "complete" })?.items[0];
          if (row?.kind === "polish-steps") now.add(row.data.head as string);
        }
        drawn.set(id, now);
        return [...now].some((head) => !before.has(head));
      };
      const ticks = async (mounted: string[]) => {
        for (let i = 0; i < 20; i++) {
          const mounts = mounted.filter(draw);
          await vi.advanceTimersByTimeAsync(0);
          mounts.forEach((id) => noteShownAgent(id));
          await vi.advanceTimersByTimeAsync(60);
        }
      };
      // The chats open one by one.
      for (let n = 1; n <= agents.length; n++) await ticks(agents.slice(0, n));
      const settled = follows;
      await ticks(agents);
      expect(follows - settled, "no agent is followed again while nothing new happens").toBe(0);
      expect(settled).toBeLessThanOrEqual(agents.length);
      stop();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hands rows the Morphise options they draw with, and the file actions", () => {
    const { stop } = register({ toolCalls: "cards", fold: "always", outputLines: 6, codeLines: 0, paths: "absolute", accent: "jade", textSize: "large", timestamps: true, images: false });
    const { look, actions: given } = currentRowSetup();
    expect([look.fold, look.outputLines, look.codeLines, look.paths, look.accent, look.textSize, look.timestamps, look.images]).toEqual(["always", 6, null, "absolute", "#3fb68b", "large", true, false]);
    expect(given).toBe(actions);
    stop();
  });
});
