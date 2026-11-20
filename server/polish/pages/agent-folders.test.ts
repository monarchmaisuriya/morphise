import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test gets its own Paseo home and a fresh copy of the module, which loads the store from disk as a plugin start does.
const home = process.env.PASEO_HOME;
let cache = "";
let logged: string[] = [];
const fresh = async () => {
  vi.resetModules();
  return import("./agent-folders");
};
const storeFile = () => join(cache, "agent-folders.json");
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

beforeEach(async () => {
  process.env.PASEO_HOME = await mkdtemp(join(tmpdir(), "morphise-agent-folders-"));
  cache = join(process.env.PASEO_HOME, "plugin-cache", "morphise", "pages");
  logged = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(" ")));
  }
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  if (home === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = home;
});

describe("per-agent tokens for the html tools", () => {
  it("keeps launch tokens in memory, preserves legacy disk bytes and revokes only their own lifetime", async () => {
    const { issueAgentToken, issueLaunchToken, folderOfToken } = await fresh();
    const legacy = await issueAgentToken("/work/legacy");
    const before = await readFile(storeFile(), "utf8");
    const cleanupA: Array<() => void> = [];
    const cleanupB: Array<() => void> = [];
    const a = issueLaunchToken("/work/a/..", { signal: new AbortController().signal, onDispose: (cleanup) => void cleanupA.push(cleanup) });
    const b = issueLaunchToken("/work/b", { signal: new AbortController().signal, onDispose: (cleanup) => void cleanupB.push(cleanup) });
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
    expect(await folderOfToken(a)).toBe(resolve("/work"));
    expect(await folderOfToken(b)).toBe(resolve("/work/b"));
    cleanupA[0]!();
    cleanupA[0]!();
    expect(await folderOfToken(a)).toBeUndefined();
    expect(await folderOfToken(b)).toBe(resolve("/work/b"));
    expect(await folderOfToken(legacy)).toBe(resolve("/work/legacy"));
    expect(await readFile(storeFile(), "utf8")).toBe(before);
    cleanupB[0]!();
    const restarted = await fresh();
    expect(await restarted.folderOfToken(b)).toBeUndefined();
    expect(await restarted.folderOfToken(legacy)).toBe(resolve("/work/legacy"));
  });

  it("does not grow the legacy map across 100 disposed launch attempts", async () => {
    const { issueAgentToken, issueLaunchToken, folderOfToken } = await fresh();
    await issueAgentToken("/work/legacy");
    const before = await readFile(storeFile(), "utf8");
    const tokens: string[] = [];
    // Repetition checks the invariant for every launch, not runner retries.
    for (let attempt = 0; attempt < 100; attempt++) {
      const cleanups: Array<() => void> = [];
      tokens.push(issueLaunchToken("/work/new", { signal: new AbortController().signal, onDispose: (cleanup) => void cleanups.push(cleanup) }));
      cleanups[0]!();
    }
    expect(await readFile(storeFile(), "utf8")).toBe(before);
    expect(await Promise.all(tokens.map(folderOfToken))).toEqual(Array(100).fill(undefined));
  });

  it("does not issue a token for an already cancelled attempt", async () => {
    const { issueLaunchToken } = await fresh();
    const controller = new AbortController();
    controller.abort(new Error("open cancelled"));
    const onDispose = vi.fn();
    expect(() => issueLaunchToken("/work/a", { signal: controller.signal, onDispose })).toThrow("open cancelled");
    expect(onDispose).not.toHaveBeenCalled();
  });

  it("does not create an unowned token when lifetime cleanup registration rejects", async () => {
    const { issueLaunchToken } = await fresh();
    expect(() => issueLaunchToken("/work/a", { signal: new AbortController().signal, onDispose: () => { throw new Error("disposed lifetime"); } })).toThrow("disposed lifetime");
  });

  it("maps an issued token to the agent's resolved folder, and nothing else to any folder", async () => {
    const { issueAgentToken, folderOfToken } = await fresh();
    const token = await issueAgentToken("/work/project/../project");
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(await folderOfToken(token)).toBe(resolve("/work/project"));
    expect(await folderOfToken("0".repeat(48))).toBeUndefined();
    expect(await folderOfToken("")).toBeUndefined();
    // The same folder from a fresh load of the file.
    expect(await (await fresh()).folderOfToken(token)).toBe(resolve("/work/project"));
    expect(logged.some((line) => line.includes(`token issued for ${resolve("/work/project")}`))).toBe(true);
    expect(logged.join("\n")).not.toContain(token);
  });

  it("saves only token hashes, in a file only its owner can read, leaving no temporary file", async () => {
    const { issueAgentToken } = await fresh();
    const token = await issueAgentToken("/work/a");
    const saved = await readFile(storeFile(), "utf8");
    expect(saved).not.toContain(token);
    expect(JSON.parse(saved)).toEqual({ [hashOf(token)]: resolve("/work/a") });
    // The file is the renamed temporary file, so this is the mode it was created with.
    expect((await stat(storeFile())).mode & 0o777).toBe(0o600);
    expect(await readdir(cache)).toEqual(["agent-folders.json"]);
  });

  it("keeps both of two tokens issued at the same moment", async () => {
    const { issueAgentToken } = await fresh();
    const [a, b] = await Promise.all([issueAgentToken("/work/a"), issueAgentToken("/work/b")]);
    const { folderOfToken } = await fresh();
    expect([await folderOfToken(a), await folderOfToken(b)]).toEqual([resolve("/work/a"), resolve("/work/b")]);
  });

  it("keeps saved mappings when a token is issued or looked up while the store is still loading", async () => {
    await mkdir(cache, { recursive: true });
    const old = "1".repeat(48);
    await writeFile(storeFile(), JSON.stringify({ [hashOf(old)]: "/work/old" }), { mode: 0o600 });
    const { issueAgentToken, folderOfToken } = await fresh();
    // Both start before the load has read the file.
    const [issued, found] = await Promise.all([issueAgentToken("/work/new"), folderOfToken(old)]);
    expect(found).toBe("/work/old");
    const reloaded = await fresh();
    expect([await reloaded.folderOfToken(old), await reloaded.folderOfToken(issued)]).toEqual(["/work/old", resolve("/work/new")]);
  });

  it("sets aside a store it cannot parse, says so, and starts a new one", async () => {
    await mkdir(cache, { recursive: true });
    await writeFile(storeFile(), "{not json", { mode: 0o600 });
    const { issueAgentToken, folderOfToken } = await fresh();
    expect(await folderOfToken("1".repeat(48))).toBeUndefined();
    const aside = (await readdir(cache)).filter((name) => /^agent-folders\.json\.corrupt-\d+$/.test(name));
    expect(aside).toHaveLength(1);
    expect(await readFile(join(cache, aside[0]!), "utf8")).toBe("{not json");
    expect(logged.some((line) => line.includes(aside[0]!))).toBe(true);
    const token = await issueAgentToken("/work/a");
    expect(await (await fresh()).folderOfToken(token)).toBe(resolve("/work/a"));
  });

  it("sets aside a store that is not a map of token hashes to folders, or that cannot be read", async () => {
    await mkdir(cache, { recursive: true });
    await writeFile(storeFile(), JSON.stringify({ [hashOf("x")]: 7 }), { mode: 0o600 });
    expect(await (await fresh()).folderOfToken("x")).toBeUndefined();
    // A folder where the file should be: a read error other than "missing".
    await mkdir(storeFile());
    await (await fresh()).loadAgentFolders();
    expect((await readdir(cache)).filter((name) => name.startsWith("agent-folders.json.corrupt-"))).toHaveLength(2);
  });
});
