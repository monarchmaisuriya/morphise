import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// `paseo plugin ls` answers after a tick, as the CLI does; `paseo plugin update` only starts.
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
    return child;
  },
}));

afterEach(() => {
  spawned.length = 0;
  lsFails = false;
  vi.resetModules();
});

describe("installing an update", () => {
  it("starts one update for two clicks made while it is still finding its id", async () => {
    const { installUpdate } = await import("./update");
    expect(await Promise.all([installUpdate(), installUpdate()])).toEqual([{}, {}]);
    expect(spawned.filter((args) => args[1] === "update")).toEqual([["plugin", "update", "morphise", "--yes", "--json"]]);
  });

  it("lets the next click try again when the first could not start", async () => {
    const { installUpdate } = await import("./update");
    lsFails = true;
    expect(await installUpdate()).toEqual({ error: "daemon not running" });
    lsFails = false;
    expect(await installUpdate()).toEqual({});
    expect(spawned.filter((args) => args[1] === "update")).toHaveLength(1);
  });
});
