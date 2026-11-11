import { describe, expect, it } from "vitest";
import { type ArchiveCandidate, dueForArchive } from "./auto-archive";

const now = new Date("2026-11-20T12:00:00Z");
const entered = "2026-11-01T12:00:00Z";
const oldMark = { kind: "done" as const, at: "2026-11-10T12:00:00Z", since: entered };
const base: ArchiveCandidate = { open: true, pinned: false, status: "done", statusEnteredAt: entered, dirty: false, ahead: 0, paseoWorktree: true, projectKind: "git", mark: oldMark };
const rule = { days: 7 };

describe("dueForArchive", () => {
  it("archives a clean worktree marked done that many days ago", () => {
    expect(dueForArchive(base, rule, now)).toBe(true);
    expect(dueForArchive({ ...base, mark: { ...oldMark, at: "2026-11-18T12:00:00Z" } }, rule, now)).toBe(false);
  });

  it("never archives a worktree whose git state is unknown, dirty or unpushed", () => {
    expect(dueForArchive({ ...base, dirty: null }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, dirty: true }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, ahead: 1 }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, ahead: null }, rule, now)).toBe(false);
  });

  it("archives a folder that archiving keeps, whatever its git state", () => {
    expect(dueForArchive({ ...base, paseoWorktree: false, dirty: true }, rule, now)).toBe(true);
    expect(dueForArchive({ ...base, projectKind: "directory", paseoWorktree: null, dirty: null, ahead: null }, rule, now)).toBe(true);
  });

  it("never archives unfinished, pinned or closed workspaces, a lapsed mark, or with the rule off", () => {
    for (const status of ["running", "needs_input", "failed"]) expect(dueForArchive({ ...base, status }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, statusEnteredAt: "2026-11-15T12:00:00Z" }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, mark: { ...oldMark, kind: "unread" } }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, pinned: true }, rule, now)).toBe(false);
    expect(dueForArchive({ ...base, open: false }, rule, now)).toBe(false);
    expect(dueForArchive(base, null, now)).toBe(false);
  });
});
