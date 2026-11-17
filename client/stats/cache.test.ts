import { describe, expect, it } from "vitest";
import type { StatsReadResult } from "../../shared/stats";
import { createStatsCache } from "./cache";

const ready = (id: string): StatsReadResult => ({ status: "unavailable", reason: id });

describe("stats cache", () => {
  it("shares one read between callers asking at the same time", async () => {
    let calls = 0;
    const cache = createStatsCache(async (id) => (calls++, ready(id)));
    const [a, b] = await Promise.all([cache.read("x"), cache.read("x")]);
    expect([a, b, calls]).toEqual([ready("x"), ready("x"), 1]);
  });

  it("keeps a reading with turns apart from one without, for the same chat", async () => {
    const asked: [string, boolean][] = [];
    const cache = createStatsCache(async (id, turns) => (asked.push([id, turns]), ready(`${id}:${turns}`)));
    await Promise.all([cache.read("x"), cache.read("x", true)]);
    expect(asked).toEqual([["x", false], ["x", true]]);
    expect([cache.peek("x"), cache.peek("x", true)]).toEqual([ready("x:false"), ready("x:true")]);
  });

  it("keeps the last reading of at most 200 chats, dropping the least recent", async () => {
    const cache = createStatsCache(async (id) => ready(id));
    for (let index = 0; index < 201; index++) await cache.read(`a${index}`);
    expect(cache.peek("a0")).toBeUndefined();
    expect(cache.peek("a200")).toEqual(ready("a200"));
  });
});
