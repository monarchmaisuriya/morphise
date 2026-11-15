import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readPageImage } from "../../shared/polish/image";
import { registerMedia } from "./media.register";
import type { ProfileReader } from "./profile-reader";

type PageImageHandler = (input: { path: string; agentId: string }, context: { paseo: unknown }) => Promise<{ dataUrl: string }>;

let temp: string;
let folder: string;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "morphise-media-register-"));
  folder = join(temp, "project");
  await mkdir(folder);
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } }).png().toBuffer();
  await writeFile(join(folder, "inside.png"), png);
  await writeFile(join(temp, "outside.png"), png);
});
afterAll(() => rm(temp, { recursive: true, force: true }));

// The handler registerMedia gives the page-image RPC, called with a daemon that knows one agent, working in `folder`.
const pageImage = (path: string, agentId: string) => {
  const handlers = new Map<string, PageImageHandler>();
  const server = { handle: (rpc: { name: string }, handler: PageImageHandler) => void handlers.set(rpc.name, handler) } as unknown as PluginServerContext;
  registerMedia(server, {} as ProfileReader);
  const paseo = { agents: { ref: (id: string) => ({ refresh: async () => (id === "agent-1" ? { agent: { cwd: folder } } : null) }) } };
  return handlers.get(readPageImage.name)!({ path, agentId }, { paseo });
};

describe("the page-image RPC", () => {
  it("reads a page's image only inside the working folder of the agent the request names", async () => {
    expect((await pageImage(join(folder, "inside.png"), "agent-1")).dataUrl).toMatch(/^data:image\/png;base64,/);
    const outside = join(temp, "outside.png");
    await expect(pageImage(outside, "agent-1")).rejects.toThrow(`Image could not be read inside your working folder: ${outside}`);
  });

  it("refuses an agent the daemon does not know", async () => {
    await expect(pageImage(join(folder, "inside.png"), "agent-2")).rejects.toThrow(/no folder/);
  });
});
