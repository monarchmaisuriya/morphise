import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { WorkStore } from "./work-store";
import { EMPTY_CHECKPOINT } from "../shared/work-checkpoints";

it("rejects stale checkpoint writers and retains persisted attribution on restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-store-"));
  try {
    const file = join(root, "records.json"), store = new WorkStore(file, () => 1000);
    await store.saveCheckpoint("workspace", 0, { ...EMPTY_CHECKPOINT, goal: "Ship tests" }, "user");
    await expect(store.saveCheckpoint("workspace", 0, EMPTY_CHECKPOINT, "agent:a")).rejects.toThrow("changed elsewhere");
    expect((await new WorkStore(file).readCheckpoint("workspace")).fields.goal).toBe("Ship tests");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("records duplicate turns once and marks unfinished intervals uncertain after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-calendar-"));
  try {
    let now = 1000; const file = join(root, "records.json"), store = new WorkStore(file, () => now);
    const actor = { id: "agent", workspaceId: "workspace", provider: "fake", title: "Test" };
    await store.start(actor, "turn"); await store.start(actor, "turn"); now = 2000;
    expect((await store.calendar(0, 3000)).intervals).toHaveLength(1);
    const record = (await new WorkStore(file, () => now).calendar(0, 3000)).intervals[0]!;
    expect(record).toMatchObject({ endAt: 1000, outcome: "interrupted", uncertain: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("does not publish checkpoint revisions when persistence fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-failure-"));
  try {
    let fail = false;
    const store = new WorkStore(join(root, "record.json"), () => 1000, async () => { if (fail) throw new Error("Disk full"); });
    await store.readCheckpoint("workspace"); fail = true;
    await expect(store.saveCheckpoint("workspace", 0, { ...EMPTY_CHECKPOINT, goal: "Unsaved" }, "user")).rejects.toThrow("Disk full");
    expect((await store.readCheckpoint("workspace")).revision).toBe(0);
    fail = false;
    expect((await store.saveCheckpoint("workspace", 0, EMPTY_CHECKPOINT, "user")).revision).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("ignores late mismatched ends and never invents a start for an orphan end", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-events-"));
  try {
    let now = 1000; const store = new WorkStore(join(root, "records.json"), () => now);
    const actor = { id: "agent", workspaceId: "workspace", provider: "fake", title: "Task" };
    await store.end("agent", "orphan", "completed");
    expect((await store.calendar(0, 5000)).intervals).toHaveLength(0);
    await store.start(actor, "first"); now = 2000; await store.start(actor, "second");
    await store.end("agent", "first", "completed");
    expect((await store.calendar(0, 5000)).intervals[1]!.endAt).toBeNull();
    now = 3000; await store.end("agent", "second", "completed");
    expect((await store.calendar(0, 5000)).intervals[1]).toMatchObject({ startAt: 2000, endAt: 3000, uncertain: false });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("marks null-ID intervals uncertain and does not close a real-ID turn with a null end", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-null-turn-"));
  try {
    let now = 1000; const store = new WorkStore(join(root, "records.json"), () => now);
    const actor = { id: "agent", workspaceId: "workspace", provider: "fake", title: "Task" };
    await store.start(actor, null); now = 2000; await store.end("agent", null, "completed");
    await store.start(actor, "real"); now = 3000; await store.end("agent", null, "completed");
    const values = (await store.calendar(0, 5000)).intervals;
    expect(values[0]).toMatchObject({ uncertain: true, startAt: 1000, endAt: 2000 });
    expect(values[1]).toMatchObject({ turnId: "real", endAt: null, uncertain: false });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("does not overwrite corrupt storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-corrupt-"));
  try {
    const file = join(root, "records.json"); await writeFile(file, "not-json");
    await expect(new WorkStore(file).readCheckpoint("workspace")).rejects.toThrow("could not be loaded");
    expect(await readFile(file, "utf8")).toBe("not-json");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("prunes terminal history without dropping running intervals", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-retention-"));
  try {
    let now = 1000; const store = new WorkStore(join(root, "records.json"), () => now);
    const actor = { id: "agent", workspaceId: "workspace", provider: "fake", title: "Task" };
    await store.start(actor, "old"); now = 2000; await store.end("agent", "old", "completed");
    now = 91 * 86400000; await store.start(actor, "new");
    expect(await store.calendar(0, now + 1)).toMatchObject({ pruned: 1, intervals: [{ turnId: "new", endAt: null }] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
