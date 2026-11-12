import { describe, expect, it } from "vitest";
import {
  agentsBoardSchema,
  applyDensity,
  assignLanes,
  type BoardAgent,
  CARD_PRESETS,
  compareAgents,
  contextShare,
  DEFAULT_AGENTS_BOARD,
  densityOf,
  dueForRefresh,
  effectiveCard,
  filterGroups,
  labelLimitCount,
  matchesFilter,
  moveFocus,
  NO_FILTER,
  readBoardAgent,
  readUsage,
  applyAgentUpdate,
  entriesFromSnapshot,
  setCardSetting,
  folderAddsSomething,
  foldedLanes,
  LANE_MAX,
  LANE_MIN,
  modelLabel,
  laneFolded,
  openLaneWidth,
  agentHeadline,
  shortLinks,
  listSections,
  rowLine,
  LIST_PREVIEW,
  updatedWithinMs,
  shownStatus,
  statusGroups,
  clearKeyOf,
  laneStatus,
  LANES,
} from "./agents-board";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const NOW_FILTER = (part: Partial<typeof NO_FILTER>) => ({ ...NO_FILTER, ...part });
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

function agent(id: string, overrides: Partial<BoardAgent> = {}): BoardAgent {
  return {
    id,
    title: id,
    provider: "claude",
    model: null,
    thinking: null,
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissions: [],
    parentId: null,
    workspaceId: "w1",
    cwd: "/code/app",
    projectKey: null,
    project: null,
    workspace: null,
    branch: null,
    labels: [],
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(1),
    lastUserMessageAt: null,
    attentionAt: null,
    archivedAt: null,
    turnStartedAt: null,
    sessionId: null,
    lastError: null,
    context: null,
    workspaceOpen: true,
    ...overrides,
  };
}

const lanesOf = (agents: BoardAgent[], options: Partial<Parameters<typeof assignLanes>[1]> = {}) => {
  const lanes = assignLanes(agents, { now: NOW, doneWindow: "7d", showArchived: true, showSubtasks: true, ...options });
  return Object.fromEntries(Object.entries(lanes).map(([lane, list]) => [lane, list.map((item) => item.id)]));
};

describe("agents board settings", () => {
  it("defaults: view on, standard density, 2 labels, 7 days, default width, subtasks, archived and empty groups on, phone cards full", () => {
    expect(DEFAULT_AGENTS_BOARD).toEqual({
      enabled: true,
      density: "standard",
      card: { ...CARD_PRESETS.standard.fields, labelLimit: "2" },
      board: { doneWindow: "7d", laneWidth: "default", showSubtasks: true, showArchived: true, showEmptyGroups: true },
      phone: { minimalCards: false },
    });
  });

  it("keeps every good value when one is unusable", () => {
    const parsed = agentsBoardSchema.parse({ enabled: "yes", density: "full", card: { ...CARD_PRESETS.full.fields, model: 3, labelLimit: "9" }, board: { doneWindow: "24h", laneWidth: "huge" } });
    expect(parsed.enabled).toBe(true);
    expect(parsed.density).toBe("full");
    expect(parsed.card.model).toBe(true);
    expect(parsed.card.path).toBe(true);
    expect(parsed.card.labelLimit).toBe("2");
    expect(parsed.board.doneWindow).toBe("24h");
    expect(parsed.board.laneWidth).toBe("default");
  });

  it("a preset sets all 16 fields and the label limit at once", () => {
    const full = applyDensity(DEFAULT_AGENTS_BOARD, "full");
    expect(full.density).toBe("full");
    expect(Object.values(full.card).filter((value) => value === true)).toHaveLength(16);
    expect(full.card.labelLimit).toBe("all");
    expect(applyDensity(full, "minimal").card).toEqual({ ...CARD_PRESETS.minimal.fields, labelLimit: "2" });
  });

  it("editing one field makes the density custom, and matching a preset again names it", () => {
    const edited = setCardSetting(DEFAULT_AGENTS_BOARD, "branch", false);
    expect(edited.density).toBe("custom");
    expect(edited.card.branch).toBe(false);
    expect(setCardSetting(edited, "branch", true).density).toBe("standard");
  });

  it("the label limit only decides the density while labels show", () => {
    expect(densityOf({ ...CARD_PRESETS.standard.fields, labelLimit: "3" })).toBe("custom");
    expect(densityOf({ ...CARD_PRESETS.minimal.fields, labelLimit: "3" })).toBe("minimal");
  });

  it("phones draw the minimal card only when that switch is on", () => {
    const phone = { ...DEFAULT_AGENTS_BOARD, phone: { minimalCards: true } };
    expect(effectiveCard(phone, true).branch).toBe(false);
    expect(effectiveCard(phone, false).branch).toBe(true);
    expect(effectiveCard(DEFAULT_AGENTS_BOARD, true).branch).toBe(true);
    expect(labelLimitCount("all")).toBe(Number.POSITIVE_INFINITY);
    expect(labelLimitCount("3")).toBe(3);
  });
});

