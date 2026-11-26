import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
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
  it("retains project identity across destination pages and excludes unavailable workspaces", async () => {
    const f = await fixture();
    const base = { title: "Unrelated task", name: "task", projectDisplayName: "pushowl-support-agent", workspaceDirectory: "/synthetic/worktrees/fox", projectRootPath: "/synthetic/pushowl-support-agent", background: false, internal: false, archivingAt: null };
    const api = { workspaces: { list: async (input: { page: { cursor?: string } }) => input.page.cursor ? { entries: [{ ...base, id: "second" }, { ...base, id: "hidden", internal: true }], pageInfo: { hasMore: false } } : { entries: [{ ...base, id: "first" }], pageInfo: { hasMore: true, nextCursor: "next" } } } } as unknown as PluginHandlerContext["paseo"];
    expect(await f.service.targets(api)).toEqual([{ id: "first", title: "Unrelated task", directory: base.workspaceDirectory, projectName: base.projectDisplayName, projectRoot: base.projectRootPath }, { id: "second", title: "Unrelated task", directory: base.workspaceDirectory, projectName: base.projectDisplayName, projectRoot: base.projectRootPath }]);
    expect(await f.service.readiness(f.api, "source")).toBeNull();
  });
  it("leaves new agent titles to Paseo and names exact save locations", async () => {
    const f = await fixture();
    let input: Record<string, unknown> = {};
    const api = { workspaces: { create: async (value: Record<string, unknown>) => { input = value; return { id: "scratch", setMetadata: async () => {} }; } } } as unknown as PluginHandlerContext["paseo"];
    const created = await f.service.start(api, "t-title-synthetic", "fake/test");
    const agent = input.agent as { title?: string; config: { systemPrompt: string } };
    expect(agent.title).toBeUndefined();
    expect(agent.config.systemPrompt).toContain(JSON.stringify(created.directory));
    expect(agent.config.systemPrompt).toContain(JSON.stringify(join(created.directory, "docs")));
    expect(agent.config.systemPrompt).toContain("absolute path");
    expect(agent.config.systemPrompt).toContain("Do not claim");
  });
  it("returns the actual chat title and both absolute storage paths", async () => {
    const f = await fixture();
    expect(await f.service.list(f.api)).toEqual([{ id: "source", title: "An idea", workspaceId: "scratch", directory: f.cwd, docsDirectory: join(f.cwd, "docs"), provider: "fake", archivedAt: null, createdAt: "", updatedAt: "2026-01-01" }]);
  });
  it("does not disclose paths for marked but unowned, missing or escaped folders", async () => {
    const f = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "morphise-outside-")); folders.push(outside);
    const escaped = join(f.root, "workspaces", "escaped"); await symlink(outside, escaped);
    const api = { agents: { list: async () => ({ entries: [outside, join(f.root, "missing"), escaped].map((cwd, i) => ({ agent: { id: String(i), title: "Keep title", workspaceId: "scratch", cwd, metadata: { [QUICK_CHAT_KEY]: true } } })), pageInfo: { hasMore: false } }) } } as unknown as PluginHandlerContext["paseo"];
    expect((await f.service.list(api)).map(({ id, directory, docsDirectory }) => ({ id, directory, docsDirectory }))).toEqual([{ id: "0", directory: undefined, docsDirectory: undefined }, { id: "1", directory: undefined, docsDirectory: undefined }, { id: "2", directory: undefined, docsDirectory: undefined }]);
  });
  it("archives and restores the same owned agent and does not repeat an already applied action", async () => {
    const f = await fixture();
    let archivedAt: string | null = null;
    let archives = 0, restores = 0;
    const record = { id: "owned", cwd: f.cwd, metadata: { [QUICK_CHAT_KEY]: true }, workspaceId: "scratch" };
    const api = { agents: { ref: () => ({ refresh: async () => ({ agent: { ...record, archivedAt } }), archive: async () => { archives++; archivedAt = "2026-01-01"; }, reload: async () => { restores++; archivedAt = null; } }) } } as unknown as PluginHandlerContext["paseo"];
    expect(await f.service.setArchived(api, "owned", true)).toEqual({ ok: true });
    expect(await f.service.setArchived(api, "owned", true)).toEqual({ ok: true });
    expect(archives).toBe(1);
    expect(await f.service.setArchived(api, "owned", false)).toEqual({ ok: true });
    expect(await f.service.setArchived(api, "owned", false)).toEqual({ ok: true });
    expect(restores).toBe(1);
  });
  it("rejects lifecycle writes outside the scratch ownership boundary", async () => {
    const f = await fixture(); let writes = 0;
    const api = { agents: { ref: () => ({ refresh: async () => ({ agent: { id: "outsider", cwd: f.root, metadata: { [QUICK_CHAT_KEY]: true } } }), archive: async () => { writes++; }, reload: async () => { writes++; } }) } } as unknown as PluginHandlerContext["paseo"];
    await expect(f.service.setArchived(api, "outsider", true)).rejects.toThrow("Only an owned");
    await expect(f.service.setArchived(api, "outsider", false)).rejects.toThrow("Only an owned");
    expect(writes).toBe(0);
  });
  it("excludes archives by default and requests them only for the inclusive list", async () => {
    const f = await fixture(); const filters: unknown[] = [];
    const api = { agents: { list: async (input: { filter: unknown }) => { filters.push(input.filter); return { entries: [{ agent: { id: "archived", title: "Older idea", workspaceId: "scratch", cwd: f.cwd, metadata: { [QUICK_CHAT_KEY]: true }, archivedAt: "2026-01-01", provider: "fake" } }], pageInfo: { hasMore: false } }; } } } as unknown as PluginHandlerContext["paseo"];
    expect(await f.service.list(api)).toEqual([]);
    expect((await f.service.list(api, true)).map((chat) => chat.id)).toEqual(["archived"]);
    expect(filters).toEqual([{ includeBackground: true, includeArchived: false }, { includeBackground: true, includeArchived: true }]);
  });
  it("rejects missing ownership, helpers, missing folders and symlink escapes without native writes", async () => {
    const f = await fixture(); const outside = await mkdtemp(join(tmpdir(), "morphise-archive-outside-")); folders.push(outside);
    const escaped = join(f.root, "workspaces", "escape"); await symlink(outside, escaped);
    let writes = 0;
    const records: Record<string, unknown> = { unmarked: { cwd: f.cwd }, helper: { cwd: f.cwd, background: true, labels: { "paseo.parent-agent-id": "parent" }, metadata: { [QUICK_CHAT_KEY]: true } }, missing: { cwd: join(f.root, "gone"), metadata: { [QUICK_CHAT_KEY]: true } }, escape: { cwd: escaped, metadata: { [QUICK_CHAT_KEY]: true } } };
    const api = { agents: { ref: (id: string) => ({ refresh: async () => ({ agent: { id, ...records[id] as object } }), archive: async () => { writes++; }, reload: async () => { writes++; } }) } } as unknown as PluginHandlerContext["paseo"];
    await expect(f.service.setArchived(api, "unmarked", true)).rejects.toThrow("Only an owned");
    await expect(f.service.setArchived(api, "helper", false)).rejects.toThrow("Only an owned");
    await expect(f.service.setArchived(api, "missing", true)).rejects.toThrow("folder may be missing");
    await expect(f.service.setArchived(api, "escape", false)).rejects.toThrow("Only an owned");
    expect(writes).toBe(0);
  });
  it("does not report success when the native archive state is unchanged", async () => {
    const f = await fixture();
    const api = { agents: { ref: () => ({ refresh: async () => ({ agent: { id: "owned", cwd: f.cwd, metadata: { [QUICK_CHAT_KEY]: true }, archivedAt: null } }), archive: async () => {} }) } } as unknown as PluginHandlerContext["paseo"];
    await expect(f.service.setArchived(api, "owned", true)).rejects.toThrow("did not confirm");
  });
  it("rejects overlapping archive/restore requests and reconciles a lost response without replay", async () => {
    const f = await fixture(); let archivedAt: string | null = null;
    let finish!: () => void; let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let writes = 0;
    const api = { agents: { ref: () => ({ refresh: async () => ({ agent: { id: "owned", cwd: f.cwd, metadata: { [QUICK_CHAT_KEY]: true }, archivedAt } }), archive: async () => { writes++; entered(); await new Promise<void>((resolve) => { finish = resolve; }); archivedAt = "2026-01-01"; throw new Error("Lost archive response"); }, reload: async () => { writes++; archivedAt = null; } }) } } as unknown as PluginHandlerContext["paseo"];
    const first = f.service.setArchived(api, "owned", true);
    await started;
    await expect(f.service.setArchived(api, "owned", true)).rejects.toThrow("already in progress");
    await expect(f.service.setArchived(api, "owned", false)).rejects.toThrow("already in progress");
    finish();
    await expect(first).rejects.toThrow("Lost archive response");
    expect(await f.service.setArchived(api, "owned", true)).toEqual({ ok: true });
    expect(writes).toBe(1);
  });
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
