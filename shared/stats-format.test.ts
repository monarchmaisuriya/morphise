import { describe, expect, it } from "vitest";
import { chatTools } from "./activity";
const NO_TOOLS = chatTools({ slots: {}, skills: {}, mcp: {}, coding: false });
import { emptyCounters } from "./stats";
import { activityRows, agentIdFromTab, rankedUses, timeSplit, tokenParts, cacheHitTone, headerLabel, formatDuration, formatShare, formatSpeed, formatTokens, pillLabel, stripText, usageRows } from "./stats-format";

describe("stats formatting", () => {
  it("shortens token counts", () => {
    expect([0, 999, 1234, 98_765, 1_250_000].map(formatTokens)).toEqual(["0", "999", "1.2k", "98.8k", "1.3M"]);
  });

  it("reads durations in ms, seconds, then minutes", () => {
    expect([850, 12_340, 245_000].map(formatDuration)).toEqual(["850 ms", "12.3 s", "4m 05s"]);
  });

  it("shows a dash for a reading the log cannot give", () => {
    expect([formatSpeed(null), formatShare(null), formatDuration(null)]).toEqual(["-", "-", "-"]);
  });

  it("rounds speed and shares, never showing 100% for a share just under it", () => {
    expect([formatSpeed(47.6), formatShare(0.8734), formatShare(0.9996), formatShare(1)]).toEqual(["48 t/s", "87.3%", "99.9%", "100%"]);
  });
});

describe("stats readings as shown", () => {
  const stats = { ...emptyCounters(), turns: 3, steps: 12, inputTokens: 10_000, cachedTokens: 8_000, cacheWriteTokens: 0, outputTokens: 2_000, timedOutputTokens: 2_000, modelMs: 40_000, toolMs: 5_000, ttftMs: 1_200, ttftSteps: 2 };

  it("labels each pill at a glance, or says why there is no reading", () => {
    expect(pillLabel("activity", { status: "ready", provider: "claude", partial: false, tools: NO_TOOLS, stats })).toBe("12 steps · 50 t/s");
    expect(pillLabel("usage", { status: "ready", provider: "claude", partial: false, tools: NO_TOOLS, stats })).toBe("12.0k · 80% cached");
    expect([pillLabel("usage", null), pillLabel("usage", { status: "unavailable", reason: "x" }), pillLabel("usage", { status: "error", error: "x" })]).toEqual(["…", "No stats", "Log unreadable"]);
  });

  it("lists the activity and usage readings, with cache write only when there was any", () => {
    expect(activityRows(stats).map(([label]) => label)).toEqual(["Turns", "Model steps", "Model time", "Tool time", "Time to first token", "Output speed"]);
    expect(usageRows(stats).map(([label]) => label)).toEqual(["Total tokens", "Cache hit", "Uncached input", "Cache read", "Output"]);
    expect(usageRows({ ...stats, cacheWriteTokens: 5 }).map(([label]) => label)).toContain("Cache write");
  });
});

describe("the strip under the message box", () => {
  it("reads both pills in one line, and finds the chat from Paseo's selected tab", () => {
    expect(stripText({ status: "unavailable", reason: "x" })).toBe("No stats");
    expect(stripText(null)).toBe("…");
    expect(agentIdFromTab("workspace-tab-agent_abd5ffcc-7d85")).toBe("abd5ffcc-7d85");
    expect(agentIdFromTab("workspace-tab-terminal_1")).toBeNull();
  });
});

describe("the stats button in the top bar", () => {
  it("shows the open chat's tokens and cache hit, or just Stats when there is no reading", () => {
    const stats = { ...emptyCounters(), inputTokens: 1_400_000, cachedTokens: 1_289_400, outputTokens: 100_000 };
    expect(headerLabel({ status: "ready", provider: "claude", partial: false, tools: NO_TOOLS, stats })).toBe("1.5M · 92.1%");
    expect([headerLabel(null), headerLabel({ status: "unavailable", reason: "x" }), headerLabel({ status: "error", error: "x" })]).toEqual(["Stats", "Stats", "Stats"]);
  });
});

describe("the cache-hit bar's colour", () => {
  it("is good from 80%, fair from 50%, and poor below", () => {
    expect([0.992, 0.8, 0.79, 0.5, 0.49, 0].map(cacheHitTone)).toEqual(["good", "good", "fair", "fair", "poor", "poor"]);
  });
});

describe("tokenParts", () => {
  it("splits the total into cache read, cache write, output and new input that add up to it", () => {
    const stats = { ...emptyCounters(), inputTokens: 1000, cachedTokens: 900, cacheWriteTokens: 60, outputTokens: 200 };
    const parts = tokenParts(stats);
    expect(parts.map((part) => [part.key, part.tokens])).toEqual([["cacheRead", 900], ["cacheWrite", 60], ["output", 200], ["newInput", 40]]);
    expect(parts.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1);
    expect(tokenParts(emptyCounters()).every((part) => part.share === 0)).toBe(true);
  });
  it("splits model time from tool time", () => {
    expect(timeSplit({ ...emptyCounters(), modelMs: 300, toolMs: 100 })).toEqual({ modelShare: 0.75 });
    expect(timeSplit(emptyCounters())).toBeNull();
  });
  it("ranks skills and MCP tools together", () => {
    const tools = chatTools({ slots: {}, skills: { plan: { count: 2, failures: 0, lastAt: 5 } }, mcp: { "notion.search": { count: 9, failures: 1, lastAt: 1 }, "slack.read": { count: 2, failures: 0, lastAt: 9 } }, coding: false });
    expect(rankedUses(tools).map((use) => [use.name, use.kind])).toEqual([["notion.search", "mcp"], ["slack.read", "mcp"], ["plan", "skill"]]);
  });
});
