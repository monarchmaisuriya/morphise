// Activity: what chats did (prompts, skills, MCP tools, shell, file reads and writes) counted from each chat's own log
// on the daemon, for the Stats popover's Tools section and the Workbench's Activity tab. Metrics, rankings and insights
// after Activity by koinzhang (koinzhang/paseo-plugins, activity/, MIT, see NOTICE.md): shared/classify.ts,
// shared/insights.ts and shared/activity.ts at 83a1c90.
import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// Counts are kept per 15 minutes, so any UTC offset (including +05:30 and +05:45) lands on whole local hours and days.
export const SLOT_MS = 15 * 60 * 1000;
export const slotOf = (ms: number) => Math.floor(ms / SLOT_MS);

// One 15-minute slot of one chat: prompts, skill calls, MCP calls, shell calls, file reads, file writes, and the model
// each prompt went to.
export interface SlotCounts {
  p: number;
  k: number;
  m: number;
  x: number;
  r: number;
  w: number;
  models?: Record<string, number>;
}
export const emptySlot = (): SlotCounts => ({ p: 0, k: 0, m: 0, x: 0, r: 0, w: 0 });

export interface NamedUse {
  count: number;
  failures: number;
  lastAt: number;
}

// Everything one chat's log says, as numbers and names only (no conversation text).
export interface ChatActivity {
  slots: Record<string, SlotCounts>;
  skills: Record<string, NamedUse>;
  mcp: Record<string, NamedUse>;
  // A file write, or a shell command that changes files or the repo, happened in this chat.
  coding: boolean;
}

const count = z.number().int().nonnegative();
const namedUse = z.object({ name: z.string().max(300), count, failures: count, lastAt: z.number() });
export type NamedUseRow = z.infer<typeof namedUse>;

// The chat's totals, as the Stats popover shows them.
export const chatToolsSchema = z.object({
  prompts: count,
  skillCalls: count,
  mcpCalls: count,
  mcpFailures: count,
  shellCalls: count,
  fileReads: count,
  fileWrites: count,
  toolsExplored: count,
  skills: z.array(namedUse).max(50),
  mcp: z.array(namedUse).max(50),
});
export type ChatTools = z.infer<typeof chatToolsSchema>;

const LIST_MAX = 50;
const ranked = (uses: Record<string, NamedUse>): NamedUseRow[] =>
  Object.entries(uses)
    .map(([name, use]) => ({ name, ...use }))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt || a.name.localeCompare(b.name))
    .slice(0, LIST_MAX);

export function chatTools(activity: ChatActivity): ChatTools {
  const total = emptySlot();
  for (const slot of Object.values(activity.slots)) for (const key of ["p", "k", "m", "x", "r", "w"] as const) total[key] += slot[key];
  return {
    prompts: total.p,
    skillCalls: total.k,
    mcpCalls: total.m,
    mcpFailures: Object.values(activity.mcp).reduce((sum, use) => sum + use.failures, 0),
    shellCalls: total.x,
    fileReads: total.r,
    fileWrites: total.w,
    toolsExplored: Object.keys(activity.skills).length + Object.keys(activity.mcp).length,
    skills: ranked(activity.skills),
    mcp: ranked(activity.mcp),
  };
}

// --- The Activity tab ---

export const activitySettings = defineSettings({ id: "activity", scope: "host", version: 1, schema: z.object({ enabled: z.boolean().default(true) }) });

export const ACTIVITY_METRICS = ["sessions", "prompts", "skills", "mcp"] as const;
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];
const metricValues = z.object({ sessions: count, prompts: count, skills: count, mcp: count });
export type MetricValues = z.infer<typeof metricValues>;

// `trend`: the value per local day over the last 14 days, oldest first (Sessions and Prompts only).
const kpi = z.object({ label: z.string(), value: z.string(), detail: z.string().nullable(), change: z.number().nullable(), trend: z.array(z.number()).optional() });
const ranking = z.object({ key: z.string(), label: z.string(), values: metricValues });
const insight = z.object({ label: z.string(), value: z.string() });
const top = z.object({ name: z.string(), count, detail: z.string().nullable() });