describe("readBoardAgent", () => {
  const entry = {
    agent: {
      id: "a1",
      provider: "codex",
      cwd: "/code/app/packages/web",
      workspaceId: "w1",
      model: "gpt-5",
      effectiveThinkingOptionId: "high",
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(1),
      lastUserMessageAt: hoursAgo(2),
      status: "running",
      activeTurn: { turnId: "t", startedAt: hoursAgo(0.5) },
      pendingPermissions: [{ id: "p" }],
      runtimeInfo: { provider: "codex", sessionId: "s-1" },
      lastUsage: { contextWindowUsedTokens: 50_000, contextWindowMaxTokens: 200_000 },
      title: null,
      labels: { "paseo.parent-agent-id": "parent" },
      requiresAttention: true,
      attentionReason: "permission",
      archivedAt: null,
    },
    project: { projectKey: "k1", projectName: "App", workspaceName: "feature", checkout: { isGit: true, currentBranch: "main", cwd: "/code/app" } },
  };

  it("takes Paseo's fields, the parent from its label, and the workspace's labels", () => {
    const read = readBoardAgent(entry, (id) => (id === "w1" ? { name: "Feature", project: "App", labels: ["urgent"], open: true } : undefined));
    expect(read).toMatchObject({
      id: "a1",
      title: "codex",
      provider: "codex",
      model: "gpt-5",
      thinking: "high",
      parentId: "parent",
      projectKey: "k1",
      project: "App",
      workspace: "feature",
      branch: "main",
      labels: ["urgent"],
      turnStartedAt: hoursAgo(0.5),
      sessionId: "s-1",
      context: { used: 50_000, max: 200_000 },
    });
    expect(read?.pendingPermissions).toHaveLength(1);
  });

  it("leaves what Paseo did not give empty instead of guessing", () => {
    const read = readBoardAgent({ agent: { id: "a2", provider: "claude", cwd: "/x", status: "idle", createdAt: "c", updatedAt: "u" } }, () => undefined);
    expect(read).toMatchObject({ model: null, thinking: null, project: null, workspace: null, branch: null, labels: [], context: null, sessionId: null });
    expect(readBoardAgent({ agent: { provider: "claude" } }, () => undefined)).toBeNull();
  });
});

