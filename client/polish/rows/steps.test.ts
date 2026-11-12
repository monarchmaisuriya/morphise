// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/model.test.mjs (merged steps) and test/performance.test.mjs
import { describe, expect, it, onTestFinished } from "vitest";
import type { AgentTimelineItem } from "../agent-types";
import {
  applyItem,
  changesOfTodo,
  followAgent,
  historyEntries,
  isTodo,
  onStaleSteps,
  onUnplacedStep,
  placeStep,
  runOf,
  runSplits,
  setMergeMin,
  stepKey,
  stepRuns,
  stepSummary,
  subscribeRun,
  taskChanges,
  type Entry,
} from "./steps";

type Paseo = Parameters<typeof followAgent>[0];
type Any = Record<string, unknown>;

const tool = (detail: Any, extra: Any = {}) => ({ type: "tool_call", callId: "1", name: "Bash", status: "completed", error: null, detail, ...extra }) as unknown as AgentTimelineItem;
const shell = (id: string, output = "ok") => tool({ type: "shell", command: "echo ok", output }, { callId: id });
const reply = (text: string) => ({ type: "assistant_message", text }) as AgentTimelineItem;
const prompt = (text: string) => ({ type: "user_message", text }) as AgentTimelineItem;
const at = (items: AgentTimelineItem[]): Entry[] => items.map((item, i) => ({ item, at: i }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const keys = (list: Entry[], skip: (item: AgentTimelineItem) => boolean = () => false, replies?: boolean) => stepRuns(list, skip, replies).map((r) => r.steps.map(stepKey));

/** A fake agent timeline: `items` as its history, and `send` for live events. */
async function follow(items: AgentTimelineItem[], id: string, ready: Promise<void> = Promise.resolve()) {
  let handler: (payload: unknown) => void = () => {};
  const subscription = Object.assign(() => {}, { ready });
  const paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch: async () => ({ entries: items.map((item, i) => ({ item, timestamp: new Date(i).toISOString() })), endCursor: { seq: items.length } }),
          subscribe: (h: (payload: unknown) => void) => ((handler = h), subscription),
        },
      }),
    },
  } as unknown as Paseo;
  const stop = followAgent(paseo, id);
  await tick();
  return { stop, send: (item: AgentTimelineItem, seq?: number) => handler({ seq, timestamp: new Date().toISOString(), event: { type: "timeline", item } }) };
}

