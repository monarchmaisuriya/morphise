// Ported from Harness Stats (kogekiplay/paseo-harness-stats, MIT, see NOTICE.md): server/fold.ts at 4e8fae9
import { emptyCounters, type SessionCounters, TURNS_KEPT, type TurnReading } from "../../shared/stats";

// The counters a turn adds to; each total is the sum of these changes over every line.
const ADDITIVE = ["steps", "inputTokens", "cachedTokens", "cacheWriteTokens", "outputTokens", "modelMs", "toolMs"] as const;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const time = (value: unknown): number => (typeof value === "string" ? Date.parse(value) : NaN);

interface Usage {
  input: number;
  cached: number;
  write: number;
  output: number;
}
function codexUsage(value: unknown): Usage {
  const u = record(value);
  return {
    input: count(u.input_tokens),
    cached: count(u.cached_input_tokens),
    write: count(u.cache_write_input_tokens),
    output: count(u.output_tokens),
  };
}

/** Folds complete JSONL lines; content and tool arguments are never retained. */
export class SessionFold {
  readonly stats: SessionCounters;
  private turn = "initial";
  private turns = new Set<string>();
  // What each turn added (the most recent TURNS_KEPT, oldest first), and when the current turn's opening line came.
  private turnRecords = new Map<string, TurnReading>();
  private opened: { turn: string; at: number } | null = null;
  private turnNumbers = new Map<string, number>();
  private responses = new Set<string>();
  private modern = false;
  private legacySteps = 0;
  private legacyUsage: Usage = { input: 0, cached: 0, write: 0, output: 0 };
  private modernUsage: Usage = { input: 0, cached: 0, write: 0, output: 0 };
  private legacyResets: Usage = { input: 0, cached: 0, write: 0, output: 0 };
  private lastCumulative: Usage | null = null;
  private boundary = NaN;
  private requestStart: number | null = null;
  private firstOutput: number | null = null;
  private firstKind: "text" | "tool" | null = null;
  private lastUsageAt = NaN;
  private pendingTools = new Map<string, number>();
  private claude = new Map<string, Usage>();
  private claudeTimings = new Map<string, { tokens: number; ms: number }>();
  private chain = new Map<string, { parent: string | null; at: number; attachment: boolean }>();
  private claudeStarts = new Map<string, { start: number; first: number | null }>();
  private claudeTtft = new Set<string>();

  constructor(readonly provider: "codex" | "claude") {
    this.stats = emptyCounters();
  }

  private addTurn() {
    if (!this.turns.has(this.turn)) this.turnNumbers.set(this.turn, this.turns.size + 1);
    this.turns.add(this.turn);
    this.stats.turns = this.turns.size;
  }
  private timed(output: number, end: number) {
    const start = this.requestStart ?? this.boundary;
    const ms = end - start;
    if (Number.isFinite(ms) && ms >= 100 && ms <= 3_600_000 && output > 0) {
      this.stats.modelMs += ms;
      this.stats.timedOutputTokens += output;
      const first = this.firstOutput === null ? NaN : this.firstOutput - start;
      if (this.firstKind === "text" && first > 0 && first <= ms) {
        this.stats.ttftMs += first;
        this.stats.ttftSteps++;
      }
    }
    this.boundary = Math.max(end, Number.isFinite(this.boundary) ? this.boundary : end);
    this.lastUsageAt = end;
    this.requestStart = null;
    this.firstOutput = null;
    this.firstKind = null;
  }
  private setUsage(u: Usage) {
    this.stats.inputTokens = u.input;
    this.stats.cachedTokens = u.cached;
    this.stats.cacheWriteTokens = u.write;
    this.stats.outputTokens = u.output;
  }
  apply(value: unknown) {
    const row = record(value);
    const turnBefore = this.turn;
    const before = ADDITIVE.map((key) => this.stats[key]);
    if (this.provider === "codex") this.codex(row);
    else this.claudeRow(row);
    // Per turn: whatever this line changed in the totals goes to the turn it belongs to, so every provider rule above
    // stays the only place a number is worked out.
    const at = time(row.timestamp);
    if (this.turn !== turnBefore) {
      this.settle(turnBefore);
      if (Number.isFinite(at)) this.opened = { turn: this.turn, at };
    }
    const changes = ADDITIVE.map((key, index) => this.stats[key] - before[index]);
    if (changes.every((change) => change === 0)) return;
    let turn = this.turnRecords.get(this.turn);
    if (!turn) {
      const start = this.opened?.turn === this.turn ? this.opened.at : Number.isFinite(at) ? at : 0;
      turn = { turn: 0, startAt: start, endAt: start, steps: 0, inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, modelMs: 0, toolMs: 0 };
      this.turnRecords.set(this.turn, turn);
      if (this.turnRecords.size > TURNS_KEPT) this.dropOldestTurn();
    }
    ADDITIVE.forEach((key, index) => (turn[key] += changes[index]));
    if (Number.isFinite(at)) turn.endAt = Math.max(turn.endAt, at);
  }

