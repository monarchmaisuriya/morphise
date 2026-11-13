// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/server/logs.test.ts
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { test } from "vitest";
import { createLogStore, defaultLogRoot } from "./logs";

const DAY = 24 * 60 * 60 * 1000;
const root = () => mkdtempSync(join(tmpdir(), "morphise-run-logs-"));

test("a log is saved in its chat's folder under a name from its command, readable only by the user, and a resend replaces it", async () => {
  const store = createLogStore({ root: root() });
  const path = await store.save({ agentId: "agent-1", runId: "abc123", command: "npm test -- --watch\necho done", text: "one\n" });
  assert.match(path, /[\\/]agent-1[\\/]npm-test-watch-abc123\.log$/);
  // Windows has no Unix file permissions; a log there inherits the user's own folder's access.
  if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(await store.save({ agentId: "agent-1", runId: "abc123", command: "npm test -- --watch\necho done", text: "two\n" }), path);
  assert.equal(readFileSync(path, "utf8"), "two\n");
});

test("ids that aren't plain become hashes, so no id names a path outside the logs folder", async () => {
  const dir = root();
  const store = createLogStore({ root: dir });
  const path = await store.save({ agentId: "../../etc", runId: "../x", command: "!!!", text: "" });
  assert.ok(path.startsWith(dir + sep));
  assert.match(path, /[\\/][0-9a-f]{16}[\\/]output-[0-9a-f]{16}\.log$/);
});

test("prune drops logs older than a week, then the oldest past the size cap, never the newest, and empty chat folders", async () => {
  const dir = root();
  const now = Date.now();
  const store = createLogStore({ root: dir, now: () => now, limits: { maxAgeMs: 7 * DAY, maxBytes: 10 } });
  const save = async (agentId: string, runId: string, bytes: number, age: number) => {
    const path = await store.save({ agentId, runId, command: "ls", text: "x".repeat(bytes) });
    utimesSync(path, (now - age) / 1000, (now - age) / 1000);
    return path;
  };
  const stale = await save("old-chat", "r1", 1, 8 * DAY);
  const older = await save("a", "r2", 6, 3_000);
  const newer = await save("a", "r3", 6, 2_000);
  const newest = await save("b", "r4", 20, 1_000);
  await store.prune();
  assert.equal(existsSync(stale), false, "a week old");
  assert.equal(existsSync(newest), true, "the newest stays even though it alone is past the cap");
  assert.equal(existsSync(newer), false);
  assert.equal(existsSync(older), false);
  assert.deepEqual(readdirSync(dir), ["b"]);
});

test("forget deletes one chat's folder; prune and forget are fine when nothing was ever saved", async () => {
  const dir = root();
  const store = createLogStore({ root: dir });
  const mine = await store.save({ agentId: "a", runId: "r1", command: "ls", text: "x" });
  const theirs = await store.save({ agentId: "b", runId: "r2", command: "ls", text: "x" });
  await store.forget("a");
  assert.equal(existsSync(mine), false);
  assert.equal(existsSync(theirs), true);
  const empty = createLogStore({ root: join(dir, "never-made") });
  await empty.prune();
  await empty.forget("a");
});

test("logs live in Morphise's own state folder: ~/.local/state on macOS and Linux, %LOCALAPPDATA% on Windows", () => {
  assert.equal(defaultLogRoot("/home/m", {}, "linux"), join("/home/m", ".local", "state", "morphise", "runs"));
  assert.equal(defaultLogRoot("/Users/m", {}, "darwin"), join("/Users/m", ".local", "state", "morphise", "runs"));
  assert.equal(defaultLogRoot("C:\\Users\\m", { LOCALAPPDATA: "C:\\Users\\m\\AppData\\Local" }, "win32"), join("C:\\Users\\m\\AppData\\Local", "morphise", "runs"));
});
