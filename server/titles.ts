// "Generate a title" on an agent card: reads the start of the chat, asks a hidden background agent
// for a title with the chosen provider and model (the chat's own by default), and applies it.
// Approach after Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md). The helper runs on the
// user's provider login, so it costs tokens; it is archived when it finishes or fails.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanTitle, type TitleJob, type TitleSettings, titleRequest } from "../shared/agent-titles";
import { baseProvider } from "./polish/pages/html-tool";

const HELPER_TIMEOUT_MS = 120_000;
/** A job still running this long fails: the helper's own wait plus a minute for reading the chat, creating the helper and renaming. */
export const TITLE_JOB_DEADLINE_MS = HELPER_TIMEOUT_MS + 60_000;
/** The metadata key Morphise marks its title helper with, so its own hooks (HTML page tools, task-list tools) leave it alone. */
export const TITLE_HELPER = "morphise.titleHelper";
// The strictest mode each base provider offers. Claude's "default" asks before any tool runs; nobody answers a hidden agent, so a tool call
// stalls until the helper times out. Codex has no asking mode: "auto" keeps its default approval flow instead of the auto-reviewer, and the
// empty folder is what contains it. Paseo can't deny tools outright: a tool policy only preapproves. Other providers keep their default.
const ASKING_MODE: Record<string, string> = { claude: "default", codex: "auto" };
// Finished jobs are kept a while for the app to read, then dropped.
const KEEP_MS = 10 * 60_000;
// The newest page holds the latest reply; when the chat is longer, its oldest page holds the first message.
const TAIL = 200;
const HEAD = 40;

interface TimelineEntry {
  item?: { type?: string; text?: string };
}

interface TimelinePage {
  entries: readonly unknown[];
  hasOlder?: boolean;
  epoch?: string;
  window?: { minSeq: number };
}

interface AgentHandle {
  refresh(): Promise<unknown>;
  current(): { provider?: string; model?: string | null; cwd?: string } | null;
  timeline: { refetch(options: { direction: "tail"; limit: number } | { direction: "before"; cursor: { epoch: string; seq: number }; limit: number }): Promise<TimelinePage> };
}

// The helper is fed chat text, which can carry instructions, and "Do not use any tools" is only a
// request. It runs in an empty folder of its own, in a mode that asks before tools (ASKING_MODE),
// without Morphise's HTML page tools.
export interface Workdir {
  path: string;
  remove(): Promise<void>;
}