  // A turn the log has moved past without model usage (so `turns` never counted it) can get no more changes: changes
  // go to the current turn only. Its changes join the latest counted turn, so only counted turns fill the kept ones.
  private settle(turnId: string) {
    const record = this.turnRecords.get(turnId);
    if (!record || this.turnNumbers.has(turnId)) return;
    let into: TurnReading | null = null;
    let latest = 0;
    for (const [id, other] of this.turnRecords) {
      const number = this.turnNumbers.get(id) ?? 0;
      if (number > latest) [into, latest] = [other, number];
    }
    if (!into) return;
    for (const key of ADDITIVE) into[key] += record[key];
    into.startAt = Math.min(into.startAt, record.startAt);
    into.endAt = Math.max(into.endAt, record.endAt);
    this.turnRecords.delete(turnId);
  }

  // Past TURNS_KEPT, the lowest-numbered counted turn goes (a dropped turn that gets late usage comes back as the
  // lowest and goes again, so the list never runs out of order).
  private dropOldestTurn() {
    let oldest: string | null = null;
    let lowest = Infinity;
    for (const id of this.turnRecords.keys()) {
      const number = this.turnNumbers.get(id);
      if (number !== undefined && number < lowest) [oldest, lowest] = [id, number];
    }
    if (oldest !== null) this.turnRecords.delete(oldest);
  }

