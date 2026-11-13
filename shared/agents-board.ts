// Ported from Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md): shared/tasks-settings.ts
import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { chatIndicator, type ChatStatusFields, parentFromLabels } from "./chat-status";
import { canClear, clearKey, type InboxReason, type PermissionSummary, previewLine, waitsOnUser } from "./inbox";
import type { Indicator } from "./profile";

// The Workbench's Agents view: its settings, and the rules that place, filter and sort agents.
// Plain values only, so the board, the settings preview and tests share them.

// ---------- Settings ----------

export const CARD_FIELDS = ["provider", "model", "thinking", "project", "projectIcon", "workspace", "branch", "gitStatus", "folder", "path", "labels", "pullRequest", "timer", "context", "plan", "subtasks"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

// How many labels a card shows before folding the rest into +N.
export const LABEL_LIMITS = ["1", "2", "3", "all"] as const;
export type LabelLimit = (typeof LABEL_LIMITS)[number];

export const DENSITY_PRESETS = ["minimal", "standard", "full"] as const;
export type DensityPreset = (typeof DENSITY_PRESETS)[number];
export const DENSITIES = [...DENSITY_PRESETS, "custom"] as const;
export type Density = (typeof DENSITIES)[number];

export const DONE_WINDOWS = ["24h", "7d", "all"] as const;
export type DoneWindow = (typeof DONE_WINDOWS)[number];

// Phones show one lane at a time and ignore the width.
export const LANE_WIDTHS = ["narrow", "default", "wide"] as const;
export type LaneWidth = (typeof LANE_WIDTHS)[number];

export type CardFieldSwitches = Record<CardField, boolean>;
export type CardSettings = CardFieldSwitches & { labelLimit: LabelLimit };

const fields = (on: readonly CardField[]): CardFieldSwitches => Object.fromEntries(CARD_FIELDS.map((field) => [field, on.includes(field)])) as CardFieldSwitches;

// Minimal keeps the header and the timer; Standard leaves Git status, full path and the linked PR off.
export const CARD_PRESETS: Readonly<Record<DensityPreset, { fields: CardFieldSwitches; labelLimit: LabelLimit }>> = {
  minimal: { fields: fields(["model", "thinking", "timer"]), labelLimit: "2" },
  // Folder is off: the fact line already names the project and workspace, which is usually the folder.
  standard: { fields: fields(CARD_FIELDS.filter((field) => field !== "gitStatus" && field !== "path" && field !== "pullRequest" && field !== "folder")), labelLimit: "2" },
  full: { fields: fields(CARD_FIELDS), labelLimit: "all" },
};

const flag = (fallback: boolean) => z.boolean().catch(fallback);
const STANDARD_CARD: CardSettings = { ...CARD_PRESETS.standard.fields, labelLimit: CARD_PRESETS.standard.labelLimit };
const BOARD_DEFAULTS = { doneWindow: "7d", laneWidth: "default", showSubtasks: true, showArchived: true, showEmptyGroups: true } as const;

// Every field falls back to its default on its own, so one unusable value never invalidates the record.
// Keys this version does not know are kept (loose), so saving the record here keeps a newer version's.
export const agentsBoardSchema = z.looseObject({
  // Off, the Workbench lists Agents only while an agent waits on the user; nothing subscribes to agents until it opens.
  enabled: flag(true),
  // The preset the card switches were last set from; "custom" after a hand edit.
  density: z.enum(DENSITIES).catch("standard"),
  card: z
    .object({
      ...(Object.fromEntries(CARD_FIELDS.map((field) => [field, flag(STANDARD_CARD[field])])) as Record<CardField, z.ZodCatch<z.ZodBoolean>>),
      labelLimit: z.enum(LABEL_LIMITS).catch(STANDARD_CARD.labelLimit),
    })
    .loose()
    .catch({ ...STANDARD_CARD }),
  board: z
    .object({
      doneWindow: z.enum(DONE_WINDOWS).catch(BOARD_DEFAULTS.doneWindow),
      laneWidth: z.enum(LANE_WIDTHS).catch(BOARD_DEFAULTS.laneWidth),
      showSubtasks: flag(BOARD_DEFAULTS.showSubtasks),
      showArchived: flag(BOARD_DEFAULTS.showArchived),
      showEmptyGroups: flag(BOARD_DEFAULTS.showEmptyGroups),
    })
    .loose()
    .catch({ ...BOARD_DEFAULTS }),
  phone: z.looseObject({ minimalCards: flag(false) }).catch({ minimalCards: false }),
});

export type AgentsBoardSettings = z.output<typeof agentsBoardSchema>;

export const DEFAULT_AGENTS_BOARD: AgentsBoardSettings = agentsBoardSchema.parse({});

export const agentsBoardSettings = defineSettings({ id: "agents-board", scope: "host", version: 1, schema: agentsBoardSchema });

export function applyDensity(settings: AgentsBoardSettings, density: DensityPreset): AgentsBoardSettings {
  const preset = CARD_PRESETS[density];
  return { ...settings, density, card: { ...preset.fields, labelLimit: preset.labelLimit } };
}

// The preset the switches match exactly, else "custom". The label limit only counts while labels show.
export function densityOf(card: CardSettings): Density {
  for (const density of DENSITY_PRESETS) {
    const preset = CARD_PRESETS[density];
    const sameFields = CARD_FIELDS.every((field) => preset.fields[field] === card[field]);
    if (sameFields && (!card.labels || preset.labelLimit === card.labelLimit)) return density;
  }
  return "custom";
}

export function setCardSetting<Key extends keyof CardSettings>(settings: AgentsBoardSettings, key: Key, value: CardSettings[Key]): AgentsBoardSettings {
  const card = { ...settings.card, [key]: value };
  return { ...settings, card, density: densityOf(card) };
}

// The card a client draws: the minimal preset on a phone when that switch is on.
export function effectiveCard(settings: AgentsBoardSettings, compact: boolean): CardSettings {
  if (compact && settings.phone.minimalCards) return { ...CARD_PRESETS.minimal.fields, labelLimit: CARD_PRESETS.minimal.labelLimit };
  return settings.card;
}

export const labelLimitCount = (limit: LabelLimit) => (limit === "all" ? Number.POSITIVE_INFINITY : Number(limit));

// How far back Done and Archived reach, in milliseconds; null for no limit.
export function doneWindowMs(window: DoneWindow): number | null {
  if (window === "24h") return 24 * 3_600_000;
  if (window === "7d") return 7 * 24 * 3_600_000;
  return null;
}

// ---------- Agents ----------

// One agent as the board draws it, from an entry of Paseo's agent list (an agent and its project
// placement). Null fields are ones Paseo did not give; the board leaves them blank.
export interface BoardAgent {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  thinking: string | null;
  status: ChatStatusFields["status"];
  requiresAttention: boolean;
  attentionReason: ChatStatusFields["attentionReason"];
  pendingPermissions: readonly unknown[];
  parentId: string | null;
  workspaceId: string | null;
  cwd: string;
  projectKey: string | null;
  project: string | null;
  workspace: string | null;
  branch: string | null;
  // The labels of the agent's workspace, as Paseo's sidebar shows them.
  labels: readonly string[];
  createdAt: string;
  updatedAt: string;
  lastUserMessageAt: string | null;
  attentionAt: string | null;
  archivedAt: string | null;
  // When the running turn began; null between turns.
  turnStartedAt: string | null;
  // The provider's own session id.
  sessionId: string | null;
  lastError: string | null;
  context: { used: number; max: number } | null;
  // False when its workspace is not listed (being archived, background or internal); true when unknown, as the
  // Workbench count treats it.
  workspaceOpen: boolean;
}

// What the workspace list adds to an agent: its name, project and labels, and whether the workspace is listed.
export interface WorkspaceFacts {
  name: string;
  project: string;
  labels: readonly string[];
  open: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

function readContext(usage: unknown): BoardAgent["context"] {
  const used = count(record(usage)?.contextWindowUsedTokens);
  const max = count(record(usage)?.contextWindowMaxTokens);
  return used !== null && max !== null ? { used, max } : null;
}

// An agent's `lastUsage`: its latest context and token counts; null when Paseo gave none.
export interface UsageFacts {
  context: BoardAgent["context"];
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export function readUsage(usage: unknown): UsageFacts | null {
  const value = record(usage);
  if (!value) return null;
  return { context: readContext(value), inputTokens: count(value.inputTokens), cachedInputTokens: count(value.cachedInputTokens), outputTokens: count(value.outputTokens), costUsd: count(value.totalCostUsd) };
}

// Paseo's agent list as the board keeps it: each entry by agent id, as Paseo sent it.
export type AgentEntry = { agent: unknown; project?: unknown };
export type AgentEntries = ReadonlyMap<string, AgentEntry>;

const idOf = (entry: AgentEntry) => {
  const id = record(entry.agent)?.id;
  return typeof id === "string" ? id : null;
};

export function entriesFromSnapshot(entries: readonly AgentEntry[]): AgentEntries {
  return new Map(entries.flatMap((entry) => (idOf(entry) ? [[idOf(entry) as string, entry] as const] : [])));
}

// One `agent_update` message applied: an upsert keeps the project it had when the message has none.
export function applyAgentUpdate(entries: AgentEntries, message: { type: string; payload?: unknown }): AgentEntries {
  const payload = record(message.payload);
  if (message.type !== "agent_update" || !payload) return entries;
  if (payload.kind === "remove" && typeof payload.agentId === "string") {
    if (!entries.has(payload.agentId)) return entries;
    const next = new Map(entries);
    next.delete(payload.agentId);
    return next;
  }
  const id = payload.kind === "upsert" ? idOf({ agent: payload.agent }) : null;
  if (!id) return entries;
  return new Map(entries).set(id, { agent: payload.agent, project: payload.project ?? entries.get(id)?.project });
}

export function readBoardAgent(entry: unknown, workspaceOf: (id: string) => WorkspaceFacts | undefined): BoardAgent | null {
  const agent = record(record(entry)?.agent);
  const project = record(record(entry)?.project);
  if (!agent || typeof agent.id !== "string") return null;
  const workspaceId = text(agent.workspaceId);
  const workspace = workspaceId ? workspaceOf(workspaceId) : undefined;
  const checkout = record(project?.checkout);
  const provider = text(agent.provider) ?? "agent";
  return {
    id: agent.id,
    title: text(agent.title) ?? provider,
    provider,
    model: text(agent.model) ?? text(record(agent.runtimeInfo)?.model),
    thinking: text(agent.effectiveThinkingOptionId) ?? text(agent.thinkingOptionId),
    status: (text(agent.status) ?? "idle") as ChatStatusFields["status"],
    requiresAttention: agent.requiresAttention === true,
    attentionReason: (text(agent.attentionReason) ?? null) as ChatStatusFields["attentionReason"],
    pendingPermissions: Array.isArray(agent.pendingPermissions) ? agent.pendingPermissions : [],
    parentId: parentFromLabels(agent.labels),
    workspaceId,
    cwd: text(agent.cwd) ?? "",
    projectKey: text(project?.projectKey),
    project: text(project?.projectName) ?? workspace?.project ?? null,
    workspace: text(project?.workspaceName) ?? workspace?.name ?? null,
    branch: text(checkout?.currentBranch),
    labels: workspace?.labels ?? [],
    createdAt: text(agent.createdAt) ?? "",
    updatedAt: text(agent.updatedAt) ?? "",
    lastUserMessageAt: text(agent.lastUserMessageAt),
    attentionAt: text(agent.attentionTimestamp),
    archivedAt: text(agent.archivedAt),
    turnStartedAt: text(record(agent.activeTurn)?.startedAt),
    sessionId: text(record(agent.runtimeInfo)?.sessionId) ?? text(record(agent.persistence)?.sessionId),
    lastError: text(agent.lastError),
    context: readContext(agent.lastUsage),
    workspaceOpen: workspace?.open !== false,
  };
}

export function indicatorOf(agent: BoardAgent): Indicator {
  return chatIndicator({ status: agent.status, requiresAttention: agent.requiresAttention, attentionReason: agent.attentionReason, pendingPermissionCount: agent.pendingPermissions.length });
}

/**
 * The key a finished-unread agent is cleared under on this device (the same keys the Workbench count reads), or null
 * when it cannot be cleared: it is not finished-unread, or Paseo gave no time to tell this finish from the next.
 */
export function clearKeyOf(agent: BoardAgent): string | null {
  if (indicatorOf(agent) !== "attention") return null;
  const entry = { id: agent.id, reason: "finished" as const, attentionAt: agent.attentionAt ?? "" };
  return canClear(entry) ? clearKey(entry) : null;
}

const REASONS: Partial<Record<Indicator, InboxReason>> = { needs_input: "permission", failed: "failed", attention: "finished" };

/**
 * The status an agent shows: its own, except that one that would wait on the user but does not by the shared rule
 * (waitsOnUser: cleared on this device, or in a workspace that is not listed) reads as done, as the Workbench count
 * leaves it out.
 */
export function shownStatus(agent: BoardAgent, cleared: ReadonlySet<string>): Indicator {
  const indicator = indicatorOf(agent);
  const reason = REASONS[indicator];
  if (!reason) return indicator;
  return waitsOnUser({ id: agent.id, reason, attentionAt: agent.attentionAt ?? "" }, agent.workspaceOpen, cleared) ? indicator : "done";
}

export const folderOf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

// ---------- Lanes ----------

export const LANES = ["waiting", "running", "review", "done", "archived"] as const;
export type Lane = (typeof LANES)[number];

const busy = (indicator: Indicator) => indicator === "running" || indicator === "needs_input";

export interface LaneOptions {
  now: number;
  doneWindow: DoneWindow;
  showArchived: boolean;
  showSubtasks: boolean;
  // Finished agents the user cleared on this device (clearKeyOf); they go to Done.
  cleared?: ReadonlySet<string>;
}

// Waiting: needs input. Running: running, or a parent whose sub-agent still runs or waits. To
// review: finished unseen, or failed; a parent here stays here while a sub-agent works, as it waits on the user
// (the Workbench counts it). Done and Archived: within the done window. Null: not on the board.
function laneOf(agent: BoardAgent, childBusy: boolean, options: LaneOptions): Lane | null {
  const windowMs = doneWindowMs(options.doneWindow);
  const within = (at: string) => windowMs === null || Date.parse(at) >= options.now - windowMs;
  if (agent.archivedAt) return options.showArchived && within(agent.archivedAt) ? "archived" : null;
  const indicator = shownStatus(agent, options.cleared ?? new Set());
  if (indicator === "needs_input") return "waiting";
  if (indicator === "running") return "running";
  if (indicator === "failed" || indicator === "attention") return "review";
  if (childBusy) return "running";
  return within(agent.updatedAt) ? "done" : null;
}

// Each lane's agents, in the order given. With subtasks hidden, a sub-agent folds into its parent's card when it is done,
// or runs while its parent's card is in Running too; one that waits on the user always keeps its own card, so the board
// lists what the Workbench counts and it can be answered or cleared.
export function assignLanes(agents: readonly BoardAgent[], options: LaneOptions): Record<Lane, BoardAgent[]> {
  const busyParents = new Set(agents.filter((agent) => agent.parentId && !agent.archivedAt && busy(shownStatus(agent, options.cleared ?? new Set()))).map((agent) => agent.parentId));
  const placed = new Map(agents.map((agent) => [agent.id, laneOf(agent, busyParents.has(agent.id), options)]));
  const lanes: Record<Lane, BoardAgent[]> = { waiting: [], running: [], review: [], done: [], archived: [] };
  for (const agent of agents) {
    const lane = placed.get(agent.id);
    if (!lane) continue;
    const parentLane = agent.parentId ? placed.get(agent.parentId) : undefined;
    if (!options.showSubtasks && parentLane) {
      const status = shownStatus(agent, options.cleared ?? new Set());
      const waits = status === "needs_input" || status === "failed" || status === "attention";
      if (!waits && (status !== "running" || parentLane === lane)) continue;
    }
    lanes[lane].push(agent);
  }
  return lanes;
}

// ---------- Filters and sort ----------

export interface BoardFilter {
  providers: readonly string[];
  labels: readonly string[];
  // Project names: Paseo's project keys and project ids are not the same value.
  projects: readonly string[];
  // Workspace ids.
  workspaces: readonly string[];
  search: string;
  // Only agents Paseo updated within this window.
  updatedWithin: UpdatedWithin;
  // Only agents showing these statuses (shownStatus); none picked shows all.
  statuses: readonly Indicator[];
}

export const UPDATED_WITHIN = ["any", "1h", "6h", "12h", "24h"] as const;
export type UpdatedWithin = (typeof UPDATED_WITHIN)[number];

/** The Last updated filter's window in milliseconds; null for Any time. */
export function updatedWithinMs(window: UpdatedWithin): number | null {
  return window === "any" ? null : Number(window.slice(0, -1)) * 3_600_000;
}

export const NO_FILTER: BoardFilter = { providers: [], labels: [], projects: [], workspaces: [], search: "", updatedWithin: "any", statuses: [] };

const STATUS_ORDER: readonly Indicator[] = ["needs_input", "running", "failed", "attention", "done"];
const STATUS_LABELS: Record<Indicator, string> = { needs_input: "Waiting", running: "Running", failed: "Failed", attention: "To review", done: "Done" };

/**
 * The status an agent counts as where it sits: its lane decides (a parent in Running because a sub-agent works is
 * running; anything in Done or Archived is done), and To review tells failed from finished-unread.
 */
export function laneStatus(lane: Lane, agent: BoardAgent, cleared: ReadonlySet<string>): Indicator {
  if (lane === "waiting") return "needs_input";
  if (lane === "running") return "running";
  if (lane === "review") return shownStatus(agent, cleared);
  return "done";
}

/** The Status filter's choices, every status in order, with how many agents on the board count as it (laneStatus). */
export function statusGroups(lanes: Readonly<Record<Lane, readonly BoardAgent[]>>, cleared: ReadonlySet<string>): FilterGroup[] {
  const counts = new Map<Indicator, number>();
  for (const lane of LANES) for (const agent of lanes[lane]) counts.set(laneStatus(lane, agent, cleared), (counts.get(laneStatus(lane, agent, cleared)) ?? 0) + 1);
  return STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABELS[status], count: counts.get(status) ?? 0 }));
}

