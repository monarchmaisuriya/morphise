import { describe, expect, it } from "vitest";
import { type ActivityAgent, type ChatActivity, emptySlot, type SlotCounts, slotOf, summarize } from "./activity";

const IST = 330; // +05:30
const now = Date.parse("2026-11-17T12:00:00Z"); // 17:30 local
const indexing = { done: 1, total: 1, errors: 0 };
const activity = (entries: [string, Partial<SlotCounts>][], extra: Partial<ChatActivity> = {}): ChatActivity => ({
  slots: Object.fromEntries(entries.map(([iso, counts]) => [String(slotOf(Date.parse(iso))), { ...emptySlot(), ...counts }])),
  skills: {},
  mcp: {},
  coding: false,
  ...extra,
});
const agent = (createdAt: string, chat: ChatActivity | null, extra: Partial<ActivityAgent> = {}): ActivityAgent => ({ provider: "claude", workspaceId: "w1", project: "api", createdAt: Date.parse(createdAt), activity: chat, ...extra });
const run = (agents: ActivityAgent[]) => summarize(agents, { now, tzOffsetMinutes: IST, indexing, providers: ["claude"] });

describe("summarize", () => {
  it("puts a prompt at 23:50 local on that local day, not the UTC one", () => {
    // 2026-11-16 18:20 UTC is 2026-11-16 23:50 at +05:30; 18:35 UTC is 00:05 on the 17th.
    const summary = run([agent("2026-11-01T00:00:00Z", activity([["2026-11-16T18:20:00Z", { p: 1 }], ["2026-11-16T18:35:00Z", { p: 2 }]]))]);
    const first = Date.parse(`${summary.heatmap.firstDay}T00:00:00Z`) / 86_400_000;
    const cell = (day: string) => summary.heatmap.cells[Date.parse(`${day}T00:00:00Z`) / 86_400_000 - first];
    expect(cell("2026-11-16")).toBe(1);
    expect(cell("2026-11-17")).toBe(2);
    expect(summary.heatmap.cells.length % 7).toBe(3); // 51 whole weeks plus Sunday to Tuesday (the 17th is a Tuesday)
  });

  it("compares the last 7 local days with the 7 before", () => {
    const summary = run([
      agent("2026-11-16T05:00:00Z", activity([["2026-11-16T05:00:00Z", { p: 3, models: { "claude-opus-5-5": 3 } }]])),
      agent("2026-11-15T05:00:00Z", null),
      agent("2026-11-05T05:00:00Z", activity([["2026-11-05T05:00:00Z", { p: 2, models: { "claude-opus-5-5": 2 } }]])),
    ]);
    expect(summary.kpis).toEqual([
      { label: "Sessions", value: "2", detail: "last 7 days", change: 100, trend: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0] },
      { label: "Prompts", value: "3", detail: "last 7 days", change: 50, trend: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0] },
      { label: "Top provider", value: "claude", detail: "100%", change: 100 },
      { label: "Top model", value: "claude-opus-5-5", detail: "100%", change: 50 },
    ]);
  });

  it("draws 168 local hours ending now, and 30 days of creations by provider", () => {
    const summary = run([agent("2026-11-17T11:40:00Z", activity([["2026-11-17T11:40:00Z", { p: 1, k: 2, m: 3 }]]), { provider: "codex" })]);
    expect(summary.hourly).toHaveLength(168);
    expect(summary.hourly.at(-1)?.values).toEqual({ sessions: 1, prompts: 1, skills: 2, mcp: 3 });
    expect(summary.creations).toHaveLength(30);
    expect(summary.creations.at(-1)).toEqual({ day: "2026-11-17", byProvider: { codex: 1 } });
  });

  it("works out the insights", () => {
    const summary = run([
      agent("2026-11-14T04:00:00Z", activity([["2026-11-14T04:00:00Z", { p: 1, models: { "m-1": 1 } }], ["2026-11-14T04:15:00Z", { p: 1 }], ["2026-11-15T04:00:00Z", { k: 1 }]], { coding: true, skills: { review: { count: 1, failures: 0, lastAt: 0 } } })),
      agent("2026-11-16T04:00:00Z", activity([["2026-11-16T04:00:00Z", { p: 1, x: 1200, r: 5, w: 2, models: { "m-2": 1 } }]], { mcp: { "notion.search": { count: 4, failures: 1, lastAt: 0 } } }), { workspaceId: "w2" }),
    ]);
    const value = (label: string) => summary.insights.find((row) => row.label === label)?.value;
    expect(value("Active days")).toBe("3");
    expect(value("Longest streak")).toBe("3 days");
    expect(value("Workspaces")).toBe("2");
    expect(value("Coding share")).toBe("50%");
    expect(value("Multi-turn share")).toBe("50%");
    // Sessions: 30m (two slots), 15m, 15m.
    expect(value("Average session")).toBe("20m");
    expect(value("Busiest day")).toBe("2026-11-14 (2)");
    // Every slot is 09:30 or 09:45 local; the 14th to the 16th are active and today (the 17th) not yet.
    expect(value("Peak hour")).toBe("09:00-10:00");
    expect(value("Current streak")).toBe("3 days");
    expect(value("Prompts per active day")).toBe("1");
    expect(value("Longest session")).toBe("30m");
    expect(value("Commands run")).toBe("1,200");
    expect(value("Files edited")).toBe("2");
    expect(value("Files read")).toBe("5");
    expect(value("MCP failure rate")).toBe("25%");
    expect(value("Tools tried")).toBe("2");
    expect(value("Models used")).toBe("2");
    expect(summary.insights.map((row) => row.label)).toEqual([
      "Active days", "Busiest day", "Longest streak", "Peak weekday", "Workspaces", "Coding share", "Multi-turn share", "Average session",
      "Peak hour", "Current streak", "Prompts per active day", "Longest session",
      "Commands run", "Files edited", "Files read", "MCP failure rate",
      "Tools tried", "Models used",
    ]);
  });

  it("ranks providers and projects, and lists the top skills, MCP tools and models", () => {
    const summary = run([
      agent("2026-11-16T04:00:00Z", activity([["2026-11-16T04:00:00Z", { p: 1, k: 1, m: 2, models: { "m-1": 1 } }]], { skills: { review: { count: 1, failures: 0, lastAt: 0 } }, mcp: { "notion.search": { count: 2, failures: 1, lastAt: 0 } } })),
      agent("2026-11-16T04:00:00Z", null, { provider: "opencode", project: null }),
    ]);
    expect(summary.rankings.providers.map((row) => [row.key, row.values.sessions])).toEqual([["claude", 1], ["opencode", 1]]);
    expect(summary.rankings.projects.map((row) => row.key).sort()).toEqual(["Other", "api"]);
    expect(summary.top).toEqual({ skills: [{ name: "review", count: 1, detail: null }], mcp: [{ name: "notion.search", count: 2, detail: "1 failed" }], models: [{ name: "m-1", count: 1, detail: "prompts" }] });
  });

  it("is empty but well formed with no agents", () => {
    const summary = run([]);
    expect(summary.kpis[0].value).toBe("0");
    expect(summary.insights.find((row) => row.label === "Average session")?.value).toBe("None");
    expect(summary.insights.find((row) => row.label === "Peak hour")?.value).toBe("None");
    expect(summary.insights.find((row) => row.label === "MCP failure rate")?.value).toBe("None");
    expect(summary.top.skills).toEqual([]);
  });
});