  /**
   * What each of the most recent turns added, in turn order, numbered as `turns` counts them. A record whose turn was
   * never counted and not yet settled (the current turn, or one before any counted turn) goes to the counted turn
   * before it, or else the one after, so numbers stay unique and the sums still match the totals. A turn whose net
   * change comes out below zero (lines stamped earlier than ones before them) reads as zero.
   */
  turnReadings(): TurnReading[] {
    const readings: TurnReading[] = [];
    let carried: TurnReading | null = null;
    const merge = (into: TurnReading, from: TurnReading) => {
      for (const key of ADDITIVE) into[key] += from[key];
      into.startAt = Math.min(into.startAt, from.startAt);
      into.endAt = Math.max(into.endAt, from.endAt);
    };
    for (const [id, record] of this.turnRecords) {
      const turn = this.turnNumbers.get(id);
      const copy = { ...record, turn: turn ?? 0 };
      if (turn === undefined) {
        if (readings.length) merge(readings[readings.length - 1], copy);
        else if (carried) merge(carried, copy);
        else carried = copy;
        continue;
      }
      if (carried) merge(copy, carried);
      carried = null;
      readings.push(copy);
    }
    for (const reading of readings) for (const key of ADDITIVE) reading[key] = Math.max(0, reading[key]);
    return readings.sort((a, b) => a.turn - b.turn);
  }
  private codex(row: RecordValue) {
    const p = record(row.payload),
      at = time(row.timestamp);
    if (row.type === "event_msg") {
      if (p.type === "task_started") {
        this.turn = typeof p.turn_id === "string" ? p.turn_id : String(row.timestamp);
        this.boundary = at;
        this.pendingTools.clear();
        this.requestStart = null;
        this.firstOutput = null;
        this.firstKind = null;
      }
      if (p.type === "task_complete" || p.type === "task_completed" || p.type === "turn_aborted") {
        this.boundary = NaN;
        this.pendingTools.clear();
        this.requestStart = null;
        this.firstOutput = null;
        this.firstKind = null;
      }
      if (p.type === "item_completed") {
        const item = record(p.item);
        if (
          (item.type === "Reasoning" || item.type === "AgentMessage") &&
          typeof p.started_at_ms === "number" &&
          Number.isFinite(p.started_at_ms)
        ) {
          this.requestStart ??= this.boundary;
          this.firstKind ??= "text";
          this.firstOutput = Math.min(this.firstOutput ?? p.started_at_ms, p.started_at_ms);
        }
      }
      if (p.type !== "token_count" || this.modern) return;
      const info = record(p.info);
      if (!info.total_token_usage) return;
      const u = codexUsage(info.total_token_usage);
      const prev = this.lastCumulative;
      if (prev && u.input === prev.input && u.output === prev.output) return;
      // Old clients can reset their cumulative counters at compaction/resume.
      if (prev && (u.input < prev.input || u.output < prev.output)) {
        for (const k of Object.keys(u) as (keyof Usage)[]) this.legacyResets[k] += prev[k];
      }
      this.lastCumulative = u;
      this.legacyUsage = {
        input: u.input + this.legacyResets.input,
        cached: u.cached + this.legacyResets.cached,
        write: u.write + this.legacyResets.write,
        output: u.output + this.legacyResets.output,
      };
      const output = prev && u.output >= prev.output ? u.output - prev.output : u.output;
      this.legacySteps++;
      this.stats.steps = this.legacySteps;
      this.addTurn();
      this.setUsage(this.legacyUsage);
      this.timed(output, at);
    }
    if (row.type === "turn_context") {
      if (typeof p.turn_id === "string") this.turn = p.turn_id;
      if (Number.isFinite(at)) this.boundary = at;
    }
    if (row.type === "token_usage_record") {
      const id =
        typeof p.response_id === "string" ? p.response_id : String(row.ordinal ?? row.timestamp);
      if (this.responses.has(id)) return;
      if (!this.modern) {
        this.modern = true;
        // Preserve billed history when a session is resumed with a newer Codex.
        this.modernUsage = { ...this.legacyUsage };
      }
      this.responses.add(id);
      if (typeof p.turn_id === "string") this.turn = p.turn_id;
      const u = codexUsage(p.usage);
      for (const k of Object.keys(u) as (keyof Usage)[]) this.modernUsage[k] += u[k];
      this.stats.steps = this.legacySteps + this.responses.size;
      this.addTurn();
      this.setUsage(this.modernUsage);
      this.timed(u.output, at);
    }
    if (row.type === "response_item") {
      const output =
        p.type === "reasoning" ||
        (p.type === "message" && p.role === "assistant") ||
        p.type === "function_call" ||
        p.type === "custom_tool_call";
      if (
        output &&
        !(this.requestStart === null && at - this.lastUsageAt >= 0 && at - this.lastUsageAt <= 100)
      ) {
        this.requestStart ??= this.boundary;
        this.firstKind ??=
          p.type === "function_call" || p.type === "custom_tool_call" ? "tool" : "text";
      }
      if (p.type === "message" && p.role !== "assistant" && Number.isFinite(at)) this.boundary = at;
      if (
        (p.type === "function_call" || p.type === "custom_tool_call") &&
        typeof p.call_id === "string"
      ) {
        this.pendingTools.set(p.call_id, at);
      }
      if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
        if (typeof p.call_id === "string") this.finishTool(p.call_id, at);
        // A parallel batch resumes inference after its last result, not its first.
        if (this.pendingTools.size === 0) this.boundary = at;
      }
    }
  }

  private finishTool(id: string, end: number) {
    const start = this.pendingTools.get(id);
    if (start !== undefined && Number.isFinite(end - start))
      this.stats.toolMs += Math.max(0, end - start);
    this.pendingTools.delete(id);
  }

  private claudeRow(row: RecordValue) {
    if (row.isSidechain === true || row.isApiErrorMessage === true) return;
    const msg = record(row.message),
      at = time(row.timestamp);
    if (typeof row.uuid === "string")
      this.chain.set(row.uuid, {
        parent: typeof row.parentUuid === "string" ? row.parentUuid : null,
        at,
        attachment: row.type === "attachment",
      });
    const content = Array.isArray(msg.content) ? msg.content.map(record) : [];
    if (row.type === "user") {
      for (const block of content) {
        if (block.type === "tool_result" && typeof block.tool_use_id === "string")
          this.finishTool(block.tool_use_id, at);
      }
      if (!content.some((c) => c.type === "tool_result") && row.isMeta !== true) {
        this.turn = typeof row.uuid === "string" ? row.uuid : String(row.timestamp);
      }
      this.boundary = at;
    }
    if (row.type !== "assistant" || !msg.usage || typeof msg.id !== "string") return;
    for (const block of content) {
      if (
        block.type === "tool_use" &&
        typeof block.id === "string" &&
        !this.pendingTools.has(block.id)
      )
        this.pendingTools.set(block.id, at);
    }
    const raw = record(msg.usage);
    const u: Usage = {
      input:
        count(raw.input_tokens) +
        count(raw.cache_read_input_tokens) +
        count(raw.cache_creation_input_tokens),
      cached: count(raw.cache_read_input_tokens),
      write: count(raw.cache_creation_input_tokens),
      output: count(raw.output_tokens),
    };
    const prev = this.claude.get(msg.id);
    let timing = this.claudeStarts.get(msg.id);
    if (!timing) {
      let parent = typeof row.parentUuid === "string" ? row.parentUuid : null;
      let start = this.boundary;
      for (let hop = 0; parent && hop < 32; hop++) {
        const node = this.chain.get(parent);
        if (!node) break;
        if (!node.attachment) {
          start = node.at;
          break;
        }
        parent = node.parent;
      }
      const firstBlock = row.apiBlockIndex === undefined || row.apiBlockIndex === 0;
      const duration = count(row.thinkingDurationMs);
      const first =
        firstBlock && content[0]?.type === "thinking" && duration > 0 ? at - duration : null;
      timing = { start, first };
      this.claudeStarts.set(msg.id, timing);
    }
    this.claude.set(msg.id, u);
    this.stats.inputTokens += u.input - (prev?.input ?? 0);
    this.stats.cachedTokens += u.cached - (prev?.cached ?? 0);
    this.stats.cacheWriteTokens += u.write - (prev?.write ?? 0);
    this.stats.outputTokens += u.output - (prev?.output ?? 0);
    this.stats.steps = this.claude.size;
    this.addTurn();
    const prior = this.claudeTimings.get(msg.id);
    const ms = at - timing.start;
    if (Number.isFinite(ms) && ms > 0) {
      this.stats.modelMs += ms - (prior?.ms ?? 0);
      this.stats.timedOutputTokens += u.output - (prior?.tokens ?? 0);
      this.claudeTimings.set(msg.id, { tokens: u.output, ms });
    }
    const first = timing.first === null ? NaN : timing.first - timing.start;
    if (
      typeof msg.stop_reason === "string" &&
      !this.claudeTtft.has(msg.id) &&
      ms >= 100 &&
      ms <= 3_600_000 &&
      first > 0 &&
      first <= ms
    ) {
      this.claudeTtft.add(msg.id);
      this.stats.ttftMs += first;
      this.stats.ttftSteps++;
    }
  }
}
