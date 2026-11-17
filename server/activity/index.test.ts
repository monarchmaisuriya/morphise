import { appendFile, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chatTools } from "../../shared/activity";
import { type ActivityPaseo, ActivityIndex, type ListedAgent } from "./index";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "activity-index-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 17, 10, minutes)).toISOString();
const prompt = (minutes: number, text = "go") => JSON.stringify({ type: "user", timestamp: at(minutes), message: { role: "user", content: text } });
const bash = (minutes: number, id: string) => JSON.stringify({ type: "assistant", timestamp: at(minutes), message: { id: `m${id}`, model: "claude-opus-5-5", content: [{ type: "tool_use", id, name: "Bash", input: { command: "ls" } }] } });

function setup(agents: ListedAgent[], limits = { maxBytes: 1 << 20, maxMs: 10_000 }) {
  const calls = { list: 0 };
  let now = Date.UTC(2026, 10, 17, 12);
  const paseo: ActivityPaseo = {
    agents: {
      list: async () => {
        calls.list++;
        return { entries: agents.map((agent) => ({ agent })), pageInfo: { hasMore: false } };
      },
    },
    workspaces: { list: async () => ({ entries: [{ id: "w1", projectDisplayName: "api" }], pageInfo: { hasMore: false } }) },
  };
  const reader = { findLog: async (provider: string, sessionId: string | null) => ({ kind: "found" as const, provider: provider as "claude", path: join(dir, `${sessionId}.jsonl`) }) };
  const file = join(dir, "index.json");
  const make = () => new ActivityIndex(file, reader, limits, () => now);
  return { paseo, make, file, calls, tick: (ms: number) => (now += ms) };
}

const agent = (id: string, sessionId = id): ListedAgent => ({ id, provider: "claude", cwd: "/x", workspaceId: "w1", createdAt: at(0), persistence: { sessionId } });
const promptsOf = (state: Awaited<ReturnType<ActivityIndex["run"]>>, id: string) => {
  const found = state.agents.find((entry) => entry.id === id);
  return found?.activity ? chatTools(found.activity) : null;
};

