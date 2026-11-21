import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { QUICK_CHAT_KEY } from "../../shared/quick-chat";
import { QuickChatService } from "./service";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "morphise-quick-chat-")); folders.push(root);
  const cwd = join(root, "workspaces", "owned"); await mkdir(cwd, { recursive: true }); await writeFile(join(cwd, "idea.txt"), "synthetic");
  let source = { id: "source", title: "An idea", cwd, workspaceId: "scratch", metadata: { [QUICK_CHAT_KEY]: true }, updatedAt: "2026-01-01", status: "idle", pendingPermissions: [], activeTurn: null, model: "test", provider: "fake", archivedAt: null };
  const agents = new Map<string, unknown>([[source.id, source]]);
  const creations: Record<string, unknown>[] = [];
  let uncertain = false;
  let onTargets = () => {};
  const target = { id: "project", title: "Test project", name: "project", projectDisplayName: "Test", workspaceDirectory: "/synthetic/project", projectRootPath: "/synthetic/project", background: false };
  const api = {
    agents: { ref: (id: string) => ({ refresh: async () => agents.has(id) ? { agent: agents.get(id) } : null, timeline: { refetch: async () => ({ staleCursor: false, gap: false, entries: [{ item: { type: "user_message", text: "capture an idea" } }], hasOlder: false }) } }), list: async () => ({ entries: [...agents.values()].map((agent) => ({ agent })), pageInfo: { hasMore: false } }) },
    workspaces: { list: async () => { onTargets(); return { entries: [target], pageInfo: { hasMore: false } }; }, ref: () => ({ agents: { create: async (input: Record<string, unknown>) => { creations.push(input); const agent = { id: input.agentId, workspaceId: "project", metadata: input.metadata }; agents.set(String(input.agentId), agent); if (uncertain) throw new Error("Synthetic response lost"); return agent; } } }) },
  } as unknown as PluginHandlerContext["paseo"];
  const update = () => { source = { ...source, updatedAt: "changed" }; agents.set(source.id, source); };
  return { root, cwd, api, creations, service: new QuickChatService(root), update, changeDuringTargets: () => { onTargets = update; }, loseResponse: () => { uncertain = true; } };
}

describe("independent Quick Chat handoff", () => {
  it("prepares without creating and creates context once while keeping original files", async () => {
    const f = await fixture();
    const preview = await f.service.prepare(f.api, "source", "project");
    expect(f.creations).toHaveLength(0);
    expect(preview.files).toEqual(["idea.txt"]);
    const destination = await f.service.continue(f.api, preview.previewId, preview.text);
    expect(destination.warning).toBeNull();
    expect(f.creations).toHaveLength(1);
    expect(f.creations[0].config).toEqual({ provider: "fake/test" });
    expect(await f.service.continue(f.api, preview.previewId, preview.text)).toEqual(destination);
    expect(f.creations).toHaveLength(1);
  });
  it("recovers a destination after restart without replaying uncertain creation", async () => {
    const f = await fixture(); const preview = await f.service.prepare(f.api, "source", "project"); f.loseResponse();
    await expect(f.service.continue(f.api, preview.previewId, preview.text)).rejects.toThrow("Synthetic response lost");
    const result = await new QuickChatService(f.root).recover(f.api, preview.previewId);
    expect(result.workspaceId).toBe("project");
    expect(result.warning).toContain("response was not confirmed");
    expect(f.creations).toHaveLength(1);
  });
  it("rejects a stale preview before creating a project agent", async () => {
    const f = await fixture(); const preview = await f.service.prepare(f.api, "source", "project"); f.update();
    await expect(f.service.continue(f.api, preview.previewId, preview.text)).rejects.toThrow("source changed");
    expect(f.creations).toHaveLength(0);
  });
  it("rechecks source activity after awaited target discovery and journal writing", async () => {
    const f = await fixture(); const preview = await f.service.prepare(f.api, "source", "project"); f.changeDuringTargets();
    await expect(f.service.continue(f.api, preview.previewId, preview.text)).rejects.toThrow("source changed before creation");
    expect(f.creations).toHaveLength(0);
  });
  it("fails closed on a corrupt recovery record without replaying", async () => {
    const f = await fixture(); await mkdir(join(f.root, "operations"));
    await writeFile(join(f.root, "operations", "12345678-1234-4234-8234-123456789abc.json"), '{"stage":"complete"}');
    await expect(f.service.recover(f.api, "12345678-1234-4234-8234-123456789abc")).rejects.toThrow("saved handoff record is invalid");
    expect(f.creations).toHaveLength(0);
  });
  it("rejects chats outside the owned scratch boundary", async () => {
    const f = await fixture();
    await expect(f.service.source(f.api, "not-owned")).rejects.toThrow("Morphise Quick Chat");
    expect(await f.service.decorate("/synthetic/missing")).toBeNull();
  });
});
