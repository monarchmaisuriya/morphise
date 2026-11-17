// Ported from Harness Stats (kogekiplay/paseo-harness-stats, MIT, see NOTICE.md): tests/fold.test.ts at 4e8fae9
import { describe, expect, it } from "vitest";
import { cacheHitShare, type SessionCounters, TURNS_KEPT, type TurnReading, totalTokens } from "../../shared/stats";
import { SessionFold } from "./fold";

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output });
const event = (type: string, seconds: number, payload = {}) => ({ type: "event_msg", timestamp: at(seconds), payload: { type, ...payload } });
const response = (id: string, seconds: number, turn = "t1") => ({
  type: "token_usage_record",
  timestamp: at(seconds),
  payload: { response_id: id, turn_id: turn, usage: usage(1000, 600, 100) },
});
const item = (type: string, id: string, seconds: number) => ({ type: "response_item", timestamp: at(seconds), payload: { type, call_id: id } });

describe("session fold", () => {
  it("Codex deduplicates response IDs and compatibility token_count events", () => {
    const fold = new SessionFold("codex");
    fold.apply(event("task_started", 1, { turn_id: "t1" }));
    fold.apply(response("r1", 3));
    fold.apply(response("r1", 3));
    fold.apply(event("token_count", 3, { info: { total_token_usage: usage(1000, 600, 100) } }));
    fold.apply(response("r2", 5));
    fold.apply(event("task_started", 10, { turn_id: "t2" }));
    fold.apply(response("r3", 12, "t2"));
    expect(fold.stats.steps).toBe(3);
    expect(fold.stats.turns).toBe(2);
    expect(totalTokens(fold.stats)).toBe(3300);
    expect(cacheHitShare(fold.stats)).toBe(0.6);
  });

  it("Parallel tools and user idle time do not dilute model speed", () => {
    const fold = new SessionFold("codex");
    for (const row of [
      event("task_started", 1, { turn_id: "t1" }),
      item("function_call", "a", 3),
      item("function_call", "b", 3),
      response("r1", 3),
      item("function_call_output", "a", 20),
      item("function_call_output", "b", 30),
      response("r2", 32),
      event("task_completed", 33),
      event("task_started", 1000, { turn_id: "t2" }),
      response("r3", 1002, "t2"),
    ])
      fold.apply(row);
    expect(fold.stats.modelMs).toBe(6000);
    expect(fold.stats.timedOutputTokens).toBe(300);
    expect(fold.stats.toolMs).toBe(44_000);
  });

  it("Old Codex usage ignores repeats and survives counter resets", () => {
    const fold = new SessionFold("codex");
    fold.apply(event("task_started", 1, { turn_id: "old" }));
    for (const [seconds, u] of [
      [2, usage(1000, 600, 100)],
      [3, usage(1000, 600, 100)],
      [4, usage(3000, 1200, 300)],
      [5, usage(500, 0, 50)],
    ] as const) {
      fold.apply(event("token_count", seconds, { info: { total_token_usage: u } }));
    }
    expect(fold.stats.steps).toBe(3);
    expect(fold.stats.inputTokens).toBe(3500);
    expect(fold.stats.outputTokens).toBe(350);
    expect(fold.stats.cachedTokens).toBe(1200);
  });

  it("Claude merges streamed blocks by message ID, including cache writes once", () => {
    const fold = new SessionFold("claude");
    fold.apply({ type: "user", uuid: "u1", timestamp: at(1), message: { content: "hello" } });
    const assistant = (output: number, seconds: number) => ({
      type: "assistant",
      timestamp: at(seconds),
      message: { id: "msg1", usage: { input_tokens: 100, cache_read_input_tokens: 600, cache_creation_input_tokens: 300, output_tokens: output } },
    });
    fold.apply(assistant(1, 2));
    fold.apply(assistant(100, 3));
    fold.apply(assistant(100, 3));
    expect(fold.stats.steps).toBe(1);
    expect(fold.stats.turns).toBe(1);
    expect(totalTokens(fold.stats)).toBe(1100);
    expect(fold.stats.cacheWriteTokens).toBe(300);
    expect(fold.stats.modelMs).toBe(2000);
    expect(fold.stats.timedOutputTokens).toBe(100);
  });

  it("Claude tool results stay in one turn; errors and sidechains are excluded", () => {
    const fold = new SessionFold("claude");
    fold.apply({ type: "user", uuid: "u1", timestamp: at(1), message: { content: "hi" } });
    const assistant = (id: string) => ({ type: "assistant", timestamp: at(3), message: { id, usage: { input_tokens: 10, output_tokens: 10 } } });
    fold.apply(assistant("a"));
    fold.apply({ type: "user", uuid: "tool", timestamp: at(4), message: { content: [{ type: "tool_result" }] } });
    fold.apply(assistant("b"));
    fold.apply({ ...assistant("side"), isSidechain: true });
    fold.apply({ ...assistant("error"), isApiErrorMessage: true });
    expect(fold.stats.steps).toBe(2);
    expect(fold.stats.turns).toBe(1);
  });

  it("No billed input has no hit rate; near-full cache reads stay below 100%", () => {
    const fold = new SessionFold("codex");
    expect(cacheHitShare(fold.stats)).toBeNull();
    fold.stats.inputTokens = 100000;
    fold.stats.cachedTokens = 99999;
    expect(cacheHitShare(fold.stats)).toBeLessThan(1);
  });

  it("New Codex output-item timestamps produce TTFT while tool-only starts stay uncounted", () => {
    const fold = new SessionFold("codex");
    fold.apply(event("task_started", 1, { turn_id: "t1" }));
    fold.apply({ type: "turn_context", timestamp: at(2), payload: { turn_id: "t1" } });
    fold.apply(event("item_completed", 6, { item: { type: "AgentMessage" }, started_at_ms: 4000 }));
    fold.apply(response("r1", 7));
    expect(fold.stats.ttftMs).toBe(2000);
    expect(fold.stats.ttftSteps).toBe(1);
    fold.apply(item("function_call_output", "a", 10));
    fold.apply(item("function_call", "b", 12));
    fold.apply(response("r2", 13));
    expect(fold.stats.ttftSteps).toBe(1);
    fold.apply(item("function_call_output", "b", 15));
    fold.apply(event("item_completed", 19, { item: { type: "Reasoning" }, started_at_ms: 16000 }));
    fold.apply(response("r3", 20));
    expect(fold.stats.ttftSteps).toBe(2);
    expect(fold.stats.ttftMs).toBe(3000);
  });

  it("Claude thinking duration and parent timestamps recover TTFT only for completed first thinking blocks", () => {
    const fold = new SessionFold("claude");
    fold.apply({ type: "user", uuid: "u", timestamp: at(1), message: { content: "hello" } });
    const part = (content: unknown[], seconds: number, extra = {}, stop: string | null = null) => ({
      type: "assistant",
      uuid: `a${seconds}`,
      parentUuid: "u",
      apiBlockIndex: 0,
      timestamp: at(seconds),
      ...extra,
      message: { id: "m", stop_reason: stop, content, usage: { input_tokens: 10, output_tokens: 100 } },
    });
    fold.apply(part([{ type: "thinking" }], 6, { thinkingDurationMs: 2000 }));
    expect(fold.stats.ttftSteps).toBe(0);
    fold.apply(part([{ type: "text" }], 10, {}, "end_turn"));
    fold.apply(part([{ type: "text" }], 10, {}, "end_turn"));
    expect(fold.stats.ttftSteps).toBe(1);
    expect(fold.stats.ttftMs).toBe(3000);
    const plain = new SessionFold("claude");
    plain.apply({ type: "user", uuid: "u", timestamp: at(1), message: { content: "hello" } });
    plain.apply(part([{ type: "text" }], 10, {}, "end_turn"));
    expect(plain.stats.ttftSteps).toBe(0);
  });

  it("A session upgraded from old to new Codex retains all earlier billed usage", () => {
    const fold = new SessionFold("codex");
    fold.apply(event("task_started", 1, { turn_id: "old" }));
    fold.apply(event("token_count", 2, { info: { total_token_usage: usage(1000, 600, 100) } }));
    fold.apply(event("task_started", 10, { turn_id: "new" }));
    fold.apply(response("new-1", 12, "new"));
    expect(fold.stats.steps).toBe(2);
    expect(fold.stats.turns).toBe(2);
    expect(totalTokens(fold.stats)).toBe(2200);
  });
});

