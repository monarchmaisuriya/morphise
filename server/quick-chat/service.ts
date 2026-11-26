import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { QUICK_CHAT_KEY, quickChatHandoffBlock, quickChatNewWorkspace, quickChatWorkspacePreview, visibleQuickChatAgent } from "../../shared/quick-chat";
import type { z } from "zod";
import { transcriptText } from "./transcript";

type Paseo = PluginHandlerContext["paseo"];
type Agent = NonNullable<Awaited<ReturnType<ReturnType<Paseo["agents"]["ref"]>["refresh"]>>>["agent"];
interface Operation { version: 1; sourceId: string; workspaceId: string; directory: string; agentId: string; provider: string; fingerprint: string; newWorkspace?: z.infer<typeof quickChatWorkspacePreview>; stage: "prepared" | "creating" | "complete"; }
const note = "This workspace is for general conversation and idea capture, not a selected project. Its directory is temporary working space, not a sandbox. Do not inspect unrelated folders unless the user asks. The user can choose Continue in project when ready.";
const fingerprint = (agent: Agent) => createHash("sha256").update(JSON.stringify([agent.id, agent.updatedAt, agent.activeTurn, agent.pendingPermissions, agent.model, agent.provider])).digest("hex");

export class QuickChatService {
  private active = new Map<string, Promise<unknown>>();
  private previews = new Map<string, { operation: Operation; expires: number }>();
  constructor(readonly root = join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-data", "morphise", "quick-chat")) {}

  private async exclusive<T>(key: string, run: () => Promise<T>): Promise<T> {
    if (this.active.has(key)) throw new Error("This operation is already in progress. Wait for its result.");
    const work = run();
    this.active.set(key, work);
    try { return await work; } finally { this.active.delete(key); }
  }
  private async save(id: string, operation: Operation) {
    await mkdir(join(this.root, "operations"), { recursive: true, mode: 0o700 });
    const file = join(this.root, "operations", `${id}.json`);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(operation), { mode: 0o600 });
    await rename(temporary, file);
  }
  private async read(id: string): Promise<Operation> {
    const value = JSON.parse(await readFile(join(this.root, "operations", `${id}.json`), "utf8")) as Operation;
    if (!value || value.version !== 1 || typeof value.agentId !== "string" || typeof value.workspaceId !== "string" || typeof value.directory !== "string" || typeof value.sourceId !== "string" || typeof value.provider !== "string" || typeof value.fingerprint !== "string" || !["prepared", "creating", "complete"].includes(value.stage)) throw new Error("The saved handoff record is invalid; no action was taken.");
    if (value.newWorkspace !== undefined) {
      const parsed = quickChatWorkspacePreview.safeParse(value.newWorkspace);
      if (!parsed.success || !/^wks_[a-f0-9]{16}$/.test(value.workspaceId) || (parsed.data.mode === "worktree" && (!parsed.data.baseRef || !parsed.data.branchName))) throw new Error("The saved new-workspace handoff record is invalid; no action was taken.");
      value.newWorkspace = parsed.data;
    }
    return value;
  }
  async owned(agent: Agent): Promise<boolean> {
    if (agent.metadata?.[QUICK_CHAT_KEY] !== true || !visibleQuickChatAgent(agent)) return false;
    const base = await realpath(join(this.root, "workspaces"));
    const folder = await realpath(agent.cwd);
    const path = relative(base, folder);
    return !!path && !path.startsWith("..") && !isAbsolute(path);
  }
  async source(paseo: Paseo, id: string): Promise<Agent> {
    const agent = (await paseo.agents.ref(id).refresh())?.agent;
    if (!agent || !(await this.owned(agent))) throw new Error("Select a Morphise Quick Chat owned by this daemon.");
    const blocked = quickChatHandoffBlock(agent);
    if (blocked) throw new Error(blocked);
    return agent;
  }
  async setArchived(paseo: Paseo, agentId: string, archived: boolean) {
    return this.exclusive(`archive:${agentId}`, async () => {
      const handle = paseo.agents.ref(agentId);
      const agent = (await handle.refresh())?.agent;
      let owned = false;
      try { owned = !!agent && await this.owned(agent); } catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
      }
      if (!agent || !owned) throw new Error("Only an owned Morphise Quick Chat with an available scratch folder can be archived or restored. Its folder may be missing; check the original location in Paseo.");
      if (!!agent.archivedAt !== archived) {
        if (archived) await handle.archive();
        else await handle.reload();
      }
      const current = (await handle.refresh())?.agent;
      if (!current || !!current.archivedAt !== archived) throw new Error(`Paseo did not confirm the chat was ${archived ? "archived" : "unarchived"}. Refresh the list before trying again.`);
      return { ok: true as const };
    });
  }
  async list(paseo: Paseo, includeArchived = false) {
    const chats: { id: string; title: string; workspaceId: string; directory?: string; docsDirectory?: string; archivedAt: string | null; provider: string; createdAt: string; updatedAt: string }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await paseo.agents.list({ filter: { includeBackground: true, includeArchived }, page: { limit: 200, ...(cursor ? { cursor } : {}) } });
      for (const { agent } of result.entries) if ((includeArchived || !agent.archivedAt) && agent.workspaceId && agent.metadata?.[QUICK_CHAT_KEY] === true && visibleQuickChatAgent(agent)) {
        let location = false;
        try { location = await this.owned(agent); } catch (error) {
          if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
        }
        chats.push({ id: agent.id, title: agent.title || "Quick Chat", workspaceId: agent.workspaceId, archivedAt: agent.archivedAt || null, provider: agent.provider || "", createdAt: agent.createdAt || "", updatedAt: agent.updatedAt || "", ...(location ? { directory: agent.cwd, docsDirectory: join(agent.cwd, "docs") } : {}) });
      }
      if (!result.pageInfo.hasMore) return chats;
      cursor = result.pageInfo.nextCursor ?? undefined;
      if (!cursor) throw new Error("Paseo returned an incomplete chat page without a cursor.");
    }
    throw new Error("Too many chat pages to list safely; use Paseo's workspace list.");
  }
  async start(paseo: Paseo, operationId: string, provider: string) {
    return this.exclusive(operationId, async () => {
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) throw new Error("Invalid workspace operation ID.");
      const directory = join(this.root, "workspaces", operationId);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const base = await realpath(join(this.root, "workspaces"));
      const actual = await realpath(directory);
      if (relative(base, actual) !== operationId) throw new Error("The scratch workspace is not inside its owned directory.");
      const hash = createHash("sha256").update(operationId).digest("hex");
      const agentId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const locationNote = `${note}\nYour absolute working directory on the daemon host is ${JSON.stringify(directory)}. A relative docs/ path resolves to ${JSON.stringify(join(directory, "docs"))}. When proposing or reporting a saved file, give its absolute path on this host. Do not claim a file was saved unless the write succeeded; distinguish planned saves from completed writes. No docs directory has been created for you.`;
      // Leave the agent title unset: Paseo owns normal first-message naming and manual-title preservation.
      const workspace = await paseo.workspaces.create({ source: { kind: "directory", path: directory }, title: "Quick Chat", background: true, idempotencyKey: `morphise.quick-chat.workspace.${operationId}`, agent: { agentId, cwd: directory, config: { provider, systemPrompt: locationNote }, metadata: { [QUICK_CHAT_KEY]: true } } });
      await workspace.setMetadata({ [QUICK_CHAT_KEY]: true });
      return { agentId, workspaceId: workspace.id, directory };
    });
  }
  async targets(paseo: Paseo) {
    const targets: { id: string; title: string; directory: string; projectName: string; projectRoot: string }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await paseo.workspaces.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
      for (const workspace of result.entries) if (!workspace.archivingAt && !workspace.background && !workspace.internal) targets.push({ id: workspace.id, title: workspace.title || workspace.name || workspace.projectDisplayName, directory: workspace.workspaceDirectory || workspace.projectRootPath, projectName: workspace.projectDisplayName, projectRoot: workspace.projectRootPath });
      if (!result.pageInfo.hasMore) return targets;
      cursor = result.pageInfo.nextCursor ?? undefined;
      if (!cursor) throw new Error("Paseo returned an incomplete project page.");
    }
    throw new Error("Too many open workspace pages. Close some workspaces and try again.");
  }
  async readiness(paseo: Paseo, id: string): Promise<string | null> {
    const agent = (await paseo.agents.ref(id).refresh())?.agent;
    if (!agent || !(await this.owned(agent))) throw new Error("Select a Morphise Quick Chat owned by this daemon.");
    return quickChatHandoffBlock(agent);
  }
  async projects(paseo: Paseo) {
    const result = await paseo.projects.list();
    return result.projects.map((project) => ({ id: project.projectId, name: project.projectDisplayName, root: project.projectRootPath, kind: project.projectKind }));
  }
  private async project(paseo: Paseo, input: z.infer<typeof quickChatNewWorkspace>) {
    const project = (await this.projects(paseo)).find((item) => item.id === input.projectId);
    if (!project) throw new Error("The selected project is no longer registered on this host. Refresh destinations.");
    if (input.mode === "worktree" && project.kind !== "git") throw new Error("A Git worktree requires a Git project. Choose the shared project folder instead.");
    return project;
  }
  async prepare(paseo: Paseo, agentId: string, workspaceId?: string, newWorkspace?: z.infer<typeof quickChatNewWorkspace>) {
    if (!!workspaceId === !!newWorkspace) throw new Error("Choose exactly one existing workspace or new project workspace.");
    const source = await this.source(paseo, agentId);
    const project = newWorkspace ? await this.project(paseo, quickChatNewWorkspace.parse(newWorkspace)) : null;
    const target = project ? { directory: project.root } : (await this.targets(paseo)).find((item) => item.id === workspaceId);
    if (!target) throw new Error("The destination is no longer an open project workspace.");
    const before = fingerprint(source);
    const items: unknown[][] = [];
    let cursor: { epoch: string; seq: number } | undefined;
    let partial = false;
    let count = 0;
    let bytes = 0;
    const deadline = Date.now() + 15000;
    for (let page = 0; page < 20; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { partial = true; break; }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        paseo.agents.ref(agentId).timeline.refetch({ direction: page === 0 ? "tail" : "before", limit: 200, ...(cursor ? { cursor } : {}) }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("History preparation exceeded 15 seconds. No context was sent; try again later.")), remaining); }),
      ]).finally(() => clearTimeout(timer));
      if (result.staleCursor || result.gap) throw new Error("Chat history changed while preparing. Prepare the handoff again.");
      items.unshift(result.entries.map((entry) => entry.item));
      bytes += Buffer.byteLength(JSON.stringify(result.entries));
      count += result.entries.length;
      partial = result.hasOlder;
      if (!partial || Date.now() >= deadline || bytes >= 2 * 1024 * 1024) break;
      if (!result.startCursor || JSON.stringify(result.startCursor) === JSON.stringify(cursor)) throw new Error("Paseo did not advance the history cursor.");
      cursor = result.startCursor;
    }
    const after = await this.source(paseo, agentId);
    if (before !== fingerprint(after)) throw new Error("The chat changed during preparation. Prepare again.");
    const provider = source.model || source.runtimeInfo?.model;
    if (!provider) throw new Error("This chat's model is unknown. Open the chat and choose a model first.");
    const context = transcriptText(items.flat(), partial);
    const previewId = randomUUID();
    const planned = newWorkspace && project ? { ...newWorkspace, projectName: project.name, projectRoot: project.root, projectKind: project.kind, ...(newWorkspace.mode === "worktree" ? { baseRef: newWorkspace.baseRef ?? "HEAD", branchName: `quick-chat/${previewId}` } : {}) } : undefined;
    const operation: Operation = { version: 1, sourceId: agentId, workspaceId: workspaceId ?? `wks_${randomUUID().replace(/-/g, "").slice(0, 16)}`, directory: target.directory, agentId: randomUUID(), provider: `${source.provider}/${provider}`, fingerprint: before, ...(planned ? { newWorkspace: planned } : {}), stage: "prepared" };
    // A bounded in-memory preview stores identifiers, never transcript content. Restart requires a fresh preview.
    for (const [id, preview] of this.previews) if (preview.expires < Date.now()) this.previews.delete(id);
    if (this.previews.size >= 32) throw new Error("Too many open previews. Close an older preview and try again.");
    this.previews.set(previewId, { operation, expires: Date.now() + 10 * 60000 });
    const files = await readdir(source.cwd, { withFileTypes: true });
    return { previewId, text: context.text, provider: operation.provider, directory: target.directory, ...(planned ? { newWorkspace: planned } : {}), entries: count, partial: context.partial, files: files.filter((entry) => entry.isFile()).slice(0, 50).map((entry) => entry.name), filesPartial: files.length > 50 || files.some((entry) => !entry.isFile()) };
  }
  async recover(paseo: Paseo, operationId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(operationId)) throw new Error("Invalid handoff recovery ID.");
    const operation = await this.read(operationId);
    const source = (await paseo.agents.ref(operation.sourceId).refresh())?.agent;
    if (!source || !(await this.owned(source))) throw new Error("The original Quick Chat is no longer available for recovery.");
    const existing = (await paseo.agents.ref(operation.agentId).refresh())?.agent;
    if (!existing) {
      const partial = operation.newWorkspace ? await paseo.workspaces.ref(operation.workspaceId).refresh() : null;
      if (partial) throw new Error(`Workspace ${operation.workspaceId} may have been created, but its agent is not confirmed. No request was replayed. Check that workspace before preparing another handoff.`);
      throw new Error("Creation may still be pending or failed. No request was replayed. Keep the original chat and check the destination before preparing another handoff.");
    }
    if (existing.workspaceId !== operation.workspaceId || existing.metadata?.["morphise.quick-chat.operation"] !== operationId) throw new Error("The destination identity did not match this handoff; no request was replayed.");
    if (operation.newWorkspace) {
      const workspace = await paseo.workspaces.ref(operation.workspaceId).refresh();
      if (!workspace || workspace.projectId !== operation.newWorkspace.projectId || workspace.metadata?.["morphise.quick-chat.operation"] !== operationId) throw new Error("The new workspace identity did not match this handoff; no request was replayed.");
    }
    return { agentId: existing.id, workspaceId: operation.workspaceId, warning: operation.stage === "complete" ? null : "Destination exists. Check its first message before doing further work; the creation response was not confirmed." };
  }
  async continue(paseo: Paseo, previewId: string, text: string) {
    return this.exclusive(previewId, async () => {
      const preview = this.previews.get(previewId);
      if (!preview) throw new Error("The preview is unavailable. Use its recovery ID to check any previous attempt before preparing again.");
      const operation = preview.operation;
      if (operation.stage !== "prepared") return this.recover(paseo, previewId);
      if (preview.expires < Date.now()) throw new Error("This unused preview expired. Prepare again; this preview has not sent context.");
      const source = await this.source(paseo, operation.sourceId);
      if (fingerprint(source) !== operation.fingerprint) throw new Error("The source changed. Prepare again before sending context.");
      if (operation.newWorkspace) {
        const current = await this.project(paseo, operation.newWorkspace);
        if (current.root !== operation.newWorkspace.projectRoot || current.kind !== operation.newWorkspace.projectKind) throw new Error("The project root or kind changed. Prepare again.");
      } else if (!(await this.targets(paseo)).some((item) => item.id === operation.workspaceId && item.directory === operation.directory)) throw new Error("The destination changed or is no longer available. Prepare again.");
      operation.stage = "creating";
      await this.save(previewId, operation);
      const latest = await this.source(paseo, operation.sourceId);
      if (fingerprint(latest) !== operation.fingerprint) throw new Error("The source changed before creation. No creation request was sent; prepare again.");
      const agentInput = { agentId: operation.agentId, config: { provider: operation.provider }, title: source.title || "Quick Chat idea", prompt: text, metadata: { "morphise.quick-chat.operation": previewId, "morphise.quick-chat.source": source.id } };
      if (operation.newWorkspace) {
        const planned = operation.newWorkspace;
        const workspace = await paseo.workspaces.create({ workspaceId: operation.workspaceId, idempotencyKey: `morphise.quick-chat.handoff.${previewId}`, background: false, title: source.title || "Quick Chat idea", metadata: agentInput.metadata, source: planned.mode === "worktree" ? { kind: "worktree", projectId: planned.projectId, cwd: planned.projectRoot, action: "branch-off", refName: planned.baseRef, branchName: planned.branchName } : { kind: "directory", projectId: planned.projectId, path: planned.projectRoot }, agent: { ...agentInput, cwd: planned.projectRoot } });
        if (workspace.id !== operation.workspaceId) throw new Error("Paseo returned a different workspace identity. Keep the recovery ID and check the result; do not resend.");
      } else {
        await paseo.workspaces.ref(operation.workspaceId).agents.create({ ...agentInput, idempotencyKey: `morphise.quick-chat.handoff.${previewId}` });
      }
      operation.stage = "complete";
      await this.save(previewId, operation);
      return { agentId: operation.agentId, workspaceId: operation.workspaceId, warning: null };
    });
  }
  async decorate(cwd: string) {
    try {
      const base = await realpath(join(this.root, "workspaces"));
      const folder = await realpath(cwd);
      const child = relative(base, folder);
      return child && !child.startsWith("..") && !isAbsolute(child) ? note : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