describe("merged steps", () => {
  it("runs split on replies, fold tool updates and thought chunks, skip hidden steps, time the run", () => {
    const list: Entry[] = [{ item: prompt("go"), at: 1000 }];
    let time = 1000;
    for (const item of [
      { type: "reasoning", text: "Let me " },
      { type: "reasoning", text: "look." },
      tool({ type: "shell", command: "ls" }, { callId: "a", status: "running" }),
      tool({ type: "unknown", input: null, output: null }, { callId: "a" }),
      tool({ type: "read", filePath: "x.ts" }, { callId: "b" }),
      reply("Done"),
      reply(" here"),
      tool({ type: "edit", filePath: "x.ts", oldString: "a", newString: "b" }, { callId: "c" }),
    ] as AgentTimelineItem[]) applyItem(list, item, (time += 1000));
    expect(list).toHaveLength(6);
    expect((list[1]!.item as Any).text).toBe("Let me look.");
    expect(((list[2]!.item as Any).detail as Any).type).toBe("shell");
    expect((list[2]!.item as Any).status).toBe("completed");
    const runs = stepRuns(list, (item) => (item as Any).detail !== undefined && ((item as Any).detail as Any).type === "read");
    expect(runs.map((r) => r.steps.map(stepKey))).toEqual([["r:Let me look.", "t:a"], ["t:c"]]);
    // From the user message (1s) to the shell call's completion (5s); the second run starts when the reply's last chunk arrived (8s).
    expect(runs.map((r) => r.ms)).toEqual([4000, 1000]);
    // Only the run nothing has followed yet can still grow.
    expect(runs.map((r) => r.open)).toEqual([false, true]);
    expect(stepSummary(runs[0]!.steps)).toBe("Thought 1 time and ran 1 command");
    expect(stepSummary(list.map((e) => e.item))).toBe("Thought 1 time, edited 1 file, ran 1 command, and read 1 file");
    expect(stepSummary([tool({ type: "unknown", input: null, output: null }, { name: "mcp__paseo__browser_click" }), tool({ type: "unknown", input: null, output: null }, { name: "WebSearch" })])).toBe("Used 1 other tool and called Paseo 1 time");
  });

  it("with Collapse turns, replies before a turn's last fold into its run; the last reply and the next turn stay out", () => {
    const list = at([
      prompt("go"),
      tool({ type: "shell", command: "ls" }, { callId: "a" }),
      reply("Let me look."),
      tool({ type: "shell", command: "pwd" }, { callId: "b" }),
      reply("Done."),
      tool({ type: "shell", command: "date" }, { callId: "c" }),
      reply("![Image](file:///tmp/shot.png)"),
      tool({ type: "shell", command: "true" }, { callId: "d" }),
      prompt("again"),
      reply("Only one."),
      reply("And the answer."),
    ]);
    expect(keys(list, undefined, true)).toEqual([["t:a", "m:Let me look.", "t:b"], ["t:c", "m:![Image](file:///tmp/shot.png)", "t:d"], ["m:Only one."]]);
    // Without Collapse turns a reply ends a run, as before.
    expect(keys(list, undefined, false)).toEqual([["t:a"], ["t:b"], ["t:c"], ["t:d"]]);
    // Another agent's notice steered into the running turn shares its id, so it doesn't end the turn: the reply before it still folds.
    const steered: Entry[] = [
      { item: prompt("go"), turn: "t1" },
      { item: tool({ type: "shell", command: "ls" }, { callId: "a" }), turn: "t1" },
      { item: reply("Waiting."), turn: "t1" },
      { item: tool({ type: "plain_text", text: "Agent x (X) finished." }, { callId: "n", name: "agent_message" }), turn: "t1" },
      { item: reply("All done."), turn: "t1" },
    ].map((e, i) => ({ ...e, at: i }));
    expect(keys(steered, undefined, true)).toEqual([["t:a", "m:Waiting."]]);
    // Without turn ids the notice starts a turn, as in Paseo.
    expect(keys(steered.map(({ turn: _turn, ...e }) => e), undefined, true)).toEqual([["t:a"]]);
    const shot = (n: number) => reply(`![Image](file:///var/folders/0k/cp7qlhsd4c75_t3910n0xxvm0000gp/T/paseo-attachments-amBgL7/${n}.png)`);
    expect(stepKey(shot(1))).not.toBe(stepKey(shot(2)));
    expect(stepSummary([reply("x")])).toBe("Wrote 1 message");
    expect(stepSummary([tool({ type: "shell", command: "ls" }), reply("x")])).toBe("Ran 1 command");
  });

  it("Claude's task tools are passed over, todo-list calls and agent messages end a run", () => {
    const entries = at([
      tool({ type: "unknown", input: null, output: null }, { callId: "t1", name: "TaskUpdate" }),
      tool({ type: "shell", command: "ls" }, { callId: "a" }),
      tool({ type: "unknown", input: null, output: null }, { callId: "t2", name: "TaskCreate" }),
      tool({ type: "read", filePath: "x.ts" }, { callId: "b" }),
      tool({ type: "unknown", input: null, output: null }, { callId: "w", name: "TodoWrite" }),
      tool({ type: "shell", command: "pwd" }, { callId: "c" }),
      tool({ type: "plain_text", text: "hi" }, { callId: "m", name: "agent_message" }),
      tool({ type: "plain_text", text: "tick" }, { callId: "h", name: "heartbeat" }),
      tool({ type: "shell", command: "date" }, { callId: "d" }),
    ]);
    // Agent messages and heartbeats start a turn in Paseo, so they end a run and never join one.
    expect(keys(entries)).toEqual([["t:a", "t:b"], ["t:c"], ["t:d"]]);
    // Hidden todo lists (the call or the daemon's own todo item) are passed over, so the steps around them stay one run.
    const withTodo = [...entries.slice(0, 4), { item: { type: "todo", items: [] } as unknown as AgentTimelineItem, at: 4 }, ...entries.slice(5)];
    for (const list of [entries, withTodo]) expect(keys(list, isTodo)).toEqual([["t:a", "t:b", "t:c"], ["t:d"]]);
  });

  it("sub-agent calls stay Paseo's rows (they link to the sub-agent's chat), so they end a run", () => {
    const entries = at([shell("a"), tool({ type: "sub_agent", description: "Explore", log: "" }, { callId: "s", name: "Task" }), shell("b")]);
    expect(stepKey(entries[1]!.item)).toBeUndefined();
    expect(keys(entries)).toEqual([["t:a"], ["t:b"]]);
  });

  it("todo updates: what changed, folded into the run around them, never leading it", async () => {
    const todo = (...s: string[]) => ({ type: "todo", items: s.map((status, i) => ({ text: `t${i}`, completed: status === "completed", status })) }) as unknown as Extract<AgentTimelineItem, { type: "todo" }>;
    const t0 = todo("in_progress", "pending");
    const t1 = todo("completed", "in_progress");
    expect(taskChanges([], t0.items)).toEqual([{ type: "created", count: 2 }]);
    expect(taskChanges(t0.items, t1.items)).toEqual([{ type: "completed", text: "t0" }, { type: "started", text: "t1" }]);
    expect(taskChanges(t1.items, [...t1.items, { text: "t2", completed: false }])).toEqual([{ type: "added", text: "t2" }]);
    const a = tool({ type: "shell", command: "ls" }, { callId: "a" });
    const b = tool({ type: "shell", command: "pwd" }, { callId: "b" });
    const ok = reply("ok");
    // A todo update joins the run; one with no steps around it isn't a run.
    expect(keys(at([t0, a, t1, b, ok, t1, ok]))).toEqual([[stepKey(t0), "t:a", stepKey(t1), "t:b"]]);
    expect(stepSummary([a, t1, b], () => [{ type: "completed", text: "t0" }])).toBe("Ran 2 commands and completed 1 task");
    // The same list sent again isn't another step.
    expect(keys(at([a, t1, t1, b]))).toEqual([["t:a", stepKey(t1), "t:b"]]);

    // Placed: the run's first tool call heads the merged row, the todo updates around it are left out; a lone update stays on its own.
    const lone = todo("completed", "completed");
    const live = await follow([prompt("go"), t0, a, t1, b, ok, lone, ok], "todo-agent");
    onTestFinished(live.stop);
    expect(placeStep(t0, "complete")?.as).toBe("none");
    expect(placeStep(a, "complete")?.as).toBe("head");
    expect(placeStep(t1, "complete")?.as).toBe("none");
    expect(placeStep(lone, "complete")?.as).toBe("head");
    expect(runOf("t:a").steps.map((s) => stepKey(s.item))).toEqual([stepKey(t0), "t:a", stepKey(t1), "t:b"]);
    expect(changesOfTodo(stepKey(t1)!)).toEqual([{ type: "completed", text: "t0" }, { type: "started", text: "t1" }]);
    expect(stepSummary(runOf("t:a").steps.map((s) => s.item))).toBe("Ran 2 commands and completed 1 task");
  });

  it("a run shorter than the merge minimum splits into its own rows; a run of one always heads its own row", async () => {
    expect([1, 2, 3, 4].map((n) => runSplits(n, 2))).toEqual([false, false, false, false]);
    expect([1, 2, 3, 4].map((n) => runSplits(n, 3))).toEqual([false, true, false, false]);
    expect([1, 2, 3, 4, 5].map((n) => runSplits(n, 5))).toEqual([false, true, true, true, false]);
    let stale = 0;
    onStaleSteps(() => stale++);
    onTestFinished(() => (onStaleSteps(() => {}), setMergeMin(2)));
    const [a, b, c, d, e, lone] = ["min-a", "min-b", "min-c", "min-d", "min-e", "min-lone"].map((id) => shell(id));
    const live = await follow([prompt("go"), a!, b!, reply("half"), c!, d!, e!, reply("done"), lone!, reply("end")], "merge-min");
    onTestFinished(live.stop);
    // The default (2) merges every run of two or more, as before the option existed.
    expect([a, b, c, d, e, lone].map((s) => placeStep(s!, "complete")?.as)).toEqual(["head", "none", "head", "none", "none", "head"]);
    setMergeMin(3);
    expect(stale, "rows made under the old minimum are transformed again").toBeGreaterThan(0);
    expect([a, b, c, d, e, lone].map((s) => placeStep(s!, "complete")?.as)).toEqual(["alone", "alone", "head", "none", "none", "head"]);
    expect(runOf(stepKey(c!)!).steps).toHaveLength(3);
    setMergeMin(5);
    expect([c, d, e].map((s) => placeStep(s!, "complete")?.as)).toEqual(["alone", "alone", "alone"]);
    // A run that grows past the minimum merges.
    live.send(prompt("next"));
    const grown = ["g1", "g2", "g3", "g4", "g5"].map((id) => shell(id));
    grown.slice(0, 4).forEach((s) => live.send(s));
    expect(grown.slice(0, 4).map((s) => placeStep(s, "complete")?.as)).toEqual(["alone", "alone", "alone", "alone"]);
    live.send(grown[4]!);
    expect(grown.map((s) => placeStep(s, "complete")?.as)).toEqual(["head", "none", "none", "none", "none"]);
  });

  it("a provider subagent's pane id isn't followed (no daemon agent behind it)", () => {
    const paseo = { agents: { ref: () => expect.unreachable("a provider: id has no timeline to fetch") } } as unknown as Paseo;
    followAgent(paseo, "provider:parent:child")();
  });

  it("a step transformed before its timeline catches up leads its run in place, with no re-transform", async () => {
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => (resolveReady = resolve));
    let stale = 0;
    let unplaced = 0;
    onStaleSteps(() => stale++);
    onUnplacedStep(() => unplaced++);
    onTestFinished(() => (onStaleSteps(() => {}), onUnplacedStep(() => {})));
    const live = follow([prompt("go")], "agent", ready);
    resolveReady();
    const { stop, send } = await live;
    await tick();
    const a = tool({ type: "shell", command: "ls" }, { callId: "a", status: "running" });
    const b = tool({ type: "shell", command: "pwd" }, { callId: "b", status: "running" });
    // Paseo renders the first call before the plugin's own event arrives: it leads a run of one.
    expect(placeStep(a, "streaming")).toEqual({ key: "t:a", as: "head" });
    expect(unplaced).toBe(1);
    send(a, 1);
    send(b, 2);
    // The second joins it; the first row grows into the merged row without Paseo transforming again.
    expect(placeStep(b, "streaming")).toEqual({ key: "t:b", as: "none" });
    expect(stale).toBe(0);
    // A call that comes before its event while the run is growing waits for the event instead of flashing as a row of its own.
    const c = tool({ type: "shell", command: "id" }, { callId: "c", status: "running" });
    expect(placeStep(c, "streaming")?.as).toBe("none");
    send(c, 3);
    expect(stale).toBe(0);
    // After a reply nothing is growing, so the next run's first call leads at once.
    send(reply("done"), 4);
    const d = tool({ type: "shell", command: "whoami" }, { callId: "d", status: "running" });
    expect(placeStep(d, "streaming")?.as).toBe("head");
    send(d, 5);
    expect(stale).toBe(0);
    // A call kept out that turns out to start a run is stale, so the re-transform shows it.
    const e = tool({ type: "shell", command: "date" }, { callId: "e", status: "running" });
    expect(placeStep(e, "streaming")?.as).toBe("none");
    send(reply("next"), 6);
    send(e, 7);
    expect(stale).toBe(1);
    stop();
  });

  it("a thought streaming into a growing run waits for its event instead of flashing as its own row", async () => {
    let stale = 0;
    onStaleSteps(() => stale++);
    onTestFinished(() => onStaleSteps(() => {}));
    const { stop, send } = await follow([prompt("go")], "thought-agent");
    send(tool({ type: "shell", command: "ls" }, { callId: "th-a" }), 1);
    // Paseo streams the next thought before the plugin's event has it (or with fewer opening words): it stays out rather than showing alone.
    expect(placeStep({ type: "reasoning", text: "Next I" } as AgentTimelineItem, "streaming")?.as).toBe("none");
    const thought = { type: "reasoning", text: "Next I will check the file." } as AgentTimelineItem;
    send(thought, 2);
    expect(placeStep(thought, "complete")?.as).toBe("none");
    expect(stale).toBe(0);
    // A finished thought the timeline never matches still shows, rather than staying hidden.
    expect(placeStep({ type: "reasoning", text: "Words the daemon never sent" } as AgentTimelineItem, "complete")?.as).toBe("head");
    stop();
  });
});

