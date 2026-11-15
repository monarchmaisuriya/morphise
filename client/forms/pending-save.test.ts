import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingSave } from "./pending-save";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createPendingSave", () => {
  it("saves once the delay passes after the last edit", () => {
    const saves: string[] = [];
    const pending = createPendingSave(600);
    pending.schedule(() => saves.push("a"));
    vi.advanceTimersByTime(300);
    pending.schedule(() => saves.push("ab"));
    vi.advanceTimersByTime(599);
    expect(saves).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(saves).toEqual(["ab"]);
  });

  it("saves a waiting edit at once when flushed, as on leaving the screen, and only once", () => {
    const saves: string[] = [];
    const pending = createPendingSave(600);
    pending.schedule(() => saves.push("last edit"));
    pending.flush();
    expect(saves).toEqual(["last edit"]);
    vi.advanceTimersByTime(600);
    pending.flush();
    expect(saves).toEqual(["last edit"]);
  });

  it("drops a waiting edit when cancelled, as when a newer edit replaces it", () => {
    const saves: string[] = [];
    const pending = createPendingSave(600);
    pending.schedule(() => saves.push("old"));
    pending.cancel();
    vi.advanceTimersByTime(600);
    pending.flush();
    expect(saves).toEqual([]);
  });
});