async function emptyWorkdir(): Promise<Workdir> {
  const path = await mkdtemp(join(tmpdir(), "morphise-title-"));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

interface HelperHandle {
  waitForFinish(timeoutMs?: number): Promise<{ status: string; error: string | null; lastMessage: string | null }>;
  archive(): Promise<unknown>;
}

export interface TitlePaseo {
  agents: {
    ref(agentId: string): AgentHandle;
    create(options: { config: { provider: string; modeId?: string }; cwd: string; prompt: string; background: boolean; title: string; metadata: Record<string, boolean> }): Promise<HelperHandle>;
  };
  config: { get(): Promise<{ config: { providers?: unknown } }> };
}

export interface TitleDeps {
  readSettings(): Promise<TitleSettings>;
  // Applies the title (Paseo's SDK has no rename; the CLI does). Resolves with an error message on failure.
  rename(agentId: string, title: string): Promise<string | null>;
  newId?(): string;
  now?(): number;
  workdir?(): Promise<Workdir>;
}

const textOf = (entry: unknown) => {
  const item = (entry as TimelineEntry | null)?.item;
  return typeof item?.text === "string" ? item.text : "";
};

/** `deadline` aborts the work between its steps: past it, no helper is started and no title applied, and a helper already started is archived. */
export async function generateTitle(agentId: string, paseo: TitlePaseo, deps: Pick<TitleDeps, "readSettings" | "rename" | "workdir">, deadline?: AbortSignal): Promise<string> {
  const settings = await deps.readSettings();
  const handle = paseo.agents.ref(agentId);
  await handle.refresh();
  deadline?.throwIfAborted();
  const agent = handle.current();
  if (!agent?.provider) throw new Error("Paseo does not know this agent");
  const tail = await handle.timeline.refetch({ direction: "tail", limit: TAIL });
  const head = tail.hasOlder && tail.epoch && tail.window ? await handle.timeline.refetch({ direction: "before", cursor: { epoch: tail.epoch, seq: tail.window.minSeq + HEAD }, limit: HEAD }) : tail;
  const isPrompt = (entry: unknown) => (entry as TimelineEntry).item?.type === "user_message" && textOf(entry).trim() !== "";
  const first = head.entries.find(isPrompt) ?? tail.entries.find(isPrompt);
  if (!first) throw new Error("The chat has no message to name it by");
  const last = [...tail.entries].reverse().find((entry) => (entry as TimelineEntry).item?.type === "assistant_message");
  const providerName = settings.provider || agent.provider.split("/")[0]!;
  const model = settings.model || (settings.provider ? "" : agent.model ?? "");
  // Unreadable daemon config: judge the provider by its own id.
  const providers = await paseo.config.get().then(({ config }) => config.providers, () => undefined);
  const modeId = ASKING_MODE[baseProvider(providerName, providers)];
  const workdir = await (deps.workdir ?? emptyWorkdir)();
  // A create that never answers would otherwise leave the folder behind once the job has failed.
  const removeLate = () => void workdir.remove().catch(() => undefined);
  deadline?.addEventListener("abort", removeLate, { once: true });
  let helper: HelperHandle;
  try {
    deadline?.throwIfAborted();
    helper = await paseo.agents.create({
      config: { provider: model ? `${providerName}/${model}` : providerName, ...(modeId && { modeId }) },
      cwd: workdir.path,
      prompt: titleRequest(settings.prompt, textOf(first), last ? textOf(last) : ""),
      background: true,
      title: "Morphise title helper",
      metadata: { [TITLE_HELPER]: true },
    });
  } catch (error) {
    deadline?.removeEventListener("abort", removeLate);
    await workdir.remove();
    throw error;
  }
  try {
    deadline?.throwIfAborted();
    const result = await helper.waitForFinish(HELPER_TIMEOUT_MS);
    deadline?.throwIfAborted();
    if (result.status !== "idle") throw new Error(result.error ?? `The title helper stopped (${result.status})`);
    const title = cleanTitle(result.lastMessage ?? "");
    if (!title) throw new Error("The title helper gave no title");
    deadline?.throwIfAborted();
    const failed = await deps.rename(agentId, title);
    if (failed) throw new Error(failed);
    return title;
  } finally {
    deadline?.removeEventListener("abort", removeLate);
    await helper.archive().catch((error: unknown) => console.warn("[morphise] Could not archive the title helper", error));
    await workdir.remove().catch((error: unknown) => console.warn("[morphise] Could not remove the title helper's folder", error));
  }
}

/** Title jobs the app starts and then polls, since a title takes longer than one request may wait. */
export function createTitleJobs(deps: TitleDeps) {
  const jobs = new Map<string, { job: TitleJob; at: number }>();
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? (() => `title-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const prune = () => {
    for (const [id, entry] of jobs) if (entry.job.state !== "running" && now() - entry.at > KEEP_MS) jobs.delete(id);
  };
  return {
    start(agentId: string, paseo: TitlePaseo): { jobId: string } {
      prune();
      const jobId = newId();
      jobs.set(jobId, { job: { state: "running" }, at: now() });
      // A step that never answers (a stuck refresh or create) would keep the job running for good, and prune skips running jobs.
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error("The title took too long; start it again")), TITLE_JOB_DEADLINE_MS);
      const late = new Promise<never>((_, reject) => deadline.signal.addEventListener("abort", () => reject(deadline.signal.reason)));
      void Promise.race([generateTitle(agentId, paseo, deps, deadline.signal), late])
        .then(
          (title) => jobs.set(jobId, { job: { state: "done", title }, at: now() }),
          (error: unknown) => jobs.set(jobId, { job: { state: "failed", error: error instanceof Error ? error.message : String(error) }, at: now() }),
        )
        .finally(() => clearTimeout(timer));
      return { jobId };
    },
    status(jobId: string): TitleJob {
      return jobs.get(jobId)?.job ?? { state: "failed", error: "This title job is no longer known; start it again" };
    },
  };
}
