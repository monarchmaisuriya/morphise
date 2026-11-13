import { describe, expect, it, vi } from "vitest";
import type { Phase } from "../../../shared/run/row";
import { createInlineRuns, panelOutput, panelStatus } from "./panel-model";

const T0 = 1_700_000_000_000;

describe("panelStatus", () => {
  it("says how a run stands, with its time, and a tone for its colour", () => {
    const cases: Array<[Phase, string, string]> = [
      [{ kind: "running", startedAt: T0, stopRequestedAt: null }, "Running · 3.0s", "running"],
      [{ kind: "running", startedAt: T0, stopRequestedAt: T0 + 1000 }, "Stopping · 3.0s", "running"],
      [{ kind: "ok", startedAt: T0, endedAt: T0 + 1200 }, "Done · 1.2s", "ok"],
      [{ kind: "failed", startedAt: T0, endedAt: T0 + 500, exitCode: 2, signal: null, message: null }, "Exit 2 · 0.5s", "error"],
      [{ kind: "failed", startedAt: T0, endedAt: T0 + 500, exitCode: null, signal: "SIGKILL", message: null }, "Killed (SIGKILL) · 0.5s", "error"],
      [{ kind: "failed", startedAt: T0, endedAt: T0, exitCode: null, signal: null, message: "no shell" }, "Couldn't start: no shell", "error"],
      [{ kind: "stopped", startedAt: T0, endedAt: T0 + 6600, exitCode: null, signal: "SIGINT" }, "Stopped · 6.6s", "muted"],
      [{ kind: "interrupted", startedAt: T0, endedAt: T0 + 100 }, "Interrupted", "muted"],
    ];
    for (const [phase, text, tone] of cases) expect(panelStatus(phase, T0 + 3000), phase.kind).toEqual({ text, tone });
  });

  it("calls a run the daemon no longer knows interrupted", () => {
    expect(panelStatus(null, T0)).toEqual({ text: "Interrupted", tone: "muted" });
  });
});

describe("panelOutput", () => {
  it("joins plain and coloured lines into text", () => {
    expect(panelOutput(["plain", [["red ", "31"], ["bold", "1"]]])).toBe("plain\nred bold");
    expect(panelOutput([])).toBe("");
  });
});

describe("createInlineRuns", () => {
  it("tells listeners when a run starts or stops showing under its block", () => {
    const runs = createInlineRuns();
    const listener = vi.fn();
    const stop = runs.subscribe(listener);
    runs.show("r1");
    expect(runs.has("r1")).toBe(true);
    runs.show("r1");
    runs.hide("r1");
    expect(runs.has("r1")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("lets the card ask the panel to close, so its output shows in the card again", () => {
    const runs = createInlineRuns();
    const close = vi.fn(() => runs.hide("r1"));
    runs.show("r1", close);
    runs.release("r1");
    expect(close).toHaveBeenCalledOnce();
    expect(runs.has("r1")).toBe(false);
    runs.release("r1");
    expect(close).toHaveBeenCalledOnce();
  });
});
