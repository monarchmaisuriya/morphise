import { describe, expect, it, vi } from "vitest";

vi.mock("./chat-rows", () => ({ RecapRow: () => null, recapRowSchema: {} }));
vi.mock("./task-surfaces", () => ({ createReminderRow: () => () => null }));
vi.mock("./polish/rows/register", () => ({
  registerRowRenderers: (client: { addTimelineRenderer(r: { kind: string }): () => void }) => {
    const stop = client.addTimelineRenderer({ kind: "polish-tool" });
    return () => stop();
  },
}));

const { registerRenderers } = await import("./renderers");

function fakeClient() {
  const renderers: string[] = [];
  const client = { addTimelineRenderer: (r: { kind: string }) => (renderers.push(r.kind), () => renderers.splice(renderers.indexOf(r.kind), 1)) };
  return { client: client as unknown as Parameters<typeof registerRenderers>[0], renderers };
}

describe("row renderers", () => {
  it("registers the turn recap, reminder and chat row renderers synchronously, before any setting arrives", () => {
    const fake = fakeClient();
    const stop = registerRenderers(fake.client, { tasks: {} as never, steps: () => ({}) as never });
    expect([...fake.renderers].sort()).toEqual(["polish-tool", "reminder", "turn-recap"]);
    stop();
    expect(fake.renderers).toEqual([]);
  });
});
