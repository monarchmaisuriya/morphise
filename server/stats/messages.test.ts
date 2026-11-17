import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { messageTexts, searchLog } from "./messages";

const FIXTURES = join(__dirname, "fixtures");
const CLAUDE_LOG = join(FIXTURES, "claude", "projects", "-repo-app", "claude-session-1.jsonl");
const CODEX_LOG = join(FIXTURES, "codex", "sessions", "2026", "11", "16", "rollout-2026-11-16T12-00-00-0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000.jsonl");
const LIMITS = { maxBytes: 8 * 1024 * 1024, maxMs: 2000 };

describe("conversation text from a Claude log", () => {
  it("finds user, reply and thinking text, across messages only one at a time", async () => {
    expect((await searchLog(CLAUDE_LOG, "claude", "login timeout", undefined, LIMITS)).match).toBe("Please fix the login timeout in auth");
    expect((await searchLog(CLAUDE_LOG, "claude", "widened", undefined, LIMITS)).match).toContain("session window widened");
    expect((await searchLog(CLAUDE_LOG, "claude", "timeout 30", undefined, LIMITS)).match).toBe("I raised the Timeout to 30 s in auth.ts.");
    expect((await searchLog(CLAUDE_LOG, "claude", "login widened", undefined, LIMITS)).match).toBeNull();
  });

  it("never matches tool calls, tool results, sub-agent rows or system-added rows", async () => {
    for (const word of ["toolinputword", "tooloutputword", "sidechainword", "metaword", "Bash"]) {
      expect(await searchLog(CLAUDE_LOG, "claude", word, undefined, LIMITS)).toEqual({ match: null, nextCursor: null });
    }
  });
});

describe("conversation text from a Codex log", () => {
  it("finds user and assistant messages and reasoning summaries", async () => {
    expect((await searchLog(CODEX_LOG, "codex", "parser bug", undefined, LIMITS)).match).toBe("Find the parser bug");
    expect((await searchLog(CODEX_LOG, "codex", "tokenizer", undefined, LIMITS)).match).toBe("Looking at the tokenizer escapes");
    expect((await searchLog(CODEX_LOG, "codex", "handles", undefined, LIMITS)).match).toBe("The parser now handles escapes.");
  });

  it("never matches tool calls, tool output, encrypted reasoning or developer instructions", async () => {
    for (const word of ["toolinputword", "tooloutputword", "opaqueword", "developerword", "shell"]) {
      expect((await searchLog(CODEX_LOG, "codex", word, undefined, LIMITS)).match).toBeNull();
    }
  });

  it("takes text only from message and reasoning rows", () => {
    expect(messageTexts("codex", { type: "event_msg", payload: { type: "agent_message", message: "x" } })).toEqual([]);
    expect(messageTexts("claude", { type: "summary", summary: "x" })).toEqual([]);
  });
});

describe("reading a log in windows", () => {
  let root: string;
  let path: string;
  const line = (text: string) => JSON.stringify({ type: "user", message: { content: text } }) + "\n";
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "morphise-search-"));
    path = join(root, "log.jsonl");
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("returns a cursor at the last whole line it read, and continues from it to a later match", async () => {
    const lines = [line("first message"), line("second message"), line("third has the target")];
    await writeFile(path, lines.join(""));
    const small = { maxBytes: Math.max(...lines.map((text) => text.length)) + 4, maxMs: 2000 };
    const inode = String((await stat(path, { bigint: true })).ino);
    const first = await searchLog(path, "claude", "target", undefined, small);
    expect(first).toEqual({ match: null, nextCursor: { offset: lines[0]!.length, inode } });
    const second = await searchLog(path, "claude", "target", first.nextCursor!, small);
    expect(second).toEqual({ match: null, nextCursor: { offset: lines[0]!.length + lines[1]!.length, inode } });
    expect((await searchLog(path, "claude", "target", second.nextCursor!, small)).match).toBe("third has the target");
  });

  it("restarts from the start for a cursor past the end or from a replaced file", async () => {
    await writeFile(path, line("the target is early") + line("later"));
    const inode = String((await stat(path, { bigint: true })).ino);
    expect((await searchLog(path, "claude", "target", { offset: 10_000, inode }, LIMITS)).match).toBe("the target is early");
    expect((await searchLog(path, "claude", "target", { offset: 5, inode: "999999999" }, LIMITS)).match).toBe("the target is early");
  });

  it("skips to the next whole line when a cursor lands inside one, and gets past a line longer than a window", async () => {
    const long = line("x".repeat(200) + " target in an oversized line");
    await writeFile(path, long + line("the target after it"));
    const inode = String((await stat(path, { bigint: true })).ino);
    const small = { maxBytes: 64, maxMs: 2000 };
    let cursor: { offset: number; inode: string } | undefined = { offset: 3, inode };
    let match: string | null = null;
    for (let call = 0; call < 20 && match === null && cursor; call++) {
      const page = await searchLog(path, "claude", "target", cursor, small);
      match = page.match;
      cursor = page.nextCursor ?? undefined;
    }
    expect(match).toBe("the target after it");
  });

  it("leaves an unfinished last line for a later search and ends without a cursor", async () => {
    await writeFile(path, line("done") + '{"type":"user","message":{"content":"target being writ');
    expect(await searchLog(path, "claude", "target", undefined, LIMITS)).toEqual({ match: null, nextCursor: null });
  });

  it("fails loudly on a complete line that is not JSON", async () => {
    await writeFile(path, line("fine") + "not json\n" + line("the target"));
    await expect(searchLog(path, "claude", "target", undefined, LIMITS)).rejects.toThrow("invalid JSON line");
  });
});
