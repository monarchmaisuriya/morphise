// Ported from Harness Stats (kogekiplay/paseo-harness-stats, MIT, see NOTICE.md): server/sessions.ts at 4e8fae9
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { SessionCounters, StatsProvider } from "../../shared/stats";
import { chatTools, type ChatTools } from "../../shared/activity";
import { ActivityFold } from "./fold-activity";
import { SessionFold } from "./fold";

export interface SessionRoots {
  claude: string;
  codex: string;
}

export function defaultRoots(env: Record<string, string | undefined> = process.env): SessionRoots {
  return { codex: env.CODEX_HOME || join(homedir(), ".codex"), claude: env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude") };
}

// One read takes at most this many bytes (a long log is folded over several reads) and stops early
// past its time budget, so an RPC answers well inside the 30 s Paseo gives it.
export interface ReadLimits {
  maxBytes: number;
  maxMs: number;
}
export const DEFAULT_READ_LIMITS: ReadLimits = { maxBytes: 64 * 1024 * 1024, maxMs: 15_000 };

export type SessionRead = { kind: "ready"; provider: StatsProvider; stats: SessionCounters; tools: ChatTools; partial: boolean } | { kind: "unavailable"; reason: string };

interface CachedSession {
  fold: SessionFold;
  activity: ActivityFold;
  offset: number;
  ino: number;
  tail: string;
  decoder: StringDecoder;
  busy: Promise<SessionRead> | null;
}

const isProvider = (provider: string): provider is StatsProvider => provider === "claude" || provider === "codex";

/** Reads only appended bytes; the cache contains counters, never conversation text. */
export class SessionReader {
  private cache = new Map<string, CachedSession>();
  private codexPaths = new Map<string, string>();
  private indexAt = 0;
  private indexing: Promise<void> | null = null;
  constructor(
    private roots: SessionRoots = defaultRoots(),
    private limits: ReadLimits = DEFAULT_READ_LIMITS,
  ) {}

  private async exists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  private async indexCodex() {
    if (this.indexing) return this.indexing;
    if (Date.now() - this.indexAt < 15_000) return;
    this.indexing = (async () => {
      const root = join(this.roots.codex, "sessions");
      let files: string[];
      try {
        files = await readdir(root, { recursive: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        files = [];
      }
      for (const file of files) {
        const match = /rollout-.*-([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i.exec(file);
        if (match) this.codexPaths.set(match[1], join(root, file));
      }
      this.indexAt = Date.now();
    })();
    try {
      await this.indexing;
    } finally {
      this.indexing = null;
    }
  }
  async locate(provider: StatsProvider, sessionId: string, cwd: string): Promise<string | null> {
    // The path is built from the id, so an id with a separator or dots could name another file.
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error("Not a session id");
    if (provider === "codex") {
      const cached = this.codexPaths.get(sessionId);
      if (cached && (await this.exists(cached))) return cached;
      await this.indexCodex();
      return this.codexPaths.get(sessionId) ?? null;
    }
    const root = join(this.roots.claude, "projects");
    if (isAbsolute(cwd)) {
      const direct = join(root, cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${sessionId}.jsonl`);
      if (await this.exists(direct)) return direct;
    }
    let projects: string[];
    try {
      projects = await readdir(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    for (const project of projects) {
      const file = join(root, project, `${sessionId}.jsonl`);
      if (await this.exists(file)) return file;
    }
    return null;
  }
  /** The chat's log file, or why there is none to read. Throws on a session id that is not one. */
  async findLog(provider: string, sessionId: string | null, cwd: string): Promise<{ kind: "found"; provider: StatsProvider; path: string } | { kind: "unavailable"; reason: string }> {
    if (!isProvider(provider)) return { kind: "unavailable", reason: `No log Morphise can read for ${provider} chats` };
    if (!sessionId) return { kind: "unavailable", reason: "The chat has no session yet" };
    const path = await this.locate(provider, sessionId, cwd);
    return path ? { kind: "found", provider, path } : { kind: "unavailable", reason: "No session log yet" };
  }
  async read(providerName: string, sessionId: string | null, cwd: string): Promise<SessionRead> {
    const log = await this.findLog(providerName, sessionId, cwd);
    if (log.kind === "unavailable") return log;
    const { provider, path } = log;
    let cached = this.cache.get(path);
    if (!cached) {
      cached = { fold: new SessionFold(provider), activity: new ActivityFold(provider), offset: 0, ino: 0, tail: "", decoder: new StringDecoder("utf8"), busy: null };
      this.cache.set(path, cached);
    }
    // Concurrent windows share one read, including the initial full-log fold.
    if (cached.busy) return cached.busy;
    this.cache.delete(path);
    this.cache.set(path, cached);
    if (this.cache.size > 32) {
      for (const [key, entry] of this.cache) {
        if (key !== path && !entry.busy) {
          this.cache.delete(key);
          break;
        }
      }
    }
    const entry = cached;
    entry.busy = (async (): Promise<SessionRead> => {
      const info = await stat(path);
      if (entry.ino !== info.ino || info.size < entry.offset) {
        entry.fold = new SessionFold(provider);
        entry.activity = new ActivityFold(provider);
        entry.offset = 0;
        entry.tail = "";
        entry.decoder = new StringDecoder("utf8");
      }
      entry.ino = info.ino;
      const end = Math.min(info.size, entry.offset + this.limits.maxBytes);
      const deadline = Date.now() + this.limits.maxMs;
      if (end > entry.offset) {
        const stream = createReadStream(path, { start: entry.offset, end: end - 1 });
        for await (const buffer of stream as AsyncIterable<Buffer>) {
          const chunk = entry.tail + entry.decoder.write(buffer);
          const lines = chunk.split("\n");
          entry.tail = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let row: unknown;
            try {
              row = JSON.parse(line);
            } catch {
              throw new Error("Session log contains an invalid JSON line");
            }
            entry.fold.apply(row);
            entry.activity.apply(row);
          }
          entry.offset += buffer.length;
          if (Date.now() > deadline) break;
        }
      }
      return { kind: "ready", provider, stats: { ...entry.fold.stats }, tools: chatTools(entry.activity.activity), partial: entry.offset < info.size };
    })();
    try {
      return await entry.busy;
    } catch (error) {
      this.cache.delete(path);
      throw error;
    } finally {
      entry.busy = null;
    }
  }
  clear() {
    this.cache.clear();
    this.codexPaths.clear();
  }
}
