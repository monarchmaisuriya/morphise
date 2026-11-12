import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TITLE_PROMPT } from "../shared/agent-titles";
import { createTitleJobs, generateTitle, type TitlePaseo } from "./titles";

function fakePaseo(reply: { status: string; error: string | null; lastMessage: string | null }) {
  const archive = vi.fn(async () => undefined);
  const create = vi.fn(async (_options: Parameters<TitlePaseo["agents"]["create"]>[0]) => ({ waitForFinish: async () => reply, archive }));
  const entries = [{ item: { type: "user_message", text: "Fix the login timeout in auth" } }, { item: { type: "assistant_message", text: "Done: raised it to 30 s." } }];
  const paseo: TitlePaseo = {
    agents: {
      ref: () => ({ refresh: async () => undefined, current: () => ({ provider: "claude/claude-opus-5-5", model: "claude-opus-5-5", cwd: "/repo" }), timeline: { refetch: async () => ({ entries }) } }),
      create,
    },
  };
  return { paseo, create, archive };
}

const settings = (patch: Partial<{ provider: string; model: string; prompt: string }> = {}) => async () => ({ provider: "", model: "", prompt: DEFAULT_TITLE_PROMPT, ...patch });

describe("title generation", () => {
  it("asks a hidden helper with the chat's own model in a folder of its own, applies its title, and cleans up", async () => {
    const { paseo, create, archive } = fakePaseo({ status: "idle", error: null, lastMessage: '"Raise login timeout"' });
    const rename = vi.fn(async () => null);
    const remove = vi.fn(async () => undefined);
    expect(await generateTitle("a1", paseo, { readSettings: settings(), rename, workdir: async () => ({ path: "/tmp/morphise-title-x", remove }) })).toBe("Raise login timeout");
    // Never the chat's project: the helper reads chat text and its "no tools" is only a request.
    expect(create.mock.calls[0]?.[0]).toMatchObject({ config: { provider: "claude/claude-opus-5-5" }, cwd: "/tmp/morphise-title-x", background: true });
    expect(create.mock.calls[0]?.[0].prompt).toContain("Fix the login timeout in auth");
    expect(rename).toHaveBeenCalledWith("a1", "Raise login timeout");
    expect(archive).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("reads the first message from the chat's oldest page when the chat is longer than one page", async () => {
    const { paseo, create } = fakePaseo({ status: "idle", error: null, lastMessage: "Title" });
    const tail = { entries: [{ item: { type: "user_message", text: "A later message" } }, { item: { type: "assistant_message", text: "Latest" } }], hasOlder: true, epoch: "e1", window: { minSeq: 500 } };
    const head = { entries: [{ item: { type: "user_message", text: "The very first message" } }] };
    const refetch = vi.fn(async (options: { direction: string }) => (options.direction === "tail" ? tail : head));
    paseo.agents.ref = () => ({ refresh: async () => undefined, current: () => ({ provider: "claude", model: null, cwd: "/repo" }), timeline: { refetch } });
    await generateTitle("a1", paseo, { readSettings: settings(), rename: async () => null, workdir: async () => ({ path: "/tmp/x", remove: async () => undefined }) });
    expect(refetch).toHaveBeenLastCalledWith({ direction: "before", cursor: { epoch: "e1", seq: 540 }, limit: 40 });
    expect(create.mock.calls[0]?.[0].prompt).toContain("The very first message");
  });

  it("uses the chosen provider and model, and archives the helper even when it fails", async () => {
    const { paseo, create, archive } = fakePaseo({ status: "error", error: "rate limited", lastMessage: null });
    await expect(generateTitle("a1", paseo, { readSettings: settings({ provider: "codex", model: "gpt-5-mini" }), rename: async () => null })).rejects.toThrow("rate limited");
    expect(create.mock.calls[0]?.[0].config.provider).toBe("codex/gpt-5-mini");
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("reports a rename the CLI refused", async () => {
    const { paseo } = fakePaseo({ status: "idle", error: null, lastMessage: "Title" });
    await expect(generateTitle("a1", paseo, { readSettings: settings(), rename: async () => "paseo: command not found" })).rejects.toThrow("command not found");
  });

  it("runs as a job the app polls until it finishes", async () => {
    const { paseo } = fakePaseo({ status: "idle", error: null, lastMessage: "Raise login timeout" });
    const jobs = createTitleJobs({ readSettings: settings(), rename: async () => null, newId: () => "j1" });
    expect(jobs.start("a1", paseo)).toEqual({ jobId: "j1" });
    expect(jobs.status("j1")).toEqual({ state: "running" });
    await vi.waitFor(() => expect(jobs.status("j1")).toEqual({ state: "done", title: "Raise login timeout" }));
    expect(jobs.status("unknown").state).toBe("failed");
  });
});
