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
} from "./agents-board";

const NOW = Date.parse("2026-11-12T12:00:00Z");
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
    const read = readBoardAgent(entry, (id) => (id === "w1" ? { name: "Feature", project: "App", labels: ["urgent"] } : undefined));
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

  it("with subtasks hidden, folds a sub-agent into its parent unless it runs, waits or failed in another lane", () => {
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
      ],
      { showSubtasks: false },
    );
    expect(lanes.running).toEqual(["parent"]);
    expect(lanes.review).toEqual(["other", "failedOfQuiet"]);
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
    expect(matchesFilter(card, NO_FILTER)).toBe(true);
    expect(matchesFilter(card, { ...NO_FILTER, providers: ["codex"], labels: ["urgent"], projects: ["App"], workspaces: ["w1"] })).toBe(true);
    expect(matchesFilter(card, { ...NO_FILTER, providers: ["claude"] })).toBe(false);
    expect(matchesFilter(card, { ...NO_FILTER, labels: ["later"] })).toBe(false);
    expect(matchesFilter(card, { ...NO_FILTER, search: "login feature" })).toBe(true);
    expect(matchesFilter(card, { ...NO_FILTER, search: "fix/login" })).toBe(true);
    expect(matchesFilter(card, { ...NO_FILTER, search: "billing" })).toBe(false);
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