describe("merged steps performance", () => {
  it("streaming a tool notifies only its changed run", async () => {
    const items: AgentTimelineItem[] = [];
    const heads: string[] = [];
    for (let i = 0; i < 333; i++) {
      const item = shell(`history-${i}`);
      heads.push(stepKey(item)!);
      items.push(prompt("go"), item, reply("done"));
    }
    items.push(shell("active"));
    const live = await follow(items, "notifications");
    onTestFinished(live.stop);
    let old = 0;
    let active = 0;
    const unsubscribes = heads.map((head) => subscribeRun(head, () => old++));
    unsubscribes.push(subscribeRun("t:active", () => active++));
    onTestFinished(() => unsubscribes.forEach((u) => u()));
    live.send(shell("active", "changed"));
    await tick();
    expect(old).toBe(0);
    expect(active).toBe(1);
  });

  it("live history evicts old turns, restores their rows, and preserves the active turn", async () => {
    const first = shell("evicted-first");
    const second = shell("evicted-second");
    const live = await follow([prompt("go"), first, second, reply("done")], "history-bound");
    expect(placeStep(second, "complete")?.as).toBe("none");
    expect(placeStep(first, "complete")?.as).toBe("head");
    let stale = 0;
    onStaleSteps(() => stale++);
    onTestFinished(() => onStaleSteps(() => {}));
    for (let i = 0; i < 500; i++) {
      live.send(prompt("go"));
      live.send(shell(`turn-${i}`));
      live.send(reply("done"));
    }
    expect(runOf(stepKey(first)!).steps).toEqual([]);
    expect(stale, "evicted hidden rows must be transformed again").toBeGreaterThan(0);
    expect(placeStep(second, "complete")?.as).toBe("head");
    placeStep(shell("turn-499"), "complete");
    stale = 0;
    live.send(prompt("long active turn"));
    for (let i = 0; i < 1100; i++) live.send(shell(`long-${i}`));
    expect(runOf("t:long-0").steps.length, "do not cut a live run in half").toBe(1100);
    expect(stale, "evicted singleton rows must be transformed again too").toBeGreaterThan(0);
    placeStep(shell("long-0"), "complete");
    live.stop();
    expect(runOf("t:long-0").steps).toEqual([]);
  });

  it("each run starts its own clock after a restored timestamp in an earlier run", () => {
    const list: Entry[] = [
      { item: prompt("old turn"), at: 1000 },
      { item: shell("restored"), at: 2 * 86400000 },
      { item: reply("reply"), at: 2000 },
      { item: shell("next-a"), at: 3000 },
      { item: shell("next-b"), at: 44801 },
      { item: reply("done"), at: 45000 },
    ];
    expect(stepRuns(list, () => false)[1]!.ms).toBe(42801);
  });

  it("history excludes import timestamps beyond the next prompt or the idle agent's last update", () => {
    const entries = (
      [
        [prompt("first"), "2026-10-15T10:00:00Z"],
        [shell("replayed-time"), "2026-10-17T13:43:04Z"],
        [reply("reply"), "2026-10-15T10:00:10Z"],
        [prompt("next"), "2026-10-15T10:01:00Z"],
        [shell("valid-a"), "2026-10-15T10:01:05Z"],
        [shell("valid-b"), "2026-10-15T10:01:43Z"],
        [reply("reply"), "2026-10-15T10:01:44Z"],
        [prompt("last"), "2026-10-15T10:02:00Z"],
        [shell("last-replayed-time"), "2026-10-17T13:43:04Z"],
        [reply("done"), "2026-10-17T13:43:04Z"],
      ] as const
    ).map(([item, timestamp]) => ({ item, timestamp }));
    const runs = stepRuns(historyEntries(entries, "2026-10-15T10:02:10Z"), () => false);
    expect(runs[0]!.ms, "do not guess a duration for restored timestamps").toBeUndefined();
    expect(runs[1]!.ms).toBe(43000);
    expect(runs[2]!.ms).toBeUndefined();
    expect(stepRuns(historyEntries(entries), () => false)[0]!.ms, "the next prompt also bounds history while an agent runs").toBeUndefined();
    const missing = historyEntries([{ item: shell("missing-time"), timestamp: "invalid" }]);
    expect(stepRuns(missing, () => false)[0]!.ms).toBeUndefined();
  });
});
