import { describe, expect, it } from "vitest";
import { documentSchema } from "../shared/document";
import { createPlanTools, TODO_TOOLS_ENV } from "./plan-tools";

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