describe("assignLanes", () => {
  it("puts each status in its lane by the sidebar's rule", () => {
    const lanes = lanesOf([
      agent("waits", { status: "idle", attentionReason: "permission", requiresAttention: true, pendingPermissions: [{}] }),
      agent("runs", { status: "running" }),
      agent("starts", { status: "initializing" }),
      agent("unseen", { requiresAttention: true, attentionReason: "finished" }),
      agent("failed", { requiresAttention: true, attentionReason: "error" }),
      agent("done"),
    ]);
    expect(lanes).toEqual({ waiting: ["waits"], running: ["runs", "starts"], review: ["unseen", "failed"], done: ["done"], archived: [] });
  });

  it("keeps a parent in Running while a sub-agent runs or waits, but a failed parent in To review", () => {
    const lanes = lanesOf([
      agent("parent"),
      agent("child", { parentId: "parent", status: "running" }),
      agent("failedParent", { requiresAttention: true, attentionReason: "error" }),
      agent("waitingChild", { parentId: "failedParent", attentionReason: "permission", requiresAttention: true }),
      agent("finishedParent"),
      agent("doneChild", { parentId: "finishedParent" }),
    ]);
    expect(lanes.running).toEqual(["parent", "child"]);
    expect(lanes.review).toEqual(["failedParent"]);
    expect(lanes.waiting).toEqual(["waitingChild"]);
    expect(lanes.done).toEqual(["finishedParent", "doneChild"]);
  });

  it("keeps Done and Archived to the done window, and drops Archived when its lane is off", () => {
    const agents = [agent("recent", { updatedAt: hoursAgo(2) }), agent("old", { updatedAt: hoursAgo(48) }), agent("gone", { archivedAt: hoursAgo(3) }), agent("longGone", { archivedAt: hoursAgo(30 * 24) })];
    expect(lanesOf(agents, { doneWindow: "24h" })).toMatchObject({ done: ["recent"], archived: ["gone"] });
    expect(lanesOf(agents, { doneWindow: "all" })).toMatchObject({ done: ["recent", "old"], archived: ["gone", "longGone"] });
    expect(lanesOf(agents, { showArchived: false }).archived).toEqual([]);
  });

  it("with subtasks hidden, folds a running or done sub-agent into its parent, never one that waits on the user", () => {
    const lanes = lanesOf(
      [
        agent("parent"),
        agent("doneChild", { parentId: "parent" }),
        agent("runningChild", { parentId: "parent", status: "running" }),
        agent("other", { requiresAttention: true, attentionReason: "finished" }),
        agent("failedChild", { parentId: "other", requiresAttention: true, attentionReason: "error" }),
        agent("orphan", { parentId: "missing" }),
        agent("quiet"),
        agent("failedOfQuiet", { parentId: "quiet", requiresAttention: true, attentionReason: "error" }),
        agent("unreadChild", { parentId: "quiet", requiresAttention: true, attentionReason: "finished", attentionAt: hoursAgo(1) }),
      ],
      { showSubtasks: false },
    );
    expect(lanes.running).toEqual(["parent"]);
    // Each one waiting on the user keeps its own row, so the list shows what the Workbench counts and it can be cleared.
    expect(lanes.review).toEqual(["other", "failedChild", "failedOfQuiet", "unreadChild"]);
    expect(lanes.done).toEqual(["orphan", "quiet"]);
  });

  it("with subtasks shown, every sub-agent has its own card", () => {
    const lanes = lanesOf([agent("parent"), agent("doneChild", { parentId: "parent" })]);
    expect(lanes.done).toEqual(["parent", "doneChild"]);
  });

  it("ignores an archived sub-agent when deciding where its parent goes", () => {
    const lanes = lanesOf([agent("parent"), agent("child", { parentId: "parent", status: "running", archivedAt: hoursAgo(1) })]);
    expect(lanes.done).toEqual(["parent"]);
  });

  it("an unknown parent leaves a sub-agent on the board", () => {
    const lanes = lanesOf([agent("orphan", { parentId: "missing" })], { showSubtasks: false });
    expect(lanes.done).toEqual(["orphan"]);
  });
});

describe("filters", () => {
  const card = agent("a", { title: "Fix login", provider: "codex", project: "App", workspace: "feature", branch: "fix/login", labels: ["urgent"], workspaceId: "w1" });

  it("matches every filter it is given, and searches titles and names", () => {
    expect(matchesFilter(card, NO_FILTER, NOW)).toBe(true);
    expect(matchesFilter(card, NOW_FILTER({ providers: ["codex"], labels: ["urgent"], projects: ["App"], workspaces: ["w1"] }), NOW)).toBe(true);
    expect(matchesFilter(card, NOW_FILTER({ providers: ["claude"] }), NOW)).toBe(false);
    expect(matchesFilter(card, NOW_FILTER({ labels: ["later"] }), NOW)).toBe(false);
    expect(matchesFilter(card, NOW_FILTER({ search: "login feature" }), NOW)).toBe(true);
    expect(matchesFilter(card, NOW_FILTER({ search: "fix/login" }), NOW)).toBe(true);
    expect(matchesFilter(card, NOW_FILTER({ search: "billing" }), NOW)).toBe(false);
  });

  it("lists groups on the board with counts, and Paseo's other groups at 0 only when empty groups show", () => {
    const known = { labels: ["urgent", "later"], projects: ["App", "Docs"], workspaces: [{ id: "w1", name: "feature" }, { id: "w2", name: "main" }] };
    const shown = filterGroups([card, agent("b", { provider: "claude", project: "App", workspaceId: "w1" })], known, true);
    expect(shown.providers).toEqual([{ value: "claude", label: "claude", count: 1 }, { value: "codex", label: "codex", count: 1 }]);
    expect(shown.labels).toEqual([{ value: "later", label: "later", count: 0 }, { value: "urgent", label: "urgent", count: 1 }]);
    expect(shown.projects).toEqual([{ value: "App", label: "App", count: 2 }, { value: "Docs", label: "Docs", count: 0 }]);
    expect(shown.workspaces).toEqual([{ value: "w1", label: "feature", count: 2 }, { value: "w2", label: "main", count: 0 }]);
    expect(filterGroups([card], known, false).projects).toEqual([{ value: "App", label: "App", count: 1 }]);
  });
});

