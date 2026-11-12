import { describe, expect, it } from "vitest";
import { documentSchema } from "../shared/document";
import { createPlanInstruction, createPlanTools, TASK_LIST_INSTRUCTION, TODO_TOOLS_ENV } from "./plan-tools";

const ready = (stepsCard?: boolean) => {
  const document = documentSchema.parse({});
  if (stepsCard !== undefined) document.layouts[0].profile.sidebar.view.stepsCard = stepsCard;
  return { read: async () => ({ status: "ready" as const, values: document, revision: "r1" }) };
};

describe("task-list tools for the steps card", () => {
  it("launches Claude agents with the tools while the steps card is on", async () => {
    const result = await createPlanTools(ready())({ request: { provider: "claude", env: { A: "b" } } });
    expect(result?.env).toEqual({ A: "b", [TODO_TOOLS_ENV]: "1" });
    expect((await createPlanTools(ready())({ request: { provider: "claude/claude-opus-5-5", env: undefined as Record<string, string> | undefined } }))?.env).toEqual({ [TODO_TOOLS_ENV]: "1" });
  });

  it("leaves other providers, a turned-off card, and the user's own value alone", async () => {
    expect(await createPlanTools(ready())({ request: { provider: "codex" } })).toBeUndefined();
    expect(await createPlanTools(ready(false))({ request: { provider: "claude" } })).toBeUndefined();
    expect(await createPlanTools(ready())({ request: { provider: "claude", env: { [TODO_TOOLS_ENV]: "0" } } })).toBeUndefined();
  });

  it("opens the agent as Paseo would when the profile cannot be read", async () => {
    const broken = { read: async () => Promise.reject(new Error("disk")) };
    expect(await createPlanTools(broken)({ request: { provider: "claude" } })).toBeUndefined();
  });
});

describe("task-list instruction for the steps card", () => {
  const config = (provider: string, systemPrompt?: string) => ({ request: { config: { provider, cwd: "/w", ...(systemPrompt === undefined ? {} : { systemPrompt }) } } });

  it("asks new Claude agents to keep a task list while the steps card is on, after any instruction they already have", async () => {
    expect((await createPlanInstruction(ready())(config("claude/claude-opus-5-5")))?.config.systemPrompt).toBe(TASK_LIST_INSTRUCTION);
    expect((await createPlanInstruction(ready())(config("claude", "Be brief.")))?.config.systemPrompt).toBe(`Be brief.\n\n${TASK_LIST_INSTRUCTION}`);
  });

  it("leaves other providers, a turned-off card, an agent that already has it, and an unreadable profile alone", async () => {
    expect(await createPlanInstruction(ready())(config("codex"))).toBeUndefined();
    expect(await createPlanInstruction(ready(false))(config("claude"))).toBeUndefined();
    expect(await createPlanInstruction(ready())(config("claude", `x\n\n${TASK_LIST_INSTRUCTION}`))).toBeUndefined();
    expect(await createPlanInstruction({ read: async () => Promise.reject(new Error("disk")) })(config("claude"))).toBeUndefined();
  });
});
