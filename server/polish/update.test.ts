import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// `paseo plugin ls` and `paseo plugin update --check` answer after a tick, as the CLI does; `paseo plugin update` only starts.
const spawned: string[][] = [];
let lsFails = false;
vi.mock("node:child_process", () => ({
  spawn: (_cli: string, args: string[]) => {
    spawned.push(args);
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => undefined, unref: () => undefined });
    if (args[1] === "ls") {
      setTimeout(() => {
        if (lsFails) child.stderr.emit("data", "daemon not running");
        else child.stdout.emit("data", JSON.stringify([{ id: "morphise", name: "Morphise" }]));
        child.emit("close", lsFails ? 1 : 0);
      });
    }
    if (args.includes("--check")) {
      setTimeout(() => {
        child.stdout.emit("data", JSON.stringify([{ id: "morphise", outcome: "update", current: { currentRevision: "1".repeat(40) }, target: { kind: "git", commit: COMMIT }, links: [] }]));
        child.emit("close", 0);
      });
    }
    return child;
  },
}));

const COMMIT = "abcdef0".repeat(5) + "12345";

afterEach(() => {
  spawned.length = 0;
  lsFails = false;
  vi.resetModules();
});

describe("installing an update", () => {
  it("starts one update for two clicks made while it is still finding its id", async () => {
    const { installUpdate } = await import("./update");
    const target = { kind: "git" as const, commit: COMMIT };
    expect(await Promise.all([installUpdate(target), installUpdate(target)])).toEqual([{}, {}]);
    expect(spawned.filter((args) => args[1] === "update")).toHaveLength(1);
  });

  it("lets the next click try again when the first could not start", async () => {
    const { installUpdate } = await import("./update");
    lsFails = true;
    expect(await installUpdate({ kind: "npm", version: "1.2.3" })).toEqual({ error: "daemon not running" });
    lsFails = false;
    expect(await installUpdate({ kind: "npm", version: "1.2.3" })).toEqual({});
    expect(spawned.filter((args) => args[1] === "update")).toHaveLength(1);
  });

  it("installs exactly the revision the check offered, not whatever is newest by then", async () => {
    const { checkForUpdate, installUpdate } = await import("./update");
    const status = await checkForUpdate();
    expect(status.revision).toEqual({ kind: "git", commit: COMMIT });
    await installUpdate(status.revision!);
    await installUpdate({ kind: "npm", version: "2.0.0" });
    expect(spawned.filter((args) => args[1] === "update" && !args.includes("--check"))).toEqual([["plugin", "update", "morphise", "--ref", COMMIT, "--json"]]);
  });

  it("installs the npm version the check offered", async () => {
    const { installUpdate } = await import("./update");
    await installUpdate({ kind: "npm", version: "2.0.0" });
    expect(spawned.filter((args) => args[1] === "update")).toEqual([["plugin", "update", "morphise", "--version", "2.0.0", "--json"]]);
  });
});
