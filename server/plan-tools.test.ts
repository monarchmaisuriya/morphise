import type { PluginSessionOpenRequest } from "@getpaseo/plugin/server";
import { describe, expect, it } from "vitest";
import { documentSchema } from "../shared/document";
import { createPlanTools, TASK_LIST_INSTRUCTION, TODO_TOOLS_ENV } from "./plan-tools";
import { TITLE_HELPER } from "./titles";

const ready = (stepsCard?: boolean) => {
  const document = documentSchema.parse({});
  if (stepsCard !== undefined) document.layouts[0]!.profile.sidebar.view.stepsCard = stepsCard;
  return { read: async () => ({ status: "ready" as const, values: document, revision: "r1" }) };
};
const request = (patch: Partial<PluginSessionOpenRequest> = {}): PluginSessionOpenRequest => ({
  agentId: "a", workspaceId: null, provider: "work-alias/selected-model", cwd: "/w", reason: "create", purpose: "interactive", title: null,
  background: false, labels: {}, metadata: {}, tools: [], env: {}, mcpServers: {},
  baseConfig: { provider: "work-alias/selected-model", cwd: "/w" },
  openSupport: {
    adapter: { kind: "builtin", id: "claude" }, instructions: "supported", mcpHttp: "unsupported", exactMcpPreapproval: "unsupported",
    attachedTools: { delivery: "none", enabled: false, disabledTools: [] },
    restrictions: { mcpConfiguration: "none", processEnvironment: "mutable" }, providerOptions: [],
  }, ...patch,
});

