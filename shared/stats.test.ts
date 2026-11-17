import { describe, expect, it } from "vitest";
import { chatTools } from "./activity";
const NO_TOOLS = chatTools({ slots: {}, skills: {}, mcp: {}, coding: false });
import { cacheHitShare, emptyCounters, outputSpeed, statsRead, statsSettings, timeToFirstToken, totalTokens, uncachedInput } from "./stats";

const counters = (patch: Partial<ReturnType<typeof emptyCounters>> = {}) => ({ ...emptyCounters(), ...patch });

describe("stats formulas", () => {
  it("counts input (which already holds cache reads and writes) plus output as the total", () => {
    expect(totalTokens(counters({ inputTokens: 1000, cachedTokens: 600, cacheWriteTokens: 300, outputTokens: 100 }))).toBe(1100);
  });

  it("gives the input that was neither read from nor written to the cache, never below zero", () => {
    expect(uncachedInput(counters({ inputTokens: 1000, cachedTokens: 600, cacheWriteTokens: 300 }))).toBe(100);
    expect(uncachedInput(counters({ inputTokens: 10, cachedTokens: 20 }))).toBe(0);
  });

  it("measures speed only over timed output, and has none without timing", () => {
    expect(outputSpeed(counters({ timedOutputTokens: 300, modelMs: 6000 }))).toBe(50);
    expect(outputSpeed(counters({ timedOutputTokens: 300, modelMs: 0 }))).toBeNull();
    expect(outputSpeed(counters({ timedOutputTokens: 0, modelMs: 6000 }))).toBeNull();
  });

  it("averages time to first token over the steps that had one", () => {
    expect(timeToFirstToken(counters({ ttftMs: 3000, ttftSteps: 2 }))).toBe(1500);
    expect(timeToFirstToken(counters())).toBeNull();
  });

  it("has no cache hit share without input, and a near-full hit stays below 1", () => {
    expect(cacheHitShare(counters())).toBeNull();
    expect(cacheHitShare(counters({ inputTokens: 1000, cachedTokens: 600 }))).toBe(0.6);
    expect(cacheHitShare(counters({ inputTokens: 100000, cachedTokens: 99999 }))).toBeLessThan(1);
    expect(cacheHitShare(counters({ inputTokens: 10, cachedTokens: 20 }))).toBe(1);
  });
});

describe("stats contracts", () => {
  it("default the host document to stats on and the desktop strip off", () => {
    expect(statsSettings.schema.parse({})).toEqual({ enabled: true, desktopStrip: false });
    expect(statsSettings.id).toBe("stats");
  });

  it("answer with numbers only: a ready read carries no string beyond the status and provider", () => {
    const ready = { status: "ready", provider: "claude", partial: false, tools: NO_TOOLS, stats: counters({ turns: 1 }) };
    expect(statsRead.output.parse(ready)).toEqual(ready);
    expect(() => statsRead.output.parse({ ...ready, stats: { ...ready.stats, text: "hello" } })).not.toThrow();
    expect(statsRead.output.parse({ ...ready, stats: { ...ready.stats, text: "hello" } })).toEqual(ready);
    expect(() => statsRead.output.parse({ ...ready, provider: "opencode" })).toThrow();
    expect(statsRead.output.parse({ status: "unavailable", reason: "No log yet" })).toEqual({ status: "unavailable", reason: "No log yet" });
    expect(statsRead.output.parse({ status: "error", error: "Log unreadable" })).toEqual({ status: "error", error: "Log unreadable" });
    expect(statsRead.name).toBe("morphise.stats.read");
  });

  it("refuses an empty agent id", () => {
    expect(() => statsRead.input.parse({ agentId: "" })).toThrow();
  });
});
