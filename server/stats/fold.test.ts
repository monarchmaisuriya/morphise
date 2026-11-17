// Ported from Harness Stats (kogekiplay/paseo-harness-stats, MIT, see NOTICE.md): tests/fold.test.ts at 4e8fae9
import { describe, expect, it } from "vitest";
import { cacheHitShare, totalTokens } from "../../shared/stats";
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