export const activitySummarySchema = z.object({
  indexing: z.object({ done: count, total: count, errors: count }),
  providers: z.array(z.string()),
  kpis: z.array(kpi),
  // 52 weeks Sunday to Saturday, oldest first; each cell is skills + MCP + sessions + prompts that local day.
  heatmap: z.object({ firstDay: z.string(), cells: z.array(count) }),
  // Agents created per local day, last 30 days, by provider.
  creations: z.array(z.object({ day: z.string(), byProvider: z.record(z.string(), count) })),
  // The last 168 local hours, oldest first.
  hourly: z.array(z.object({ hour: z.number(), values: metricValues })),
  rankings: z.object({ providers: z.array(ranking), projects: z.array(ranking) }),
  insights: z.array(insight),
  top: z.object({ skills: z.array(top), mcp: z.array(top), models: z.array(top) }),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activitySummary = defineRpc({
  name: "morphise.activity.summary",
  input: z.object({ provider: z.string().max(100).nullable(), workspaceId: z.string().max(300).nullable(), tzOffsetMinutes: z.number().int().min(-840).max(840) }),
  output: activitySummarySchema,
});

// One agent as the summary sees it.
export interface ActivityAgent {
  provider: string;
  workspaceId: string | null;
  project: string | null;
  createdAt: number;
  activity: ChatActivity | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const IDLE_GAP_SLOTS = 2; // 30 minutes without activity ends a session
const TOP = 8;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Local day number (days since 1970-01-01 local) of a UTC time.
const localDay = (ms: number, offsetMs: number) => Math.floor((ms + offsetMs) / DAY_MS);
const dayLabel = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");
const change = (current: number, previous: number) => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null);

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function bump<K>(map: Map<K, number>, key: K, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}
const leader = <K extends string | number>(map: Map<K, number>): [K, number] | null => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] ?? null;

// The Activity tab from the index. `now` and the offset decide local days; everything is counted in local time.
export function summarize(agents: readonly ActivityAgent[], options: { now: number; tzOffsetMinutes: number; indexing: ActivitySummary["indexing"]; providers: string[] }): ActivitySummary {
  const offsetMs = options.tzOffsetMinutes * 60 * 1000;
  const today = localDay(options.now, offsetMs);
  const week = (day: number) => (day > today - 7 ? 0 : day > today - 14 ? 1 : -1);

  const sessions = [0, 0];
  const prompts = [0, 0];
  const providerWeek = [new Map<string, number>(), new Map<string, number>()];
  const modelWeek = [new Map<string, number>(), new Map<string, number>()];
  const perDay = new Map<number, number>();
  const promptsPerDay = new Map<number, number>();
  const creations = new Map<number, Map<string, number>>();
  const firstHour = Math.floor((options.now + offsetMs) / HOUR_MS) - 167;
  const hourly = Array.from({ length: 168 }, () => ({ sessions: 0, prompts: 0, skills: 0, mcp: 0 }));
  const providerRank = new Map<string, MetricValues>();
  const projectRank = new Map<string, MetricValues>();
  const skills = new Map<string, number>();
  const mcp = new Map<string, number>();
  const mcpFailures = new Map<string, number>();
  const models = new Map<string, number>();
  const workspaces = new Set<string>();
  let active = 0;
  let coding = 0;
  let multiTurn = 0;
  let sessionCount = 0;
  let sessionMinutes = 0;

  const rank = (map: Map<string, MetricValues>, key: string) => {
    let values = map.get(key);
    if (!values) map.set(key, (values = { sessions: 0, prompts: 0, skills: 0, mcp: 0 }));
    return values;
  };

  for (const agent of agents) {
    const created = localDay(agent.createdAt, offsetMs);
    const projectKey = agent.project ?? "Other";
    rank(providerRank, agent.provider).sessions++;
    rank(projectRank, projectKey).sessions++;
    bump(perDay, created);
    const w = week(created);
    if (w >= 0) {
      sessions[w]++;
      bump(providerWeek[w], agent.provider);
    }
    if (created > today - 30) {
      let byProvider = creations.get(created);
      if (!byProvider) creations.set(created, (byProvider = new Map()));
      bump(byProvider, agent.provider);
    }
    const createdHour = Math.floor((agent.createdAt + offsetMs) / HOUR_MS) - firstHour;
    if (createdHour >= 0 && createdHour < 168) hourly[createdHour].sessions++;
    if (agent.workspaceId) workspaces.add(agent.workspaceId);

    const activity = agent.activity;
    if (!activity) continue;
    if (activity.coding) coding++;
    let agentPrompts = 0;
    const slots = Object.keys(activity.slots)
      .map(Number)
      .sort((a, b) => a - b);
    if (slots.length) active++;
    let runStart: number | null = null;
    let last: number | null = null;
    for (const slot of slots) {
      const counts = activity.slots[slot];
      const ms = slot * SLOT_MS;
      const day = localDay(ms, offsetMs);
      bump(perDay, day, counts.p + counts.k + counts.m);
      bump(promptsPerDay, day, counts.p);
      agentPrompts += counts.p;
      const sw = week(day);
      if (sw >= 0) {
        prompts[sw] += counts.p;
        for (const [model, n] of Object.entries(counts.models ?? {})) bump(modelWeek[sw], model, n);
      }
      const hour = Math.floor((ms + offsetMs) / HOUR_MS) - firstHour;
      if (hour >= 0 && hour < 168) {
        hourly[hour].prompts += counts.p;
        hourly[hour].skills += counts.k;
        hourly[hour].mcp += counts.m;
      }
      for (const map of [rank(providerRank, agent.provider), rank(projectRank, projectKey)]) {
        map.prompts += counts.p;
        map.skills += counts.k;
        map.mcp += counts.m;
      }
      for (const [model, n] of Object.entries(counts.models ?? {})) bump(models, model, n);
      // A session is a run of slots with no gap of 30 minutes or more.
      if (last === null || slot - last > IDLE_GAP_SLOTS) {
        if (runStart !== null && last !== null) {
          sessionCount++;
          sessionMinutes += ((last - runStart + 1) * SLOT_MS) / 60000;
        }
        runStart = slot;
      }
      last = slot;
    }
    if (runStart !== null && last !== null) {
      sessionCount++;
      sessionMinutes += ((last - runStart + 1) * SLOT_MS) / 60000;
    }
    if (agentPrompts >= 2) multiTurn++;
    for (const [name, use] of Object.entries(activity.skills)) bump(skills, name, use.count);
    for (const [name, use] of Object.entries(activity.mcp)) {
      bump(mcp, name, use.count);
      bump(mcpFailures, name, use.failures);
    }
  }

  const topProvider = leader(providerWeek[0]);
  const topModel = leader(modelWeek[0]);
  const providerTotal = [...providerWeek[0].values()].reduce((a, b) => a + b, 0);
  const modelTotal = [...modelWeek[0].values()].reduce((a, b) => a + b, 0);
  const fortnight = Array.from({ length: 14 }, (_, index) => today - 13 + index);
  const sessionTrend = fortnight.map((day) => [...(creations.get(day)?.values() ?? [])].reduce((a, b) => a + b, 0));
  const promptTrend = fortnight.map((day) => promptsPerDay.get(day) ?? 0);
  const kpis: ActivitySummary["kpis"] = [
    { label: "Sessions", value: String(sessions[0]), detail: "last 7 days", change: change(sessions[0], sessions[1]), trend: sessionTrend },
    { label: "Prompts", value: String(prompts[0]), detail: "last 7 days", change: change(prompts[0], prompts[1]), trend: promptTrend },
    { label: "Top provider", value: topProvider?.[0] ?? "None", detail: topProvider ? percent(topProvider[1], providerTotal) : null, change: topProvider ? change(topProvider[1], providerWeek[1].get(topProvider[0]) ?? 0) : null },
    { label: "Top model", value: topModel?.[0] ?? "None", detail: topModel ? percent(topModel[1], modelTotal) : null, change: topModel ? change(topModel[1], modelWeek[1].get(topModel[0]) ?? 0) : null },
  ];

  // 52 whole weeks ending with the week of today, Sunday first (day 0 of 1970 was a Thursday, weekday 4).
  const weekday = (day: number) => (((day + 4) % 7) + 7) % 7;
  const firstDay = today - weekday(today) - 51 * 7;
  const cells = Array.from({ length: today - firstDay + 1 }, (_, index) => perDay.get(firstDay + index) ?? 0);

  const creationDays = Array.from({ length: 30 }, (_, index) => {
    const day = today - 29 + index;
    return { day: dayLabel(day), byProvider: Object.fromEntries(creations.get(day) ?? []) };
  });

  const activeDays = [...perDay].filter(([, value]) => value > 0).map(([day]) => day);
  const busiest = leader([...promptsPerDay.values()].some((value) => value > 0) ? promptsPerDay : perDay);
  let streak = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of [...activeDays].sort((a, b) => a - b)) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    streak = Math.max(streak, run);
    previous = day;
  }
  const byWeekday = new Map<string, number>();
  for (const [day, value] of perDay) if (value > 0) bump(byWeekday, WEEKDAYS[weekday(day)], value);
  const peak = leader(byWeekday);
  const insights: ActivitySummary["insights"] = [
    { label: "Active days", value: String(activeDays.length) },
    { label: "Busiest day", value: busiest && busiest[1] > 0 ? `${dayLabel(Number(busiest[0]))} (${busiest[1]})` : "None" },
    { label: "Longest streak", value: `${streak} ${streak === 1 ? "day" : "days"}` },
    { label: "Peak weekday", value: peak?.[0] ?? "None" },
    { label: "Workspaces", value: String(workspaces.size) },
    { label: "Coding share", value: percent(coding, active) },
    { label: "Multi-turn share", value: percent(multiTurn, agents.filter((agent) => agent.activity && chatPrompts(agent.activity) > 0).length) },
    { label: "Average session", value: sessionCount ? formatMinutes(sessionMinutes / sessionCount) : "None" },
  ];

  const ranked = (map: Map<string, MetricValues>) => [...map].map(([key, values]) => ({ key, label: key, values })).sort((a, b) => b.values.sessions - a.values.sessions || a.key.localeCompare(b.key));
  const topOf = (map: Map<string, number>, detail?: (name: string) => string | null) =>
    [...map]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP)
      .map(([name, n]) => ({ name, count: n, detail: detail?.(name) ?? null }));

  return {
    indexing: options.indexing,
    providers: options.providers,
    kpis,
    heatmap: { firstDay: dayLabel(firstDay), cells },
    creations: creationDays,
    hourly: hourly.map((values, index) => ({ hour: (firstHour + index) * HOUR_MS - offsetMs, values })),
    rankings: { providers: ranked(providerRank), projects: ranked(projectRank) },
    insights,
    top: {
      skills: topOf(skills),
      mcp: topOf(mcp, (name) => (mcpFailures.get(name) ? `${mcpFailures.get(name)} failed` : null)),
      models: topOf(models, () => "prompts"),
    },
  };
}

function chatPrompts(activity: ChatActivity) {
  let total = 0;
  for (const slot of Object.values(activity.slots)) total += slot.p;
  return total;
}
