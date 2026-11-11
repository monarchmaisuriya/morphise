import { describe, expect, it } from "vitest";
import { cardMode, latestSteps, listedSteps, readSteps, stepCounts, stepsOptions } from "./steps";

const todo = (items: unknown[]) => ({ type: "todo", items });

describe("steps", () => {
  it("reads a to-do item, with the doing wording for the step in progress", () => {
    expect(
      readSteps(
        todo([
          { text: "Write tests", status: "completed", completed: true },
          { text: "Fix bug", status: "in_progress", completed: false, activeForm: "Fixing the bug" },
          { text: "Ship", completed: false },
          { text: "Old style", completed: true },
          { nope: 1 },
        ]),
      ),
    ).toEqual([
      { text: "Write tests", status: "completed" },
      { text: "Fixing the bug", status: "in_progress" },
      { text: "Ship", status: "pending" },
      { text: "Old style", status: "completed" },
    ]);
    expect(readSteps({ type: "assistant_message", text: "hi" })).toBeNull();
  });

  it("finds the latest plan in a page of timeline entries", () => {
    const entries = [{ item: todo([{ text: "a", completed: false }]) }, { item: { type: "assistant_message" } }, { item: todo([{ text: "b", completed: true }]) }, { item: { type: "reasoning" } }];
    expect(latestSteps(entries)).toEqual([{ text: "b", status: "completed" }]);
    expect(latestSteps([{ item: { type: "user_message" } }])).toBeNull();
  });

  it("counts and decides when the card shows", () => {
    const plan = [
      { text: "a", status: "completed" as const },
      { text: "b", status: "pending" as const },
    ];
    expect(stepCounts(plan)).toEqual({ done: 1, total: 2 });
    expect(cardMode(plan, false)).toBe("plan");
    const finished = plan.map((step) => ({ ...step, status: "completed" as const }));
    expect(cardMode(finished, true)).toBe("done");
    expect(cardMode(finished, false)).toBe("hidden");
    expect(cardMode([], true)).toBe("hidden");
    expect(cardMode(null, true)).toBe("hidden");
  });
});

describe("steps card options", () => {
  const step = (text: string, status: "pending" | "in_progress" | "completed") => ({ text, status });
  const finished = [step("a", "completed")];

  it("keeps a finished plan when shown always", () => {
    expect(cardMode(finished, false, "always")).toBe("done");
    expect(cardMode(finished, false, "unfinished")).toBe("hidden");
  });

  it("fills unset options with the defaults", () => {
    expect(stepsOptions(undefined)).toEqual({ show: "unfinished", doneSeconds: 8, position: "bottom", scope: "open", startFolded: false, hideCompleted: false, maxSteps: null, progress: true });
    expect(stepsOptions({ doneSeconds: 0, position: "top" })).toMatchObject({ doneSeconds: 0, position: "top" });
  });

  it("hides finished steps and keeps the current step in view past the limit", () => {
    const plan = ["1", "2", "3", "4", "5", "6"].map((text, index) => step(text, index < 4 ? "completed" : index === 4 ? "in_progress" : "pending"));
    expect(listedSteps(plan, { hideCompleted: true, maxSteps: null }).rows.map((item) => item.text)).toEqual(["5", "6"]);
    const capped = listedSteps(plan, { hideCompleted: false, maxSteps: 3 });
    expect(capped.rows.map((item) => item.text)).toEqual(["4", "5", "6"]);
    expect(capped.more).toBe(3);
    expect(listedSteps(plan, { hideCompleted: false, maxSteps: null }).more).toBe(0);
  });
});
