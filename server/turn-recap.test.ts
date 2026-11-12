import { describe, expect, it, vi } from "vitest";
import { EMPTY_DOCUMENT, type ProfileDocument } from "../shared/document";
import { createTurnRecap } from "./turn-recap";

const documentWith = (recap: boolean): ProfileDocument => {
  const document = structuredClone(EMPTY_DOCUMENT);
  const layout = document.layouts.find((item) => item.id === document.activeLayout);
  if (layout && recap) layout.profile.chat = { recap: true };
  return document;
};

const LS = { type: "shell", command: "ls", output: "a" };
const EDIT = { type: "edit", filePath: "src/a.ts", unifiedDiff: "@@ -1 +1,2 @@\n-a\n+b\n+c" };

function fakePaseo(detail: Record<string, unknown> = EDIT) {
  const append = vi.fn(async (_row: unknown) => undefined);
  const prompt = new Date(Date.now() - 5000).toISOString();
  const entries = [
    { item: { type: "user_message", text: "Go" }, timestamp: prompt, seqStart: 7 },
    { item: { type: "tool_call", callId: "c1", name: detail.type === "edit" ? "Edit" : "Bash", detail, status: "completed", error: null }, timestamp: prompt, seqStart: 8 },
  ];
  const paseo = { agents: { ref: () => ({ timeline: { refetch: async () => ({ entries }), append } }) } };
  return { paseo: paseo as never, append };
}

const turn = (parentAgentId: string | null = null) => ({ agent: { id: "a1", parentAgentId }, turnId: "t1", outcome: { kind: "completed" as const } });

describe("turn recap hook", () => {
  it("appends one recap row after a top-level turn when the setting is on", async () => {
    const { paseo, append } = fakePaseo();
    await createTurnRecap({ read: async () => ({ status: "ready", revision: "1", values: documentWith(true) }) })(turn(), { paseo });
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0]).toMatchObject({ type: "plugin", id: expect.stringMatching(/^turn-recap:7@.+:t1$/), kind: "turn-recap", version: 1, data: { calls: 1, outcome: "completed", files: [{ path: "src/a.ts", added: 2, removed: 1 }] } });
  });

  it("adds nothing after a finished turn that changed no file and had no failure", async () => {
    const { paseo, append } = fakePaseo(LS);
    await createTurnRecap({ read: async () => ({ status: "ready", revision: "1", values: documentWith(true) }) })(turn(), { paseo });
    expect(append).not.toHaveBeenCalled();
  });

  it("adds nothing when the setting is off, or for a sub-agent", async () => {
    const off = fakePaseo();
    await createTurnRecap({ read: async () => ({ status: "ready", revision: "1", values: documentWith(false) }) })(turn(), { paseo: off.paseo });
    expect(off.append).not.toHaveBeenCalled();
    const sub = fakePaseo();
    await createTurnRecap({ read: async () => ({ status: "ready", revision: "1", values: documentWith(true) }) })(turn("parent"), { paseo: sub.paseo });
    expect(sub.append).not.toHaveBeenCalled();
  });
});