describe("compareAgents", () => {
  const ids = (agents: BoardAgent[], key: Parameters<typeof compareAgents>[0]) => [...agents].sort(compareAgents(key, NOW)).map((item) => item.id);
  const a = agent("a", { title: "beta", project: "Zed", workspace: "x", branch: "b", cwd: "/p/one", createdAt: hoursAgo(1), updatedAt: hoursAgo(9), context: { used: 10, max: 100 }, turnStartedAt: hoursAgo(1) });
  const b = agent("b", { title: "alpha", project: "Ant", workspace: null, branch: "a", cwd: "/p/two", createdAt: hoursAgo(2), updatedAt: hoursAgo(1), context: { used: 90, max: 100 }, turnStartedAt: hoursAgo(3) });
  const c = agent("c", { title: "gamma", project: null, workspace: "w", branch: null, cwd: "/p/abc", createdAt: hoursAgo(3), updatedAt: hoursAgo(5), context: null, turnStartedAt: null });

  it("sorts names A to Z with missing ones last", () => {
    expect(ids([a, b, c], "title")).toEqual(["b", "a", "c"]);
    expect(ids([a, b, c], "project")).toEqual(["b", "a", "c"]);
    expect(ids([a, b, c], "workspace")).toEqual(["c", "a", "b"]);
    expect(ids([a, b, c], "branch")).toEqual(["b", "a", "c"]);
    expect(ids([a, b, c], "folder")).toEqual(["c", "a", "b"]);
  });

  it("sorts times newest first, and context and duration largest first", () => {
    expect(ids([a, b, c], "created")).toEqual(["a", "b", "c"]);
    expect(ids([a, b, c], "updated")).toEqual(["b", "c", "a"]);
    expect(ids([a, b, c], "context")).toEqual(["b", "a", "c"]);
    expect(ids([a, b, c], "duration")).toEqual(["b", "a", "c"]);
  });
});

describe("moveFocus", () => {
  const lanes = [["a1", "a2", "a3"], [], ["c1"], ["d1", "d2"]];

  it("starts on the first card, and moves within a lane without leaving it", () => {
    expect(moveFocus(lanes, null, "down")).toBe("a1");
    expect(moveFocus(lanes, "a1", "down")).toBe("a2");
    expect(moveFocus(lanes, "a3", "down")).toBe("a3");
    expect(moveFocus(lanes, "a1", "up")).toBe("a1");
  });

  it("moves across lanes, skipping empty ones and keeping the row where it can", () => {
    expect(moveFocus(lanes, "a3", "right")).toBe("c1");
    expect(moveFocus(lanes, "c1", "right")).toBe("d1");
    expect(moveFocus(lanes, "d2", "left")).toBe("c1");
    expect(moveFocus(lanes, "a2", "left")).toBe("a2");
    expect(moveFocus([["a1"], ["b1", "b2"]], "a1", "right")).toBe("b1");
    expect(moveFocus(lanes, "gone", "down")).toBe("a1");
  });
});

describe("usage", () => {
  it("reads the context share only when Paseo gave a window", () => {
    expect(contextShare({ used: 50, max: 200 })).toBe(0.25);
    expect(contextShare({ used: 500, max: 200 })).toBe(1);
    expect(contextShare({ used: 5, max: 0 })).toBeNull();
    expect(contextShare(null)).toBeNull();
  });

  it("refreshes a card at most once a minute", () => {
    expect(dueForRefresh(undefined, NOW)).toBe(true);
    expect(dueForRefresh(NOW - 30_000, NOW)).toBe(false);
    expect(dueForRefresh(NOW - 60_000, NOW)).toBe(true);
  });
});

