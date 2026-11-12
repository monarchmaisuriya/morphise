// "Generate a title" on an agent card: reads the start of the chat, asks a hidden background agent
// for a title with the chosen provider and model (the chat's own by default), and applies it.
// Approach after Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md). The helper runs on the
// user's provider login, so it costs tokens; it is archived when it finishes or fails.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanTitle, type TitleJob, type TitleSettings, titleRequest } from "../shared/agent-titles";

const HELPER_TIMEOUT_MS = 120_000;
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
// request. It runs in an empty folder of its own, so nothing it might do reaches the user's project.
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
    create(options: { config: { provider: string }; cwd: string; prompt: string; background: boolean; title: string }): Promise<HelperHandle>;
  };
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

export async function generateTitle(agentId: string, paseo: TitlePaseo, deps: Pick<TitleDeps, "readSettings" | "rename" | "workdir">): Promise<string> {
  const settings = await deps.readSettings();
  const handle = paseo.agents.ref(agentId);
  await handle.refresh();
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
  const workdir = await (deps.workdir ?? emptyWorkdir)();
  let helper: HelperHandle;
  try {
    helper = await paseo.agents.create({
      config: { provider: model ? `${providerName}/${model}` : providerName },
      cwd: workdir.path,
      prompt: titleRequest(settings.prompt, textOf(first), last ? textOf(last) : ""),
      background: true,
      title: "Morphise title helper",
    });
  } catch (error) {
    await workdir.remove();
    throw error;
  }
  try {
    const result = await helper.waitForFinish(HELPER_TIMEOUT_MS);
    if (result.status !== "idle") throw new Error(result.error ?? `The title helper stopped (${result.status})`);
    const title = cleanTitle(result.lastMessage ?? "");
    if (!title) throw new Error("The title helper gave no title");
    const failed = await deps.rename(agentId, title);
    if (failed) throw new Error(failed);
    return title;
  } finally {
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
      void generateTitle(agentId, paseo, deps).then(
        (title) => jobs.set(jobId, { job: { state: "done", title }, at: now() }),
        (error: unknown) => jobs.set(jobId, { job: { state: "failed", error: error instanceof Error ? error.message : String(error) }, at: now() }),
      );
      return { jobId };
    },
    status(jobId: string): TitleJob {
      return jobs.get(jobId)?.job ?? { state: "failed", error: "This title job is no longer known; start it again" };
    },
  };
}
