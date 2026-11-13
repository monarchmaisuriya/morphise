import { useEffect, useRef } from "react";
import type { ProfileDocument } from "../../shared/document";
import type { DraftStore } from "../draft";
import { useValue } from "../profile-store";

// How long after the last edit the settings save; long enough that typing a word saves once.
export const AUTOSAVE_DELAY_MS = 600;
// How soon a save that found another one running tries again.
const AUTOSAVE_RETRY_MS = 300;

interface Saver {
  status: string;
  revision?: string;
  values?: ProfileDocument;
  save(values: ProfileDocument, revision: string): Promise<boolean>;
}

// Saves the shared settings draft shortly after each edit, once it has no problems. Leaving the
// screen saves a waiting edit at once instead of dropping it. A failed save is not retried: the
// draft stays, the screen shows the error, and the next edit tries again.
export function useAutoSave(drafts: DraftStore, settings: Saver, valid: boolean) {
  const { draft } = useValue(drafts);
  const latest = useRef(settings);
  latest.current = settings;
  // The save waiting for its delay, if any.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; run(): void } | null>(null);
  // On leaving, a waiting save runs at once. Declared first: React runs a component's cleanups in
  // order, so this reads the waiting save before the effect below cancels it.
  const flushOnLeave = useRef<() => void>(() => {});
  flushOnLeave.current = () => {
    const waiting = pending.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    waiting.run();
  };
  useEffect(() => () => flushOnLeave.current(), []);
  useEffect(() => {
    if (!draft || !valid || settings.status !== "ready") return;
    const run = () => {
      pending.current = null;
      const current = latest.current;
      if (current.status !== "ready" || !current.revision || !current.values) return;
      const sending = drafts.take({ document: current.values, revision: current.revision });
      if (!sending) {
        // Another save is running: send this draft right after it, also once the screen has closed,
        // so an edit never waits for the next visit (and then overwrites newer changes).
        if (drafts.get().draft && !drafts.get().conflict) pending.current = { timer: setTimeout(run, AUTOSAVE_RETRY_MS), run };
        return;
      }
      void current.save(sending.document, sending.revision).then((ok) => drafts.finish(ok));
    };
    pending.current = { timer: setTimeout(run, AUTOSAVE_DELAY_MS), run };
    return () => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
    };
  }, [drafts, draft, valid, settings.status]);
}