describe("agent list updates", () => {
  const entry = (id: string, title: string) => ({ agent: { id, title }, project: { projectName: "App" } });

  it("starts from the snapshot, then adds, replaces and removes agents", () => {
    let entries = entriesFromSnapshot([entry("a", "one"), { agent: { title: "no id" } }]);
    expect([...entries.keys()]).toEqual(["a"]);
    entries = applyAgentUpdate(entries, { type: "agent_update", payload: { kind: "upsert", agent: { id: "b", title: "two" }, project: null } });
    entries = applyAgentUpdate(entries, { type: "agent_update", payload: { kind: "upsert", agent: { id: "a", title: "renamed" } } });
    expect(entries.get("a")).toEqual({ agent: { id: "a", title: "renamed" }, project: { projectName: "App" } });
    expect([...entries.keys()]).toEqual(["a", "b"]);
    entries = applyAgentUpdate(entries, { type: "agent_update", payload: { kind: "remove", agentId: "a" } });
    expect([...entries.keys()]).toEqual(["b"]);
  });

  it("ignores other messages without making a new list", () => {
    const entries = entriesFromSnapshot([entry("a", "one")]);
    expect(applyAgentUpdate(entries, { type: "workspace_update", payload: {} })).toBe(entries);
    expect(applyAgentUpdate(entries, { type: "agent_update", payload: { kind: "remove", agentId: "zzz" } })).toBe(entries);
  });

  it("reads the token counts and cost Paseo gave, and nothing it did not", () => {
    expect(readUsage({ inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300, totalCostUsd: 0.12, contextWindowUsedTokens: 9, contextWindowMaxTokens: 10 })).toEqual({ context: { used: 9, max: 10 }, inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300, costUsd: 0.12 });
    expect(readUsage({ outputTokens: 3 })).toEqual({ context: null, inputTokens: null, cachedInputTokens: null, outputTokens: 3, costUsd: null });
    expect(readUsage(undefined)).toBeNull();
  });
});

describe("lane layout", () => {
  it("folds an empty lane, and Archived at first, unless the user chose otherwise", () => {
    expect(laneFolded("running", 0, undefined)).toBe(true);
    expect(laneFolded("running", 3, undefined)).toBe(false);
    // Finished work stays in view (M's board: Running 1 and Done 50 side by side).
    expect(laneFolded("done", 50, undefined)).toBe(false);
    expect(laneFolded("archived", 6, undefined)).toBe(true);
    expect(laneFolded("done", 49, true)).toBe(true);
    expect(laneFolded("waiting", 2, true)).toBe(true);
  });

  it("shares the width between open lanes, within the minimum and the setting's maximum", () => {
    // M's case: 1,500 pt, everything folded but one open lane.
    expect(openLaneWidth({ width: 1500, open: 1, folded: 4, gap: 12, padding: 12, max: LANE_MAX.default })).toEqual({ width: 420, scrolls: false });
    // Three open lanes on 1,100 pt: (1100 − 24 − 4×12 − 2×132) / 3 = 254.
    expect(openLaneWidth({ width: 1100, open: 3, folded: 2, gap: 12, padding: 12, max: LANE_MAX.default })).toEqual({ width: 254, scrolls: false });
    // Too narrow even at the minimum: the board scrolls.
    expect(openLaneWidth({ width: 700, open: 5, folded: 0, gap: 12, padding: 12, max: LANE_MAX.wide })).toEqual({ width: LANE_MIN, scrolls: true });
    expect(openLaneWidth({ width: 900, open: 0, folded: 5, gap: 12, padding: 12, max: 420 })).toEqual({ width: 0, scrolls: false });
  });
});

describe("card text", () => {
  it("says the model once and short, from ids seen on M's board", () => {
    expect(modelLabel("claude", "claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude/claude-opus-5-5", "claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude", "claude-fable-5-1")).toBe("Fable 5.1");
    expect(modelLabel("codex", "gpt-5.5")).toBe("codex · gpt-5.5");
    expect(modelLabel("opencode", "opencode-mini")).toBe("opencode-mini");
    expect(modelLabel("claude", null)).toBe("claude");
    expect(modelLabel(null, null)).toBeNull();
  });

  it("shows the folder only when it is not the project's or workspace's name", () => {
    expect(folderAddsSomething("Develop", "Develop", "Add super user tool")).toBe(false);
    expect(folderAddsSomething("lucky-catfish", "web-backend", "Scan Slack thread")).toBe(true);
    expect(folderAddsSomething("develop", null, "Develop")).toBe(false);
  });
});