describe("ActivityIndex", () => {
  it("never counts half a line, and carries on after a restart without an invalid-line error", async () => {
    const { paseo, make, tick } = setup([agent("a")]);
    const path = join(dir, "a.jsonl");
    const half = prompt(2, "second");
    await writeFile(path, `${prompt(1)}\n${bash(1, "t1")}\n${half.slice(0, 20)}`);
    const first = await make().run(paseo);
    expect(promptsOf(first, "a")).toMatchObject({ prompts: 1, shellCalls: 1 });
    await appendFile(path, `${half.slice(20)}\n`);
    tick(60_000);
    const second = await make().run(paseo);
    expect(second.indexing).toEqual({ done: 1, total: 1, errors: 0 });
    expect(promptsOf(second, "a")).toMatchObject({ prompts: 2, shellCalls: 1 });
  });

  it("folds each log once when two calls run at the same time", async () => {
    const { paseo, make, calls } = setup([agent("a")]);
    await writeFile(join(dir, "a.jsonl"), `${prompt(1)}\n${prompt(2)}\n`);
    const index = make();
    const [one, two] = await Promise.all([index.run(paseo), index.run(paseo)]);
    expect(one).toBe(two);
    expect(promptsOf(one, "a")?.prompts).toBe(2);
    expect(calls.list).toBe(1);
  });

  it("spreads a large history over several calls and reports progress", async () => {
    const lines = Array.from({ length: 40 }, (_, index) => prompt(index % 60)).join("\n") + "\n";
    const { paseo, make, tick } = setup([agent("a"), agent("b")], { maxBytes: Math.ceil(lines.length / 3), maxMs: 10_000 });
    await writeFile(join(dir, "a.jsonl"), lines);
    await writeFile(join(dir, "b.jsonl"), lines);
    const index = make();
    let state = await index.run(paseo);
    expect(state.indexing.done).toBeLessThan(2);
    for (let call = 0; call < 10 && state.indexing.done < 2; call++) {
      tick(1000);
      state = await index.run(paseo);
    }
    expect(state.indexing).toEqual({ done: 2, total: 2, errors: 0 });
    expect(promptsOf(state, "a")?.prompts).toBe(40);
    expect(promptsOf(state, "b")?.prompts).toBe(40);
  });

  it("marks only the agent with a broken log; a shorter file keeps what was counted and adds only newer lines", async () => {
    const { paseo, make, tick } = setup([agent("a"), agent("b")]);
    await writeFile(join(dir, "a.jsonl"), `${prompt(1)}\nnot json\n`);
    await writeFile(join(dir, "b.jsonl"), `${prompt(1)}\n${prompt(2)}\n`);
    const index = make();
    const state = await index.run(paseo);
    expect(state.indexing).toEqual({ done: 1, total: 2, errors: 1 });
    expect(promptsOf(state, "b")?.prompts).toBe(2);
    await truncate(join(dir, "b.jsonl"), prompt(1).length + 1);
    tick(60_000);
    expect(promptsOf(await index.run(paseo), "b")?.prompts).toBe(2);
    await appendFile(join(dir, "b.jsonl"), `${prompt(1)}\n${prompt(30)}\n`);
    tick(60_000);
    expect(promptsOf(await index.run(paseo), "b")?.prompts).toBe(3);
  });

  it("keeps an agent Paseo no longer lists as history", async () => {
    const agents = [agent("a")];
    const { paseo, make, tick } = setup(agents);
    await writeFile(join(dir, "a.jsonl"), `${prompt(1)}\n`);
    const index = make();
    await index.run(paseo);
    agents.length = 0;
    tick(60_000);
    const state = await index.run(paseo);
    expect(promptsOf(state, "a")?.prompts).toBe(1);
    expect(state.indexing.total).toBe(0);
  });

  it("counts history a forked chat's log copied from before the agent existed only once", async () => {
    const { paseo, make } = setup([{ ...agent("a"), createdAt: at(0) }, { ...agent("b"), createdAt: at(10) }]);
    const shared = `${prompt(1)}\n${prompt(2)}\n`;
    await writeFile(join(dir, "a.jsonl"), shared);
    await writeFile(join(dir, "b.jsonl"), `${shared}${prompt(11)}\n`);
    const state = await make().run(paseo);
    expect(promptsOf(state, "a")?.prompts).toBe(2);
    expect(promptsOf(state, "b")?.prompts).toBe(1);
  });

  it("after the session moves to a new file, counts only lines newer than those already counted", async () => {
    const agents = [agent("a", "s1")];
    const { paseo, make, tick } = setup(agents);
    await writeFile(join(dir, "s1.jsonl"), `${prompt(1)}\n${prompt(2)}\n`);
    const index = make();
    await index.run(paseo);
    agents[0] = agent("a", "s2");
    await writeFile(join(dir, "s2.jsonl"), `${prompt(1)}\n${prompt(2)}\n${prompt(5)}\n`);
    tick(60_000);
    expect(promptsOf(await index.run(paseo), "a")?.prompts).toBe(3);
  });

  it("is done with a log whose last line is unfinished, and counts it once it ends", async () => {
    const { paseo, make, tick } = setup([agent("a")]);
    const path = join(dir, "a.jsonl");
    await writeFile(path, `${prompt(1)}\n${prompt(2).slice(0, 10)}`);
    const index = make();
    expect((await index.run(paseo)).indexing).toEqual({ done: 1, total: 1, errors: 0 });
    await appendFile(path, `${prompt(2).slice(10)}\n`);
    tick(60_000);
    expect(promptsOf(await index.run(paseo), "a")?.prompts).toBe(2);
  });

  it("keeps line starts exact when a line has bytes that are not valid UTF-8", async () => {
    const { paseo, make, tick } = setup([agent("a")]);
    const path = join(dir, "a.jsonl");
    const bad = Buffer.concat([Buffer.from('{"type":"x","timestamp":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}\n')]);
    await writeFile(path, Buffer.concat([bad, Buffer.from(`${prompt(1)}\n`)]));
    const index = make();
    await index.run(paseo);
    await appendFile(path, `${prompt(2)}\n`);
    tick(60_000);
    const state = await index.run(paseo);
    expect(state.indexing.errors).toBe(0);
    expect(promptsOf(state, "a")?.prompts).toBe(2);
  });

  it("starts over from an unreadable index file", async () => {
    const { paseo, make, file } = setup([agent("a")]);
    await writeFile(file, "{ broken");
    await writeFile(join(dir, "a.jsonl"), `${prompt(1)}\n`);
    expect(promptsOf(await make().run(paseo), "a")?.prompts).toBe(1);
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(2);
  });

  it("does not read providers without a log reader, and names projects from workspaces", async () => {
    const { paseo, make } = setup([{ ...agent("o"), provider: "opencode" }, agent("a")]);
    await writeFile(join(dir, "a.jsonl"), `${prompt(1)}\n`);
    const state = await make().run(paseo);
    expect(state.indexing.total).toBe(1);
    expect(state.agents.find((entry) => entry.id === "a")?.project).toBe("api");
    expect(state.providers).toEqual(["claude", "opencode"]);
  });
});
