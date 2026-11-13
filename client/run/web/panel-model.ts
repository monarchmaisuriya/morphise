// What the output panel under a code block shows (web and desktop), and which runs have one, kept apart
// from the page so it can be tested. The card in the chat stays the run's record; while this window
// shows a run's panel, the card shrinks to one line (client/run/run-row.tsx reads `inlineRuns`).
import type { Line, Phase } from "../../../shared/run/row";
import { formatDuration } from "../../../shared/run/view";

export type PanelTone = "running" | "ok" | "error" | "muted";

/** The panel's status line. `null` is a run the daemon no longer knows (the plugin restarted). */
export function panelStatus(phase: Phase | null, now: number): { text: string; tone: PanelTone } {
  if (!phase) return { text: "Interrupted", tone: "muted" };
  if (phase.kind === "running") return { text: `${phase.stopRequestedAt === null ? "Running" : "Stopping"} · ${formatDuration(now - phase.startedAt)}`, tone: "running" };
  const took = formatDuration(phase.endedAt - phase.startedAt);
  if (phase.kind === "ok") return { text: `Done · ${took}`, tone: "ok" };
  if (phase.kind === "stopped") return { text: `Stopped · ${took}`, tone: "muted" };
  if (phase.kind === "interrupted") return { text: "Interrupted", tone: "muted" };
  if (phase.message) return { text: `Couldn't start: ${phase.message}`, tone: "error" };
  return { text: `${phase.exitCode !== null ? `Exit ${phase.exitCode}` : `Killed (${phase.signal ?? "signal"})`} · ${took}`, tone: "error" };
}

/** The output as plain text; colours stay in the card. */
export function panelOutput(lines: readonly Line[]): string {
  return lines.map((line) => (typeof line === "string" ? line : line.map(([text]) => text).join(""))).join("\n");
}

export interface InlineRuns {
  /** A panel shows the run; `close` closes it (the card's Show here). */
  show(runId: string, close?: () => void): void;
  hide(runId: string): void;
  has(runId: string): boolean;
  /** Asks the run's panel to close. */
  release(runId: string): void;
  subscribe(listener: () => void): () => void;
}

export function createInlineRuns(): InlineRuns {
  const shown = new Map<string, (() => void) | undefined>();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  return {
    show(runId, close) {
      const known = shown.has(runId);
      shown.set(runId, close);
      if (!known) changed();
    },
    hide: (runId) => void (shown.delete(runId) && changed()),
    has: (runId) => shown.has(runId),
    release: (runId) => shown.get(runId)?.(),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** This window's runs that show their output under a code block. */
export const inlineRuns = createInlineRuns();
