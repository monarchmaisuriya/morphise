// The Activity tab's index: every agent Paseo lists (archived ones too, background workspaces' workers not), with what
// its Claude Code or Codex log says, folded by ActivityFold and kept in a file in Paseo's plugin cache. Each run reads
// only what the logs gained since the last one, within a budget, so a first run over a large history spans several
// calls. Agents are only listed: no agent is refreshed, reloaded or read through its timeline, which would resume it.
// After Activity by koinzhang (koinzhang/paseo-plugins, activity/, MIT, see NOTICE.md): server/background-sync.ts and
// server/store.ts at 83a1c90, reading logs instead of timelines and a JSON file instead of SQLite.
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ActivityAgent, ChatActivity } from "../../shared/activity";
import { type ActivityPending, ActivityFold } from "../stats/fold-activity";
import type { SessionReader } from "../stats/sessions";

// Raise when the saved fields change: an index file of another version is rebuilt.
const VERSION = 2;
const LIST_TTL_MS = 30_000;
const MISSING_TTL_MS = 5 * 60_000;
const PAGE = 200;
const MAX_AGENTS = 5000;
// Each call to Paseo or the file system while indexing; a stuck one fails this run instead of holding every later call.
const CALL_TIMEOUT_MS = 8_000;

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer in time`)), CALL_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export interface IndexLimits {
  maxBytes: number;
  maxMs: number;
}
export const DEFAULT_INDEX_LIMITS: IndexLimits = { maxBytes: 64 * 1024 * 1024, maxMs: 10_000 };

// The parts of Paseo's agent and workspace lists the index reads.
export interface ListedAgent {
  id: string;
  provider: string;
  cwd: string;
  workspaceId?: string;
  createdAt: string;
  archivedAt?: string | null;
  persistence?: { sessionId?: string; nativeHandle?: string } | null;
}
export interface ActivityPaseo {
  agents: { list(options: { filter: { includeArchived: boolean }; page: { limit: number; cursor?: string } }): Promise<{ entries: { agent: ListedAgent }[]; pageInfo: { hasMore: boolean; nextCursor?: string | null } }> };
  workspaces: { list(options: { page?: { limit: number; cursor?: string } }): Promise<{ entries: { id: string; projectDisplayName: string; projectCustomName?: string | null }[]; pageInfo: { hasMore: boolean; nextCursor?: string | null } }> };
}

interface IndexedAgent {
  provider: string;
  workspaceId: string | null;
  createdAt: number;
  sessionId: string | null;
  cwd: string;
  path: string | null;
  ino: number;
  // Always the start of a line: bytes after it have not been counted.
  offset: number;
  size: number;
  // The file size when a read last reached its end; equal to `size` when only an unfinished last line is left.
  readTo: number;
  // Lines older than this are not counted: the agent's creation, or, after its log moved to a new file, the newest
  // line already counted (a new file may repeat earlier history).
  since: number;
  lastAt: number;
  // When a missing log is looked for again.
  missingUntil: number;
  // A log that could not be read; tried again once its size changes.
  error: string | null;
  // No longer listed by Paseo: its counts stay as history, its log is not read again.
  gone: boolean;
  activity: ChatActivity;
  pending: ActivityPending;
}

interface IndexFile {
  version: number;
  agents: Record<string, IndexedAgent>;
}

export interface IndexState {
  agents: (ActivityAgent & { id: string })[];
  providers: string[];
  indexing: { done: number; total: number; errors: number };
}

const READABLE = new Set(["claude", "codex"]);
const emptyActivity = (): ChatActivity => ({ slots: {}, skills: {}, mcp: {}, coding: false });
const emptyPending = (): ActivityPending => ({ openMcp: {}, awaitingModel: [], model: null });

export class ActivityIndex {
  private data: IndexFile | null = null;
  private listedAt = 0;
  private projects = new Map<string, string>();
  private running: Promise<IndexState> | null = null;

  constructor(
    private file: string,
    private reader: Pick<SessionReader, "findLog">,
    private limits: IndexLimits = DEFAULT_INDEX_LIMITS,
    private now: () => number = Date.now,
  ) {}

  // One run at a time: a call while one runs gets that run's result, so no log is folded twice and the file is written
  // by one run only.
  run(paseo: ActivityPaseo): Promise<IndexState> {
    this.running ??= this.runOnce(paseo).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async load(): Promise<IndexFile> {
    if (this.data) return this.data;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as IndexFile;
      this.data = parsed && parsed.version === VERSION && typeof parsed.agents === "object" ? parsed : { version: VERSION, agents: {} };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[morphise] activity index unreadable, starting over: ${error instanceof Error ? error.message : String(error)}`);
      this.data = { version: VERSION, agents: {} };
    }
    return this.data;
  }

  private async save(data: IndexFile) {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(data));
    await rename(temp, this.file);
  }

  private async list(paseo: ActivityPaseo, data: IndexFile): Promise<boolean> {
    if (this.now() - this.listedAt < LIST_TTL_MS) return false;
    let changed = false;
    const listed = new Set<string>();
    let cursor: string | undefined;
    do {
      const page: Awaited<ReturnType<ActivityPaseo["agents"]["list"]>> = await withTimeout(paseo.agents.list({ filter: { includeArchived: true }, page: { limit: PAGE, ...(cursor ? { cursor } : {}) } }), "Paseo's agent list");
      for (const { agent } of page.entries) {
        listed.add(agent.id);
        const sessionId = agent.persistence?.nativeHandle || agent.persistence?.sessionId || null;
        const known = data.agents[agent.id];
        const createdAt = Date.parse(agent.createdAt);
        if (known) {
          if (known.workspaceId !== (agent.workspaceId ?? null) || known.gone) changed = true;
          known.workspaceId = agent.workspaceId ?? null;
          known.gone = false;
          if (sessionId && sessionId !== known.sessionId) {
            Object.assign(known, { sessionId, path: null, missingUntil: 0 });
            changed = true;
          }
        } else {
          const created = Number.isFinite(createdAt) ? createdAt : this.now();
          data.agents[agent.id] = { provider: agent.provider, workspaceId: agent.workspaceId ?? null, createdAt: created, sessionId, cwd: agent.cwd, path: null, ino: 0, offset: 0, size: 0, readTo: -1, since: created, lastAt: 0, missingUntil: 0, error: null, gone: false, activity: emptyActivity(), pending: emptyPending() };
          changed = true;
        }
      }
      cursor = page.pageInfo.hasMore && page.pageInfo.nextCursor ? page.pageInfo.nextCursor : undefined;
    } while (cursor && listed.size < MAX_AGENTS);
    for (const [id, agent] of Object.entries(data.agents)) {
      if (!listed.has(id) && !agent.gone) {
        agent.gone = true;
        changed = true;
      }
    }
    this.projects = new Map();
    cursor = undefined;
    do {
      const page: Awaited<ReturnType<ActivityPaseo["workspaces"]["list"]>> = await withTimeout(paseo.workspaces.list({ page: { limit: PAGE, ...(cursor ? { cursor } : {}) } }), "Paseo's workspace list");
      for (const workspace of page.entries) this.projects.set(workspace.id, workspace.projectCustomName || workspace.projectDisplayName);
      cursor = page.pageInfo.hasMore && page.pageInfo.nextCursor ? page.pageInfo.nextCursor : undefined;
    } while (cursor);
    this.listedAt = this.now();
    return changed;
  }

  private async runOnce(paseo: ActivityPaseo): Promise<IndexState> {
    const data = await this.load();
    let changed = await this.list(paseo, data);
    const deadline = this.now() + this.limits.maxMs;
    let budget = this.limits.maxBytes;
    // Find each readable agent's log and its size.
    const work: [string, IndexedAgent][] = [];
    for (const [id, agent] of Object.entries(data.agents)) {
      if (agent.gone || !READABLE.has(agent.provider) || !agent.sessionId) continue;
      if (!agent.path) {
        if (agent.missingUntil > this.now()) continue;
        const log = await withTimeout(this.reader.findLog(agent.provider, agent.sessionId, agent.cwd), "Finding a log").catch(() => ({ kind: "unavailable" as const, reason: "" }));
        if (log.kind !== "found") {
          agent.missingUntil = this.now() + MISSING_TTL_MS;
          continue;
        }
        if (log.path !== agent.path) {
          // A new file (the session moved): count only lines newer than those already counted.
          Object.assign(agent, { path: log.path, ino: 0, offset: 0, readTo: -1, since: Math.max(agent.since, agent.lastAt + 1), pending: emptyPending() });
        }
        changed = true;
      }
      let info: { size: number; ino: number };
      try {
        info = await withTimeout(stat(agent.path as string), "Reading a log's size");
      } catch {
        Object.assign(agent, { path: null, missingUntil: this.now() + MISSING_TTL_MS });
        continue;
      }
      if (agent.error && info.size === agent.size) continue;
      if (info.ino !== agent.ino || info.size < agent.offset) {
        // A replaced or shorter file: read it from the start, counting only lines newer than those already counted.
        Object.assign(agent, { ino: info.ino, offset: 0, readTo: -1, error: null, since: agent.ino ? Math.max(agent.since, agent.lastAt + 1) : agent.since, pending: emptyPending() });
        changed = true;
      }
      agent.size = info.size;
      if (info.size > agent.offset && agent.readTo !== info.size) work.push([id, agent]);
    }
    // The most recently created chats first, so today's numbers fill in before old history.
    work.sort((a, b) => b[1].createdAt - a[1].createdAt);
    for (const [id, agent] of work) {
      if (budget <= 0 || this.now() > deadline) break;
      try {
        budget -= await this.fold(agent, budget, deadline);
        agent.error = null;
      } catch (error) {
        agent.error = error instanceof Error ? error.message : String(error);
        console.warn(`[morphise] activity could not read ${id}'s log: ${agent.error}`);
      }
      changed = true;
    }
    if (changed) await this.save(data);
    return this.state(data);
  }

  // Folds complete lines from the saved position, at most `budget` bytes; returns the bytes read.
  private async fold(agent: IndexedAgent, budget: number, deadline: number): Promise<number> {
    const provider = agent.provider === "codex" ? "codex" : "claude";
    const fold = ActivityFold.restore(provider, agent.activity, agent.pending, agent.since);
    fold.lastAt = agent.lastAt;
    const end = Math.min(agent.size, agent.offset + budget);
    const stream = createReadStream(agent.path as string, { start: agent.offset, end: end - 1 });
    // Lines are split on newline bytes and counted in raw bytes, so the saved position is a line start even when a
    // line holds bytes that are not valid UTF-8.
    let carry: Buffer = Buffer.alloc(0);
    let consumed = 0;
    try {
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        const buffer = carry.length ? Buffer.concat([carry, chunk]) : chunk;
        let start = 0;
        for (let newline = buffer.indexOf(10, start); newline !== -1; newline = buffer.indexOf(10, start)) {
          const line = buffer.toString("utf8", start, newline);
          consumed += newline - start + 1;
          start = newline + 1;
          if (!line.trim()) continue;
          let row: unknown;
          try {
            row = JSON.parse(line);
          } catch {
            throw new Error("the log has an invalid JSON line");
          }
          fold.apply(row);
        }
        carry = buffer.subarray(start);
        if (this.now() > deadline) break;
      }
      if (consumed === 0 && end - agent.offset >= this.limits.maxBytes) throw new Error(`a line is longer than ${this.limits.maxBytes} bytes`);
    } finally {
      stream.destroy();
      // Only whole lines count; the unfinished one is read again next time.
      agent.offset += consumed;
      // Reached the end with only an unfinished line left: done until the file grows.
      if (end === agent.size && agent.offset + carry.length === agent.size) agent.readTo = agent.size;
      agent.activity = fold.activity;
      agent.pending = fold.pending;
      agent.lastAt = fold.lastAt;
    }
    return Math.max(consumed, 1);
  }

  private state(data: IndexFile): IndexState {
    let total = 0;
    let done = 0;
    let errors = 0;
    const providers = new Set<string>();
    const agents: IndexState["agents"] = [];
    for (const [id, agent] of Object.entries(data.agents)) {
      providers.add(agent.provider);
      if (!agent.gone && READABLE.has(agent.provider) && agent.path) {
        total++;
        if (agent.error) errors++;
        else if (agent.offset >= agent.size || agent.readTo === agent.size) done++;
      }
      agents.push({ id, provider: agent.provider, workspaceId: agent.workspaceId, project: agent.workspaceId ? this.projects.get(agent.workspaceId) ?? null : null, createdAt: agent.createdAt, activity: agent.activity });
    }
    return { agents, providers: [...providers].sort(), indexing: { done, total, errors } };
  }
}
