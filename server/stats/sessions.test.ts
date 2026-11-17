// The first test is ported from Harness Stats (kogekiplay/paseo-harness-stats, MIT, see NOTICE.md): tests/sessions.test.ts at 4e8fae9
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionReader } from "./sessions";

const ID = "11111111-2222-3333-4444-555555555555";
const row = (response: string) => JSON.stringify({ type: "token_usage_record", payload: { response_id: response, turn_id: "t", usage: { input_tokens: 100, output_tokens: 10 } } });
const steps = (read: Awaited<ReturnType<SessionReader["read"]>>) => (read.kind === "ready" ? read.stats.steps : -1);

let root: string;
let path: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morphise-stats-"));
  const dir = join(root, "sessions", "2026", "11", "16");
  await mkdir(dir, { recursive: true });
  path = join(dir, `rollout-2026-11-16T12-00-00-${ID}.jsonl`);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("session reader", () => {
  it("Incremental reads wait for complete lines, share concurrent reads, and handle truncation", async () => {
    const first = row("r1");
    await writeFile(path, first.slice(0, 40));
    const reader = new SessionReader({ codex: root, claude: root });
    expect(steps(await reader.read("codex", ID, "/x"))).toBe(0);
    await appendFile(path, first.slice(40) + "\n");
    const results = await Promise.all([reader.read("codex", ID, "/x"), reader.read("codex", ID, "/x")]);
    expect(results.map(steps)).toEqual([1, 1]);
    await appendFile(path, row("r2") + "\n");
    expect(steps(await reader.read("codex", ID, "/x"))).toBe(2);
    await writeFile(path, row("r3") + "\n");
    expect(steps(await reader.read("codex", ID, "/x"))).toBe(1);
    expect((await reader.read("other", ID, "/x")).kind).toBe("unavailable");
  });

  it("refuses a session id that could name another file, without reading", async () => {
    const reader = new SessionReader({ codex: root, claude: root });
    await expect(reader.read("codex", "../../outside", "/x")).rejects.toThrow("Not a session id");
    await expect(reader.read("claude", "../sessions/x", "/x")).rejects.toThrow("Not a session id");
  });

  it("fails loudly on a complete line that is not JSON, and still waits on an unfinished one", async () => {
    await writeFile(path, row("r1") + "\n" + '{"type":"token_usage_rec');
    const reader = new SessionReader({ codex: root, claude: root });
    expect(steps(await reader.read("codex", ID, "/x"))).toBe(1);
    await appendFile(path, "\nnot json\n");
    await expect(reader.read("codex", ID, "/x")).rejects.toThrow("invalid JSON line");
  });

  it("stops a read at the byte cap with partial set, and continues from there on the next call", async () => {
    const lines = [row("r1"), row("r2"), row("r3")];
    await writeFile(path, lines.join("\n") + "\n");
    const reader = new SessionReader({ codex: root, claude: root }, { maxBytes: lines[0]!.length + 5, maxMs: 15_000 });
    const firstRead = await reader.read("codex", ID, "/x");
    expect(firstRead).toMatchObject({ kind: "ready", partial: true });
    expect(steps(firstRead)).toBe(1);
    const secondRead = await reader.read("codex", ID, "/x");
    expect(steps(secondRead)).toBe(2);
    const thirdRead = await reader.read("codex", ID, "/x");
    expect(thirdRead).toMatchObject({ kind: "ready", partial: false });
    expect(steps(thirdRead)).toBe(3);
  });

  it("finds a Claude log by the chat's folder, else by searching every project", async () => {
    const sid = "abc_DEF-123";
    await mkdir(join(root, "projects", "-repo-app"), { recursive: true });
    await writeFile(join(root, "projects", "-repo-app", `${sid}.jsonl`), "");
    const reader = new SessionReader({ codex: root, claude: root });
    expect(await reader.locate("claude", sid, "/repo/app")).toBe(join(root, "projects", "-repo-app", `${sid}.jsonl`));
    expect(await reader.locate("claude", sid, "/elsewhere")).toBe(join(root, "projects", "-repo-app", `${sid}.jsonl`));
    expect(await reader.locate("claude", "missing", "/repo/app")).toBeNull();
  });
});
