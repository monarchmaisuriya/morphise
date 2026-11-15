import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pagesCacheDir } from "./cache";

// Which agent's working folder each per-agent token of the html tools belongs to: the tool server opens a page's local images only inside the
// folder of the agent that calls it. The file holds token hashes only, so reading it gives no usable token.
const storeFile = () => join(pagesCacheDir(), "agent-folders.json");
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const HASH = /^[0-9a-f]{64}$/;

let folders: Promise<Map<string, string>> | undefined;
// Writes one at a time, each after the load, so none replaces another's mapping or the saved ones.
let writing: Promise<void> = Promise.resolve();

/** Loads the store into memory once (at plugin start); every issue and lookup waits for it. */
export const loadAgentFolders = () => (folders ??= load());

async function load() {
  const file = storeFile();
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? "{}" : error));
  const saved = typeof text === "string" ? parse(text) : undefined;
  if (saved) return saved;
  // Kept for a person to look at rather than overwritten by the next write; chats whose tokens it held need a new chat.
  const aside = `${file}.corrupt-${Date.now()}`;
  await rename(file, aside);
  console.warn(`[morphise] html tools: the agent folder store could not be read, set aside as ${aside}:`, typeof text === "string" ? "not a map of token hashes to folders" : text);
  return new Map<string, string>();
}

function parse(text: string) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  return entries.every(([hash, folder]) => HASH.test(hash) && typeof folder === "string") ? new Map(entries as Array<[string, string]>) : undefined;
}

async function save(map: ReadonlyMap<string, string>) {
  const file = storeFile();
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(Object.fromEntries(map)));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** A new token for an agent working in `cwd`, returned once its mapping to the resolved folder is saved. */
export async function issueAgentToken(cwd: string) {
  const token = randomBytes(24).toString("hex");
  const folder = resolve(cwd);
  const map = await loadAgentFolders();
  const written = writing.then(async () => {
    await save(new Map(map).set(hashOf(token), folder));
    map.set(hashOf(token), folder);
  });
  // The next write runs after this one whether or not it failed; the failure reaches the caller below.
  writing = written.catch(() => undefined);
  await written;
  console.info(`[morphise] html tools: token issued for ${folder}`);
  return token;
}

/** The folder of the agent a token was issued to, or undefined for any other token. Looked up by hash, so the token is never compared character by character. */
export async function folderOfToken(token: string) {
  return (await loadAgentFolders()).get(hashOf(token));
}
