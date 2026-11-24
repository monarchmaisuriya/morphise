import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { checkpointSchema, EMPTY_CHECKPOINT, type Checkpoint, type CheckpointFields } from "../shared/work-checkpoints";
import { intervalSchema, type WorkInterval } from "../shared/work-calendar";

const stateSchema = z.object({ version: z.literal(1), recordingSince: z.number(), pruned: z.number().int().nonnegative(), checkpoints: z.record(z.string(), checkpointSchema), intervals: z.array(intervalSchema).max(20000) });
type State = z.infer<typeof stateSchema>;
export interface WorkActor { id: string; workspaceId: string | null; provider: string; title: string | null; }

export class WorkStore {
  private state: State | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private recordingError: string | null = null;
  constructor(private file: string, private now = Date.now, private persist = async (file: string, text: string) => {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, text, { mode: 0o600 });
    await rename(temporary, file);
  }) {}

  private async load(): Promise<State> {
    if (this.state) return this.state;
    let saved: State;
    try { saved = stateSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Work records could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
      saved = { version: 1, recordingSince: this.now(), pruned: 0, checkpoints: {}, intervals: [] };
    }
    const recovered = { ...saved, intervals: saved.intervals.map((value) => value.endAt === null ? { ...value, endAt: value.startAt, outcome: "interrupted" as const, uncertain: true } : value) };
    await this.persist(this.file, JSON.stringify(recovered));
    this.state = recovered;
    return recovered;
  }

  private run<T>(operation: (state: State) => T | Promise<T>, write = false): Promise<T> {
    const work = this.queue.then(async () => {
      const state = await this.load();
      const next = structuredClone(state);
      const result = await operation(next);
      if (write) {
        const cutoff = this.now() - 90 * 86400000;
        next.intervals = next.intervals.filter((value) => { const keep = value.endAt === null || value.endAt >= cutoff; if (!keep) next.pruned++; return keep; });
        while (next.intervals.length > 20000) { const index = next.intervals.findIndex((value) => value.endAt !== null); if (index < 0) throw new Error("Calendar capacity reached with active turns; no interval was removed."); next.intervals.splice(index, 1); next.pruned++; }
        stateSchema.parse(next);
        await this.persist(this.file, JSON.stringify(next));
        this.state = next;
      }
      return structuredClone(result);
    });
    this.queue = work.catch(() => {});
    return work;
  }

  readCheckpoint(workspaceId: string) { return this.run((state) => state.checkpoints[workspaceId] ?? { workspaceId, revision: 0, fields: EMPTY_CHECKPOINT, author: "Not set", updatedAt: null }); }
  saveCheckpoint(workspaceId: string, revision: number, fields: CheckpointFields, author: string): Promise<Checkpoint> {
    return this.run((state) => {
      const current = state.checkpoints[workspaceId];
      if ((current?.revision ?? 0) !== revision) throw new Error("Checkpoint changed elsewhere. Your draft was kept; reload the latest checkpoint before saving again.");
      if (!current && Object.keys(state.checkpoints).length >= 2000) throw new Error("Checkpoint storage is full (2,000 workspaces).");
      const value = checkpointSchema.parse({ workspaceId, revision: revision + 1, fields, author, updatedAt: new Date(this.now()).toISOString() });
      state.checkpoints[workspaceId] = value;
      return value;
    }, true);
  }
  start(actor: WorkActor, turnId: string | null) {
    return this.run((state) => {
      if (turnId && state.intervals.some((value) => value.agentId === actor.id && value.turnId === turnId)) return;
      const at = this.now();
      for (const value of state.intervals) if (value.agentId === actor.id && value.endAt === null) { value.endAt = at; value.outcome = "interrupted"; value.uncertain = true; }
      state.intervals.push({ id: randomUUID(), agentId: actor.id, workspaceId: actor.workspaceId, provider: actor.provider, title: actor.title ?? "Untitled agent", turnId, startAt: at, endAt: null, outcome: "running", uncertain: turnId === null });
    }, true).catch((error) => { this.recordingError = error instanceof Error ? error.message : String(error); throw error; });
  }
  end(agentId: string, turnId: string | null, outcome: "completed" | "failed" | "canceled" | "interrupted") {
    return this.run((state) => {
      const value = state.intervals.find((entry) => entry.agentId === agentId && entry.endAt === null && entry.turnId === turnId);
      if (value) { value.endAt = Math.max(value.startAt, this.now()); value.outcome = outcome; if (outcome === "interrupted") value.uncertain = true; }
    }, true).catch((error) => { this.recordingError = error instanceof Error ? error.message : String(error); throw error; });
  }
  close(agentId: string) {
    return this.run((state) => { for (const value of state.intervals) if (value.agentId === agentId && value.endAt === null) { value.endAt = Math.max(value.startAt, this.now()); value.outcome = "interrupted"; value.uncertain = true; } }, true).catch((error) => { this.recordingError = error instanceof Error ? error.message : String(error); throw error; });
  }
  calendar(from: number, to: number) { return this.run((state) => {
    if (this.recordingError) throw new Error(`Calendar recording failed; coverage is incomplete: ${this.recordingError}`);
    const cutoff = this.now() - 90 * 86400000;
    return { recordingSince: state.recordingSince, pruned: state.pruned, intervals: state.intervals.filter((value) => (value.endAt === null || value.endAt >= cutoff) && value.startAt < to && (value.endAt ?? this.now()) >= from) };
  }); }
}
