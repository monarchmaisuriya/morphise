import { describe, expect, it } from "vitest";
import { MARK_KEY } from "../shared/row-meta";
import { createArchiveSweep, listEveryWorkspace } from "./auto-archive-sweep";
import { reduceWorkspaceInfo } from "./workspaces";

const now = new Date("2026-11-20T12:00:00Z");
const rule = { days: 7 };
const entered = "2026-11-01T12:00:00Z";

// A workspace record as Paseo sends it: marked done ten days ago, clean and pushed.
function record(id: string, change: { dirty?: boolean; status?: string } = {}) {
  return {
    id,
    name: id,
    projectKind: "git",
    status: change.status ?? "done",
    statusEnteredAt: entered,
    gitRuntime: { isDirty: change.dirty ?? false, aheadOfOrigin: 0, isPaseoOwnedWorktree: true },
    metadata: { [MARK_KEY]: { kind: "done", at: "2026-11-10T12:00:00Z", since: entered } },
  };
}

// A fake host: the list this app holds, what a fresh read returns (a null entry is gone), how many
// fresh reads were made, and every archive call.
function fakeHost(list: ReturnType<typeof record>[], options: { fresh?: Record<string, ReturnType<typeof record> | null>; readRejects?: boolean; archiveError?: string; archiveRejects?: boolean } = {}) {
  const archived: string[] = [];
  let reads = 0;
  const errors: string[] = [];
  const sweep = createArchiveSweep({
    workspaces: () => reduceWorkspaceInfo(new Map(), { snapshot: list }).values(),
    fetchWorkspaces: async () => {
      reads += 1;
      if (options.readRejects) throw new Error("connection lost");
      return list.map((item) => (options.fresh && item.id in options.fresh ? options.fresh[item.id] : item)).filter((item) => item !== null);
    },
    archive: async (id) => {
      archived.push(id);
      if (options.archiveRejects) throw new Error("connection lost");
      return { error: options.archiveError ?? null };
    },
    log: { info: () => {}, error: (message: string) => void errors.push(message) },
  });
  return { sweep, archived, reads: () => reads, errors };
}

describe("createArchiveSweep", () => {
  it("archives only the workspaces that are due", async () => {
    const host = fakeHost([record("due"), record("dirty", { dirty: true }), record("running", { status: "running" })]);
    await host.sweep(rule, now);
    expect(host.reads()).toBe(1);
    expect(host.archived).toEqual(["due"]);
  });

  it("tries each due workspace once across sweeps", async () => {
    const host = fakeHost([record("due")]);
    await host.sweep(rule, now);
    await host.sweep(rule, now);
    expect(host.archived).toEqual(["due"]);
  });

  it("logs a failed archive and does not try it again", async () => {
    const host = fakeHost([record("due")], { archiveError: "worktree busy" });
    await host.sweep(rule, now);
    await host.sweep(rule, now);
    expect(host.archived).toEqual(["due"]);
    expect(host.errors).toEqual(["[morphise] Could not auto-archive due: worktree busy"]);
  });

  it("logs an archive call that throws and does not try it again", async () => {
    const host = fakeHost([record("due")], { archiveRejects: true });
    await host.sweep(rule, now);
    await host.sweep(rule, now);
    expect(host.archived).toEqual(["due"]);
    expect(host.errors).toEqual(["[morphise] Could not auto-archive due"]);
  });

  it("re-reads a workspace before archiving and skips one that is no longer due", async () => {
    const host = fakeHost([record("due")], { fresh: { due: record("due", { dirty: true }) } });
    await host.sweep(rule, now);
    expect(host.reads()).toBe(1);
    expect(host.archived).toEqual([]);
  });

  it("skips a workspace that is gone when re-read", async () => {
    const host = fakeHost([record("due")], { fresh: { due: null } });
    await host.sweep(rule, now);
    expect(host.archived).toEqual([]);
  });

  it("logs a re-read that fails, archives nothing and does not try it again", async () => {
    const host = fakeHost([record("due")], { readRejects: true });
    await host.sweep(rule, now);
    await host.sweep(rule, now);
    expect(host.reads()).toBe(1);
    expect(host.archived).toEqual([]);
    expect(host.errors).toEqual(["[morphise] Could not auto-archive due"]);
  });

  it("sweeps a skipped workspace again later, once it is due again", async () => {
    const fresh: Record<string, ReturnType<typeof record> | null> = { due: record("due", { dirty: true }) };
    const host = fakeHost([record("due")], { fresh });
    await host.sweep(rule, now);
    fresh.due = record("due");
    await host.sweep(rule, now);
    expect(host.archived).toEqual(["due"]);
  });

  it("reads the host's list once per sweep, however many workspaces are due", async () => {
    const host = fakeHost([record("one"), record("two"), record("three")]);
    await host.sweep(rule, now);
    expect(host.reads()).toBe(1);
    expect(host.archived).toEqual(["one", "two", "three"]);
  });

  it("reads nothing when no workspace is due", async () => {
    const host = fakeHost([record("dirty", { dirty: true })]);
    await host.sweep(rule, now);
    expect(host.reads()).toBe(0);
  });
});

describe("listEveryWorkspace", () => {
  it("follows the pages until the host has no more", async () => {
    const pages: Record<string, { entries: { id: string }[]; pageInfo: { nextCursor: string | null } }> = {
      first: { entries: [{ id: "a" }, { id: "b" }], pageInfo: { nextCursor: "2" } },
      "2": { entries: [{ id: "c" }], pageInfo: { nextCursor: null } },
    };
    const asked: unknown[] = [];
    const list = async (options: { page: { limit: number; cursor?: string } }) => {
      asked.push(options);
      return pages[options.page.cursor ?? "first"]!;
    };
    expect(await listEveryWorkspace(list)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(asked).toEqual([{ page: { limit: 200 } }, { page: { limit: 200, cursor: "2" } }]);
  });
});