describe("task-list tools and instruction for the steps card", () => {
  it("derives launch env and guidance for a resolved Claude alias without changing provider or saved prompt", async () => {
    const input = request({ env: { A: "b" }, baseConfig: { provider: "work-alias/selected-model", cwd: "/w", systemPrompt: "Be brief." } });
    const before = JSON.stringify(input);
    const opened = await createPlanTools(ready())({ request: input });
    expect(opened?.env).toEqual({ A: "b", [TODO_TOOLS_ENV]: "1" });
    expect(opened?.provider).toBe("work-alias/selected-model");
    expect(opened?.appendSystemPrompt).toEqual([`<morphise-task-list>\n${TASK_LIST_INSTRUCTION}\n</morphise-task-list>`]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(["0", "", "false"])("leaves explicit %j unchanged and adds no tool-use guidance", async (value) => {
    expect(await createPlanTools(ready())({ request: request({ env: { [TODO_TOOLS_ENV]: value } }) })).toBeUndefined();
  });

  it("can guide an explicitly enabled task list without writing environment", async () => {
    const opened = await createPlanTools(ready())({ request: request({ env: { [TODO_TOOLS_ENV]: "1" } }) });
    expect(opened?.env).toEqual({ [TODO_TOOLS_ENV]: "1" });
    expect(opened?.appendSystemPrompt?.[0]).toContain(TASK_LIST_INSTRUCTION);
  });

  it("does not infer Claude support from the selected provider name", async () => {
    const input = request({ provider: "claude/not-a-builtin" });
    expect(await createPlanTools(ready())({ request: { ...input, openSupport: { ...input.openSupport!, adapter: { kind: "acp" } } } })).toBeUndefined();
    expect(await createPlanTools(ready())({ request: { ...input, openSupport: undefined } })).toBeUndefined();
  });

  it("leaves Off, history and the title helper unchanged", async () => {
    expect(await createPlanTools(ready(false))({ request: request() })).toBeUndefined();
    expect(await createPlanTools(ready())({ request: request({ purpose: "history" }) })).toBeUndefined();
    expect(await createPlanTools(ready())({ request: request({ metadata: { [TITLE_HELPER]: true } }) })).toBeUndefined();
  });

  it("keeps the established child task-list behavior", async () => {
    const opened = await createPlanTools(ready())({ request: request({ labels: { "paseo.parent-agent-id": "parent" } }) });
    expect(opened?.env[TODO_TOOLS_ENV]).toBe("1");
  });

  it("does not inject env or guidance when the process environment is fixed", async () => {
    const input = request();
    expect(await createPlanTools(ready())({ request: { ...input, openSupport: { ...input.openSupport!, restrictions: { mcpConfiguration: "fixed", processEnvironment: "fixed" } } } })).toBeUndefined();
  });

  it("keeps environment delivery when instructions are unavailable", async () => {
    const input = request();
    const opened = await createPlanTools(ready())({ request: { ...input, openSupport: { ...input.openSupport!, instructions: "unsupported" } } });
    expect(opened?.env[TODO_TOOLS_ENV]).toBe("1");
    expect(opened?.appendSystemPrompt).toBeUndefined();
  });

  it.each(["present", "ambiguous"] as const)("suppresses duplicate task guidance for %s legacy state", async (state) => {
    const opened = await createPlanTools(ready())({ request: request({ legacyConfigState: { selectors: { "task-list-prompt": state } } }) });
    expect(opened?.env[TODO_TOOLS_ENV]).toBe("1");
    expect(opened?.appendSystemPrompt).toBeUndefined();
  });

  it.each(["present", "ambiguous"] as const)("suppresses duplicate task guidance for %s task-before-HTML state", async (state) => {
    const opened = await createPlanTools(ready())({ request: request({ legacyConfigState: { selectors: { "task-list-prompt": "absent", "task-list-prompt-before-html": state } } }) });
    expect(opened?.env[TODO_TOOLS_ENV]).toBe("1");
    expect(opened?.appendSystemPrompt).toBeUndefined();
  });

  it("adds task guidance when both task selectors are absent", async () => {
    const opened = await createPlanTools(ready())({ request: request({ legacyConfigState: { selectors: { "task-list-prompt": "absent", "task-list-prompt-before-html": "absent" } } }) });
    expect(opened?.appendSystemPrompt).toEqual([`<morphise-task-list>\n${TASK_LIST_INSTRUCTION}\n</morphise-task-list>`]);
  });

  it("keeps saved HTML independent from fresh task guidance", async () => {
    const opened = await createPlanTools(ready())({ request: request({ baseConfig: { provider: "work-alias/selected-model", cwd: "/w", systemPrompt: "# HTML pages\nCaller text", mcpServers: { chat_polish: { type: "http", url: "http://saved.invalid/mcp" } } }, legacyConfigState: { selectors: { "html-prompt-current": "present", "task-list-prompt": "absent" } } }) });
    expect(opened?.appendSystemPrompt?.[0]).toContain(TASK_LIST_INSTRUCTION);
  });

  it("leaves the saved task instruction intact without repeating it", async () => {
    const baseConfig = { provider: "work-alias/selected-model", cwd: "/w", systemPrompt: `Caller\n\n${TASK_LIST_INSTRUCTION}` };
    const opened = await createPlanTools(ready())({ request: request({ baseConfig }) });
    expect(opened?.appendSystemPrompt).toBeUndefined();
    expect(baseConfig.systemPrompt).toBe(`Caller\n\n${TASK_LIST_INSTRUCTION}`);
  });

  it("suppresses task guidance saved before an unrelated HTML suffix even when host suffix matching says absent", async () => {
    const systemPrompt = `${TASK_LIST_INSTRUCTION}\n\n# HTML pages\nSaved HTML guidance`;
    const opened = await createPlanTools(ready())({ request: request({ baseConfig: { provider: "work-alias/selected-model", cwd: "/w", systemPrompt }, legacyConfigState: { selectors: { "task-list-prompt": "absent" } } }) });
    expect(opened?.env[TODO_TOOLS_ENV]).toBe("1");
    expect(opened?.appendSystemPrompt).toBeUndefined();
  });

  it("opens the agent as Paseo would when the profile cannot be read", async () => {
    const broken = { read: async () => Promise.reject(new Error("disk")) };
    expect(await createPlanTools(broken)({ request: request() })).toBeUndefined();
  });
});