/**
 * Whether an agent passes the filters. `activeNow` is true for an agent in the Waiting or Running lane (a parent is there
 * while a sub-agent works): it counts as updated now, as Paseo may not touch its record while a turn runs. `status` is
 * the status it shows (shownStatus), its own by default.
 */
export function matchesFilter(agent: BoardAgent, filter: BoardFilter, now: number, context: { activeNow?: boolean; status?: Indicator } = {}): boolean {
  if (filter.statuses.length && !filter.statuses.includes(context.status ?? indicatorOf(agent))) return false;
  const windowMs = updatedWithinMs(filter.updatedWithin);
  if (windowMs !== null && !context.activeNow) {
    const at = Date.parse(agent.updatedAt);
    if (Number.isNaN(at) || at < now - windowMs) return false;
  }
  if (filter.providers.length && !filter.providers.includes(agent.provider)) return false;
  if (filter.labels.length && !agent.labels.some((label) => filter.labels.includes(label))) return false;
  if (filter.projects.length && !(agent.project && filter.projects.includes(agent.project))) return false;
  if (filter.workspaces.length && !(agent.workspaceId && filter.workspaces.includes(agent.workspaceId))) return false;
  const haystack = [agent.title, agent.provider, agent.project, agent.workspace, agent.branch].filter(Boolean).join(" ").toLowerCase();
  return filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

export interface FilterGroup {
  value: string;
  label: string;
  count: number;
}

// What each filter menu lists, with how many agents on the board fall in it. With empty groups
// shown, Paseo's other labels, projects and workspaces are listed too, at 0.
export function filterGroups(agents: readonly BoardAgent[], known: { labels: readonly string[]; projects: readonly string[]; workspaces: readonly { id: string; name: string }[] }, showEmpty: boolean) {
  const tally = (values: { value: string; label: string }[], extra: { value: string; label: string }[]): FilterGroup[] => {
    const groups = new Map<string, FilterGroup>();
    if (showEmpty) for (const item of extra) groups.set(item.value, { ...item, count: 0 });
    for (const item of values) {
      const group = groups.get(item.value) ?? { ...item, count: 0 };
      groups.set(item.value, { ...group, count: group.count + 1 });
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  };
  const named = (value: string) => ({ value, label: value });
  const workspaceName = new Map(known.workspaces.map((item) => [item.id, item.name]));
  return {
    providers: tally(agents.map((agent) => named(agent.provider)), []),
    labels: tally(agents.flatMap((agent) => agent.labels.map(named)), known.labels.map(named)),
    projects: tally(agents.flatMap((agent) => (agent.project ? [named(agent.project)] : [])), known.projects.map(named)),
    workspaces: tally(
      agents.flatMap((agent) => (agent.workspaceId ? [{ value: agent.workspaceId, label: workspaceName.get(agent.workspaceId) ?? agent.workspace ?? agent.workspaceId }] : [])),
      known.workspaces.map((item) => ({ value: item.id, label: item.name })),
    ),
  };
}

export const SORT_KEYS = ["updated", "created", "title", "workspace", "project", "branch", "folder", "context", "duration"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export function contextShare(context: BoardAgent["context"]): number | null {
  if (!context || context.max <= 0) return null;
  return Math.min(1, Math.max(0, context.used / context.max));
}

// Names A to Z; times newest first; context and the running turn's duration largest first.
// Missing values go last; ties go by id, so the order never flickers.
export function compareAgents(key: SortKey, now: number) {
  const time = (at: string) => (Number.isNaN(Date.parse(at)) ? null : Date.parse(at));
  const values: Record<SortKey, (agent: BoardAgent) => string | number | null> = {
    title: (agent) => agent.title,
    workspace: (agent) => agent.workspace,
    project: (agent) => agent.project,
    branch: (agent) => agent.branch,
    folder: (agent) => (agent.cwd ? folderOf(agent.cwd) : null),
    created: (agent) => time(agent.createdAt),
    updated: (agent) => time(agent.updatedAt),
    context: (agent) => contextShare(agent.context),
    duration: (agent) => (agent.turnStartedAt ? now - Date.parse(agent.turnStartedAt) : null),
  };
  const value = values[key];
  return (left: BoardAgent, right: BoardAgent): number => {
    const a = value(left);
    const b = value(right);
    if (a !== b) {
      if (a === null) return 1;
      if (b === null) return -1;
      const order = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(b) - Number(a);
      if (order !== 0) return order;
    }
    return left.id.localeCompare(right.id);
  };
}

// ---------- Keys and refreshes ----------

// The card focused after J/K (up, down) or H/L (left, right): within a lane it stops at the ends;
// across lanes it skips empty ones and keeps the row where it can. Nothing focused starts on the first card.
export function moveFocus(lanes: readonly (readonly string[])[], focused: string | null, move: "up" | "down" | "left" | "right"): string | null {
  const laneIndex = focused === null ? -1 : lanes.findIndex((lane) => lane.includes(focused));
  if (laneIndex < 0) return lanes.find((lane) => lane.length)?.[0] ?? null;
  const row = lanes[laneIndex].indexOf(focused as string);
  if (move === "up" || move === "down") return lanes[laneIndex][Math.max(0, Math.min(lanes[laneIndex].length - 1, row + (move === "down" ? 1 : -1)))];
  const step = move === "right" ? 1 : -1;
  for (let index = laneIndex + step; index >= 0 && index < lanes.length; index += step) {
    if (lanes[index].length) return lanes[index][Math.min(row, lanes[index].length - 1)];
  }
  return focused;
}

export const USAGE_REFRESH_MS = 60_000;

// A card on screen reads its agent's usage again at most once a minute.
export const dueForRefresh = (lastAt: number | undefined, now: number) => lastAt === undefined || now - lastAt >= USAGE_REFRESH_MS;

// ---------- Lane layout ----------

// An empty lane, and Archived until opened, fold to a short header with the lane's name and count.
export const LANE_STRIP = 132;
export const LANE_MIN = 240;
// The Lane width setting is the widest an open lane grows to.
export const LANE_MAX: Record<LaneWidth, number> = { narrow: 300, default: 420, wide: 520 };
const FOLDED_AT_START: ReadonlySet<Lane> = new Set(["archived"]);

/** Whether a lane shows folded: the user's own choice for it, else folded when empty, and Archived folded at first. */
export function laneFolded(lane: Lane, count: number, choice: boolean | undefined): boolean {
  if (choice !== undefined) return choice;
  return count === 0 || FOLDED_AT_START.has(lane);
}

/** Which lanes show folded. */
export function foldedLanes(lanes: readonly { lane: Lane; count: number; choice: boolean | undefined }[]): Set<Lane> {
  return new Set(lanes.filter((item) => laneFolded(item.lane, item.count, item.choice)).map((item) => item.lane));
}

/**
 * Each open lane's width when they share the board: what is left after the strips and gaps, split evenly, between LANE_MIN and
 * the setting's maximum. `scrolls` is true when even LANE_MIN does not fit, so the board scrolls sideways.
 */
export function openLaneWidth(input: { width: number; open: number; folded: number; gap: number; padding: number; max: number }): { width: number; scrolls: boolean } {
  if (input.open === 0) return { width: 0, scrolls: false };
  const lanes = input.open + input.folded;
  const free = input.width - 2 * input.padding - input.gap * Math.max(0, lanes - 1) - input.folded * LANE_STRIP;
  const share = Math.floor(free / input.open);
  if (share < LANE_MIN) return { width: LANE_MIN, scrolls: true };
  return { width: Math.min(share, input.max), scrolls: false };
}

// ---------- Card text ----------

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The agent's model as a card says it: "claude-opus-5-5" reads "Opus 5.5", with the provider left out when the id already
 * names it. Ids of another shape are shown as given, after the provider when they do not start with it.
 */
export function modelLabel(provider: string | null, model: string | null): string | null {
  const name = provider?.split("/")[0] ?? null;
  if (!model) return name;
  const shaped = /^([a-z]+)-([a-z]+)-(\d+)-(\d+)$/.exec(model);
  if (shaped && (!name || shaped[1] === name)) return `${capital(shaped[2]!)} ${shaped[3]}.${shaped[4]}`;
  return name && !model.startsWith(name) ? `${name} · ${model}` : model;
}

/** Whether the folder adds anything: not when it is the project's or the workspace's name. */
export function folderAddsSomething(folder: string, project: string | null, workspace: string | null): boolean {
  const same = (other: string | null) => !!other && other.toLowerCase() === folder.toLowerCase();
  return !same(project) && !same(workspace);
}

// ---------- List view ----------

// How the Agents and Tasks views lay items out: a list grouped by status or lanes (columns).
export const VIEW_LAYOUTS = ["list", "board"] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];

// The list puts what needs the user first (as Claude Code's agent view does), then what runs, then what is finished.
export const LIST_ORDER: readonly Lane[] = ["waiting", "review", "running", "done", "archived"];
// Done and Archived show this many rows, then a button for more.
export const LIST_PREVIEW = 8;

export interface ListSection {
  lane: Lane;
  folded: boolean;
  limit: number;
}

/**
 * The list's sections in LIST_ORDER, folded as laneFolded says (an empty one folded), with how many rows each shows.
 * Empty sections show only with `showEmpty` (the "Show groups with no agents" setting).
 */
export function listSections(counts: Readonly<Partial<Record<Lane, number>>>, choices: Partial<Record<Lane, boolean>>, shown: Partial<Record<Lane, number>> = {}, showEmpty = false): ListSection[] {
  return LIST_ORDER.filter((lane) => counts[lane] !== undefined && (showEmpty || counts[lane]! > 0)).map((lane) => ({
    lane,
    folded: laneFolded(lane, counts[lane]!, choices[lane]),
    limit: shown[lane] ?? (lane === "done" || lane === "archived" ? LIST_PREVIEW : Number.POSITIVE_INFINITY),
  }));
}

/** The second line of a row: what the agent asks, why it failed, the step it works on, else its first prompt (or nothing). */
export function rowLine(input: { indicator: Indicator; permission: PermissionSummary | null; error: string | null; step: string | null; subtitle: string | null }): string | null {
  if (input.indicator === "needs_input") return previewLine({ reason: "permission", permission: input.permission, error: "" });
  if (input.indicator === "failed") return previewLine({ reason: "failed", permission: null, error: input.error ?? "" });
  if (input.indicator === "running" && input.step) return `Working on: ${input.step}`;
  return input.subtitle;
}

// ---------- Titles ----------

/** Every http(s) link in the text shortened to its host (without "www." or a login) and the last part of its path: "acme.slack.com/…/p1794". */
export function shortLinks(value: string): string {
  return value.replace(/https?:\/\/[^\s<>()"']+/gi, (link) => {
    const trail = /[.,;:!?]+$/.exec(link)?.[0] ?? "";
    const parsed = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(link.slice(0, link.length - trail.length));
    if (!parsed) return link;
    const parts = parsed[2]!.split("/").filter(Boolean);
    const host = parsed[1]!.replace(/^.*@/, "").replace(/^www\./i, "");
    const path = parts.length === 0 ? "" : parts.length === 1 ? `/${parts[0]}` : `/…/${parts[parts.length - 1]}`;
    return host + path + trail;
  });
}

/**
 * The bold line of a card or row and the muted line under it. Paseo's agent title is usually the first prompt; a
 * workspace title that reads as a phrase (it has a space) says the task better, so it leads, with the prompt under it.
 * It leads only for the one agent of its workspace, and never for a sub-agent, so no two rows share a bold line.
 * A workspace named like a slug, the same as the project, or the start of the agent's title adds nothing.
 */
export function agentHeadline(agent: Pick<BoardAgent, "title" | "workspace" | "project" | "parentId">, workspaceShared: boolean): { title: string; subtitle: string | null } {
  const workspace = agent.workspace?.trim() ?? "";
  const leads = !workspaceShared && !agent.parentId && workspace.includes(" ") && workspace !== agent.project && !agent.title.startsWith(workspace);
  return leads ? { title: shortLinks(workspace), subtitle: shortLinks(agent.title) } : { title: shortLinks(agent.title), subtitle: null };
}