describe("folded lanes", () => {
  const lanes = (counts: Partial<Record<"waiting" | "running" | "review" | "done" | "archived", number>>, choices: Partial<Record<string, boolean>> = {}) =>
    (["waiting", "running", "review", "done", "archived"] as const).map((lane) => ({ lane, count: counts[lane] ?? 0, choice: choices[lane] }));

  it("keeps Running and Done open side by side, as on M's board, and folds what is empty and Archived", () => {
    expect([...foldedLanes(lanes({ running: 1, done: 50, archived: 6 }))].sort()).toEqual(["archived", "review", "waiting"]);
    expect(foldedLanes(lanes({ done: 49 }, { done: true })).has("done")).toBe(true);
  });
});

describe("list sections", () => {
  const counts = { waiting: 0, running: 1, review: 0, done: 50, archived: 6 };

  it("puts what needs you first, leaves empty sections out, and folds Archived at first, as on M's host", () => {
    expect(listSections(counts, {})).toEqual([
      { lane: "running", folded: false, limit: Number.POSITIVE_INFINITY },
      { lane: "done", folded: false, limit: LIST_PREVIEW },
      { lane: "archived", folded: true, limit: LIST_PREVIEW },
    ]);
    expect(listSections({ ...counts, waiting: 2, review: 1 }, {}).map((section) => section.lane)).toEqual(["waiting", "review", "running", "done", "archived"]);
  });

  it("follows the user's fold and the rows they asked to see", () => {
    expect(listSections(counts, { done: true, archived: false }, { done: 16 })).toEqual([
      { lane: "running", folded: false, limit: Number.POSITIVE_INFINITY },
      { lane: "done", folded: true, limit: 16 },
      { lane: "archived", folded: false, limit: LIST_PREVIEW },
    ]);
  });
});

describe("titles", () => {
  const prompt = "scan https://acme.slack.com/archives/C0123/p1794 and fix what it finds";

  it("leads with a workspace title that reads as a phrase, with the prompt under it, links short", () => {
    expect(agentHeadline(agent("a", { title: prompt, project: "morphise", workspace: "Plan security scan improvement" }), false)).toEqual({ title: "Plan security scan improvement", subtitle: "scan acme.slack.com/…/p1794 and fix what it finds" });
  });

  it("keeps each agent's own title when the workspace holds other agents, or for a sub-agent, so rows stay apart", () => {
    const shared = agent("a", { title: "Write the tests", workspace: "Plan security scan improvement" });
    expect(agentHeadline(shared, true)).toEqual({ title: "Write the tests", subtitle: null });
    expect(agentHeadline({ ...shared, parentId: "p" }, false)).toEqual({ title: "Write the tests", subtitle: null });
  });

  it("keeps the agent's title when the workspace is a slug, the project, or the title's start", () => {
    expect(agentHeadline(agent("a", { title: prompt, project: "morphise", workspace: "fix-scan" }), false)).toEqual({ title: "scan acme.slack.com/…/p1794 and fix what it finds", subtitle: null });
    expect(agentHeadline(agent("a", { title: "Add tests", project: "my app", workspace: "my app" }), false).title).toBe("Add tests");
    expect(agentHeadline(agent("a", { title: "Fix login flow now", workspace: "Fix login flow" }), false).title).toBe("Fix login flow now");
  });

  it("shortens links to the host and the last part of the path, keeping the whole host and dropping a login", () => {
    expect(shortLinks("https://monarch.github.io/repo/docs/page")).toBe("monarch.github.io/…/page");
    expect(shortLinks("https://user:secret@example.com/a/b")).toBe("example.com/…/b");
    expect(shortLinks("see https://www.github.com/getpaseo/plugins/pull/2378.")).toBe("see github.com/…/2378.");
    expect(shortLinks("http://localhost:6878/settings")).toBe("localhost:6878/settings");
    expect(shortLinks("https://example.com/")).toBe("example.com");
    expect(shortLinks("no links here")).toBe("no links here");
  });
});