// Per-turn readings: what each turn added. Their sums must equal the totals, whatever the provider's rules.
const ADDITIVE = ["steps", "inputTokens", "cachedTokens", "cacheWriteTokens", "outputTokens", "modelMs", "toolMs"] as const;
function expectTurnsAddUp(stats: SessionCounters, turns: readonly TurnReading[]) {
  for (const key of ADDITIVE) expect(turns.reduce((sum, turn) => sum + turn[key], 0), key).toBeCloseTo(stats[key], 6);
}

describe("per-turn readings", () => {
  const claudeUser = (uuid: string, seconds: number, content: unknown = "hi") => ({ type: "user", uuid, timestamp: at(seconds), message: { content } });
  const claudeReply = (id: string, seconds: number, parent: string, output = 10, content: unknown[] = []) => ({
    type: "assistant",
    uuid: `${id}-${seconds}`,
    parentUuid: parent,
    timestamp: at(seconds),
    message: { id, content, usage: { input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: output } },
  });

  it("Claude: one record per prompt, numbered as turns counts them, starting at the prompt, with tool time", () => {
    const fold = new SessionFold("claude");
    fold.apply(claudeUser("u1", 10));
    fold.apply(claudeReply("m1", 14, "u1", 10, [{ type: "tool_use", id: "t1" }]));
    fold.apply(claudeUser("r1", 20, [{ type: "tool_result", tool_use_id: "t1" }]));
    fold.apply(claudeReply("m2", 25, "r1", 30));
    fold.apply(claudeUser("u2", 100));
    fold.apply(claudeReply("m3", 103, "u2", 50));
    const turns = fold.turnReadings();
    expect(turns.map((turn) => [turn.turn, turn.startAt, turn.endAt, turn.steps, turn.outputTokens, turn.toolMs])).toEqual([
      [1, 10_000, 25_000, 2, 40, 6_000],
      [2, 100_000, 103_000, 1, 50, 0],
    ]);
    expect(fold.stats.turns).toBe(2);
    expectTurnsAddUp(fold.stats, turns);
  });

  it("Claude: a message updated after a new prompt puts its change on the new turn, and the sums still match", () => {
    const fold = new SessionFold("claude");
    fold.apply(claudeUser("u1", 1));
    fold.apply(claudeReply("m1", 2, "u1", 10));
    fold.apply(claudeUser("u2", 3));
    fold.apply(claudeReply("m1", 4, "u1", 40));
    const turns = fold.turnReadings();
    expect(turns.map((turn) => turn.outputTokens)).toEqual([10, 30]);
    expectTurnsAddUp(fold.stats, turns);
  });

  it("Codex: turns follow task_started ids and add up to the cumulative totals", () => {
    const fold = new SessionFold("codex");
    fold.apply(event("task_started", 1, { turn_id: "t1" }));
    fold.apply(response("r1", 3, "t1"));
    fold.apply(item("function_call", "c1", 4));
    fold.apply(item("function_call_output", "c1", 9));
    fold.apply(response("r2", 11, "t1"));
    fold.apply(event("task_started", 50, { turn_id: "t2" }));
    fold.apply(response("r3", 53, "t2"));
    const turns = fold.turnReadings();
    expect(turns.map((turn) => [turn.turn, turn.startAt, turn.steps, turn.toolMs])).toEqual([
      [1, 1_000, 2, 5_000],
      [2, 50_000, 1, 0],
    ]);
    expectTurnsAddUp(fold.stats, turns);
  });

  it("Codex: legacy cumulative counters, including a reset at resume, add up per turn", () => {
    const fold = new SessionFold("codex");
    const count = (seconds: number, input: number, output: number) => event("token_count", seconds, { info: { total_token_usage: { input_tokens: input, cached_input_tokens: input / 2, output_tokens: output } } });
    fold.apply(event("task_started", 1, { turn_id: "t1" }));
    fold.apply(count(2, 1000, 100));
    fold.apply(count(3, 1600, 160));
    fold.apply(event("task_started", 10, { turn_id: "t2" }));
    fold.apply(count(11, 200, 20));
    const turns = fold.turnReadings();
    expect(turns.map((turn) => [turn.turn, turn.inputTokens, turn.outputTokens])).toEqual([
      [1, 1600, 160],
      [2, 200, 20],
    ]);
    expectTurnsAddUp(fold.stats, turns);
  });

  it(`keeps the most recent ${TURNS_KEPT} turns, dropping the oldest, and stays small`, () => {
    const fold = new SessionFold("claude");
    for (let index = 1; index <= TURNS_KEPT + 5; index++) {
      fold.apply(claudeUser(`u${index}`, index * 100));
      fold.apply(claudeReply(`m${index}`, index * 100 + 5, `u${index}`, 1_000_000));
    }
    const turns = fold.turnReadings();
    expect(turns).toHaveLength(TURNS_KEPT);
    expect(turns[0].turn).toBe(6);
    expect(turns.at(-1)?.turn).toBe(TURNS_KEPT + 5);
    expect(JSON.stringify(turns).length).toBeLessThan(64 * 1024);
  });

  it("Codex: tool time seen before a turn's first usage still lands on that turn; numbers are unique from 1", () => {
    const fold = new SessionFold("codex");
    fold.apply(event("task_started", 1, { turn_id: "t1" }));
    fold.apply(item("function_call", "c0", 2));
    fold.apply(item("function_call_output", "c0", 4));
    fold.apply(response("r1", 6, "t1"));
    fold.apply(event("task_started", 10, { turn_id: "t2" }));
    fold.apply(response("r2", 12, "t2"));
    const turns = fold.turnReadings();
    expect(turns.map((turn) => [turn.turn, turn.toolMs, turn.steps])).toEqual([
      [1, 2_000, 1],
      [2, 0, 1],
    ]);
    expectTurnsAddUp(fold.stats, turns);
  });

  it("Claude: a tool result after a new prompt that brings no model usage folds into a counted turn, keeping numbers unique", () => {
    const fold = new SessionFold("claude");
    fold.apply(claudeUser("u1", 1));
    fold.apply(claudeReply("m1", 2, "u1", 10, [{ type: "tool_use", id: "t1" }]));
    fold.apply(claudeUser("u2", 3));
    fold.apply(claudeUser("r1", 5, [{ type: "tool_result", tool_use_id: "t1" }]));
    fold.apply(claudeUser("u3", 8));
    fold.apply(claudeReply("m3", 9, "u3", 20));
    const turns = fold.turnReadings();
    expect(fold.stats.turns).toBe(2);
    expect(turns.map((turn) => turn.turn)).toEqual([1, 2]);
    expectTurnsAddUp(fold.stats, turns);
  });

  it("never reports a negative change, so one odd line cannot fail the whole reading", () => {
    const fold = new SessionFold("claude");
    fold.apply(claudeUser("u1", 10));
    fold.apply(claudeReply("m1", 20, "u1", 10));
    fold.apply(claudeUser("u2", 30));
    // The same message again, stamped earlier than before: its model time shrinks.
    fold.apply(claudeReply("m1", 15, "u1", 10));
    for (const turn of fold.turnReadings()) for (const key of ADDITIVE) expect(turn[key]).toBeGreaterThanOrEqual(0);
  });

  it("turns that never had model usage do not use up the kept turns", () => {
    const fold = new SessionFold("claude");
    for (let index = 1; index <= 150; index++) {
      fold.apply(claudeUser(`u${index}`, index * 100));
      fold.apply(claudeReply(`m${index}`, index * 100 + 5, `u${index}`, 10, [{ type: "tool_use", id: `t${index}` }]));
      // A new prompt, then the tool's late result: that prompt's turn never gets model usage.
      fold.apply(claudeUser(`p${index}`, index * 100 + 10));
      fold.apply(claudeUser(`r${index}`, index * 100 + 20, [{ type: "tool_result", tool_use_id: `t${index}` }]));
    }
    const turns = fold.turnReadings();
    expect(fold.stats.turns).toBe(150);
    expect(turns).toHaveLength(150);
    expectTurnsAddUp(fold.stats, turns);
  });

  it("past the kept turns, late usage for a dropped turn never lists it out of order", () => {
    const fold = new SessionFold("codex");
    for (let index = 1; index <= TURNS_KEPT + 1; index++) {
      fold.apply(event("task_started", index * 10, { turn_id: `t${index}` }));
      fold.apply(response(`r${index}`, index * 10 + 1, `t${index}`));
    }
    fold.apply(response("late", 9_000, "t1"));
    const numbers = fold.turnReadings().map((turn) => turn.turn);
    expect(numbers).toHaveLength(TURNS_KEPT);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers.at(-1)).toBe(TURNS_KEPT + 1);
  });

  it("has no records before any model usage", () => {
    const fold = new SessionFold("claude");
    fold.apply(claudeUser("u1", 1));
    expect(fold.turnReadings()).toEqual([]);
  });
});
