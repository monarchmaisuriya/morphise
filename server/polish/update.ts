// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): server/update.ts
import { spawn } from "node:child_process";
import type { UpdateStatus } from "../../shared/polish/update";

// Paseo hands plugin processes its CLI's path; a daemon started from the CLI has it on PATH.
const CLI = process.env.PASEO_CLI || "paseo";
const NAME = "Morphise";

type Revision = { kind: "git"; commit: string } | { kind: "npm"; version: string };
type Preview = {
  id: string;
  outcome: "update" | "current" | "installed-newer" | "local" | "error";
  current?: { identity?: { kind: string }; currentRevision?: string };
  target?: Revision;
  links?: string[];
  error?: string;
};

/**
 * Runs `paseo plugin <args> --json`. Detached, so an update survives the restart it triggers in this process
 * (Paseo stops the old plugin process while it installs the new one).
 */
// Under the 30 s every plugin RPC gets, so a slow check reports its own error instead of a timeout.
const CHECK_TIMEOUT_MS = 12_000;

function plugin(args: string[], timeoutMs = CHECK_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, ["plugin", ...args, "--json"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`paseo plugin ${args[0]} took longer than ${timeoutMs / 1000} s`));
    }, timeoutMs);
    child.on("close", () => clearTimeout(timer));
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `paseo exited with ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`Unexpected output from paseo: ${out.slice(0, 200)}`));
      }
    });
  });
}

/** The runtime id this copy runs under: the manifest id, unless it was installed with `--id`. A folder copy loses to an installed one. */
async function ownId() {
  const list = (await plugin(["ls"])) as Array<{ id: string; name?: string; installation?: { identity?: { kind: string } } }>;
  const mine = list.filter((p) => p.name === NAME);
  return (mine.find((p) => p.installation?.identity?.kind !== "directory") ?? mine[0])?.id ?? "morphise";
}

const short = (r: Revision | undefined) => (r?.kind === "git" ? r.commit.slice(0, 7) : r?.version);
const shortRevision = (rev: string | undefined) => (rev && /^[0-9a-f]{40}$/.test(rev) ? rev.slice(0, 7) : rev);

export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const [item] = (await plugin(["update", await ownId(), "--check"])) as Preview[];
    if (!item) return { state: "error", links: [], error: "Paseo returned no result for this plugin" };
    const state = item.outcome === "installed-newer" ? "current" : item.outcome;
    return { state, current: shortRevision(item.current?.currentRevision), target: short(item.target), links: item.links ?? [], error: item.error };
  } catch (error) {
    return { state: "error", links: [], error: error instanceof Error ? error.message : String(error) };
  }
}

// Starts the update and returns at once: installing runs the build step (npm ci) and then restarts
// this plugin process, which outlasts any RPC. The update runs detached, so it survives the restart;
// once it is done the new version's check reports it as current. One at a time.
let updating = false;
export async function installUpdate(): Promise<{ error?: string }> {
  if (updating) return {};
  try {
    const id = await ownId();
    const child = spawn(CLI, ["plugin", "update", id, "--yes", "--json"], { detached: true, stdio: "ignore" });
    updating = true;
    child.on("error", () => (updating = false));
    child.on("close", () => (updating = false));
    child.unref();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