describe("row line", () => {
  it("says what the agent asks, what failed, or what it works on, else the prompt", () => {
    const permission = { id: "p", kind: "tool", tool: "Bash", title: "", description: "", subject: "npm test", body: "", choices: [], answerInChat: false };
    expect(rowLine({ indicator: "needs_input", permission, error: null, step: "Write tests", subtitle: "the prompt" })).toBe("Bash: npm test");
    expect(rowLine({ indicator: "needs_input", permission: null, error: null, step: null, subtitle: null })).toBe("Waiting for your permission");
    expect(rowLine({ indicator: "failed", permission: null, error: "Timed out\nstack", step: null, subtitle: "the prompt" })).toBe("Timed out");
    expect(rowLine({ indicator: "failed", permission: null, error: "\n  Timed out\nstack", step: null, subtitle: null })).toBe("Timed out");
    expect(rowLine({ indicator: "failed", permission: null, error: "\n", step: null, subtitle: null })).toBe("Stopped with an error");
    expect(rowLine({ indicator: "running", permission: null, error: null, step: "Write tests", subtitle: "the prompt" })).toBe("Working on: Write tests");
    expect(rowLine({ indicator: "running", permission: null, error: null, step: null, subtitle: "the prompt" })).toBe("the prompt");
    expect(rowLine({ indicator: "done", permission: null, error: null, step: "Write tests", subtitle: null })).toBeNull();
  });
});

describe("last updated filter", () => {
  it("keeps agents updated within the window, and every agent at Any time", () => {
    const recent = agent("recent", { updatedAt: hoursAgo(0.5) });
    const older = agent("older", { updatedAt: hoursAgo(7) });
    const shown = (updatedWithin: typeof NO_FILTER.updatedWithin) => [recent, older].filter((item) => matchesFilter(item, NOW_FILTER({ updatedWithin }), NOW)).map((item) => item.id);
    expect(shown("any")).toEqual(["recent", "older"]);
    expect(shown("1h")).toEqual(["recent"]);
    expect(shown("6h")).toEqual(["recent"]);
    expect(shown("12h")).toEqual(["recent", "older"]);
    expect(updatedWithinMs("24h")).toBe(24 * 3_600_000);
    expect(updatedWithinMs("any")).toBeNull();
  });

  it("never hides an agent that runs or waits now, such as a parent whose sub-agent runs", () => {
    const parent = agent("parent", { updatedAt: hoursAgo(3) });
    expect(matchesFilter(parent, NOW_FILTER({ updatedWithin: "1h" }), NOW, { activeNow: true })).toBe(true);
    expect(matchesFilter(parent, NOW_FILTER({ updatedWithin: "1h" }), NOW, { activeNow: false })).toBe(false);
  });

  it("leaves out an agent with no update time when a window is set", () => {
    expect(matchesFilter(agent("x", { updatedAt: "" }), NOW_FILTER({ updatedWithin: "1h" }), NOW)).toBe(false);
  });
});

describe("empty list sections", () => {
  it("shows every status, empty ones folded, when empty groups show", () => {
    const counts = { waiting: 0, running: 0, review: 0, done: 51, archived: 6 };
    expect(listSections(counts, {}, {}, true).map((section) => [section.lane, section.folded])).toEqual([
      ["waiting", true],
      ["review", true],
      ["running", true],
      ["done", false],
      ["archived", true],
    ]);
    expect(listSections(counts, { waiting: false }, {}, true)[0]).toEqual({ lane: "waiting", folded: false, limit: Number.POSITIVE_INFINITY });
  });
});

describe("cleared finished agents", () => {
  const unseen = agent("unseen", { requiresAttention: true, attentionReason: "finished", attentionAt: hoursAgo(1) });
  const failed = agent("failed", { requiresAttention: true, attentionReason: "error", attentionAt: hoursAgo(1) });

  it("moves a cleared finished agent from To review to Done, until it finishes again", () => {
    const cleared = new Set([clearKeyOf(unseen)!]);
    expect(lanesOf([unseen], { cleared }).done).toEqual(["unseen"]);
    expect(lanesOf([unseen]).review).toEqual(["unseen"]);
    const again = { ...unseen, attentionAt: hoursAgo(0.1) };
    expect(lanesOf([again], { cleared }).review).toEqual(["unseen"]);
    expect(shownStatus(unseen, cleared)).toBe("done");
  });

  it("can clear only a finished agent with Paseo's time, never a failed one", () => {
    expect(clearKeyOf(failed)).toBeNull();
    expect(clearKeyOf({ ...unseen, attentionAt: null })).toBeNull();
    expect(clearKeyOf(agent("idle"))).toBeNull();
  });
});

describe("status filter", () => {
  const waits = agent("waits", { attentionReason: "permission", requiresAttention: true, pendingPermissions: [{}] });
  const runs = agent("runs", { status: "running" });
  const fails = agent("fails", { requiresAttention: true, attentionReason: "error" });
  const unseen = agent("unseen", { requiresAttention: true, attentionReason: "finished", attentionAt: hoursAgo(1) });

  it("keeps the agents in the picked statuses, a cleared one counting as Done", () => {
    const cleared = new Set([clearKeyOf(unseen)!]);
    const lanes = assignLanes([waits, runs, fails, unseen], { now: NOW, doneWindow: "7d", showArchived: true, showSubtasks: true, cleared });
    const pick = (statuses: string[]) => LANES.flatMap((lane) => lanes[lane].filter((item) => matchesFilter(item, NOW_FILTER({ statuses: statuses as never }), NOW, { status: laneStatus(lane, item, cleared) })).map((item) => item.id));
    expect(pick([])).toEqual(["waits", "runs", "fails", "unseen"]);
    expect(pick(["failed"])).toEqual(["fails"]);
    expect(pick(["needs_input", "attention"])).toEqual(["waits"]);
    expect(pick(["done"])).toEqual(["unseen"]);
  });

  it("counts each status for the menu, every status listed", () => {
    const lanes = assignLanes([waits, runs, fails, unseen], { now: NOW, doneWindow: "7d", showArchived: true, showSubtasks: true });
    expect(statusGroups(lanes, new Set()).map((group) => [group.value, group.count])).toEqual([
      ["needs_input", 1],
      ["running", 1],
      ["failed", 1],
      ["attention", 1],
      ["done", 0],
    ]);
  });
});

describe("status of a parent whose sub-agent works", () => {
  it("is Running, as its lane says, in the filter and the counts", () => {
    const parent = agent("parent");
    const child = agent("child", { status: "running", parentId: "parent" });
    const lanes = assignLanes([parent, child], { now: NOW, doneWindow: "7d", showArchived: true, showSubtasks: false });
    expect(lanes.running.map((item) => item.id)).toEqual(["parent"]);
    expect(laneStatus("running", parent, new Set())).toBe("running");
    expect(statusGroups(lanes, new Set()).find((group) => group.value === "running")?.count).toBe(1);
    expect(statusGroups(lanes, new Set()).find((group) => group.value === "done")?.count).toBe(0);
  });
});

describe("agents in hidden workspaces", () => {
  it("do not wait on the user, as the Workbench count leaves them out: they read as done", () => {
    const hidden = agent("hidden", { requiresAttention: true, attentionReason: "finished", attentionAt: hoursAgo(1), workspaceOpen: false });
    const asks = agent("asks", { attentionReason: "permission", requiresAttention: true, pendingPermissions: [{}], workspaceOpen: false });
    expect(shownStatus(hidden, new Set())).toBe("done");
    expect(shownStatus(asks, new Set())).toBe("done");
    expect(lanesOf([hidden, asks]).done).toEqual(["hidden", "asks"]);
    // Its key still reads, so a clear made before its workspace was hidden is kept, should the workspace come back.
    expect(clearKeyOf(hidden)).not.toBeNull();
  });
});

describe("a parent that finished unread while a sub-agent works", () => {
  it("waits on the user in To review, as the Workbench counts it; its running sub-agent keeps its own card", () => {
    const parent = agent("parent", { requiresAttention: true, attentionReason: "finished", attentionAt: hoursAgo(1) });
    const child = agent("child", { status: "running", parentId: "parent" });
    expect(lanesOf([parent, child], { showSubtasks: false })).toMatchObject({ review: ["parent"], running: ["child"] });
  });

  it("a sub-agent waiting in a hidden workspace does not keep its parent in Running", () => {
    const parent = agent("parent");
    const child = agent("child", { parentId: "parent", attentionReason: "permission", requiresAttention: true, pendingPermissions: [{}], workspaceOpen: false });
    expect(lanesOf([parent, child], { showSubtasks: false })).toMatchObject({ done: ["parent"], running: [] });
  });
});
