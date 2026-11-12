import { useEffect, useRef } from "react";
import type { ProfileDocument } from "../../shared/document";
import type { DraftStore } from "../draft";
import { useValue } from "../profile-store";

// How long after the last edit the settings save; long enough that typing a word saves once.
export const AUTOSAVE_DELAY_MS = 600;

interface Saver {
  status: string;
  revision?: string;
  save(values: ProfileDocument, revision: string): Promise<boolean>;
}

// Saves the shared settings draft shortly after each edit, once it has no problems. A failed
// save is not retried: the draft stays, the screen shows the error, and the next edit tries again.
export function useAutoSave(drafts: DraftStore, settings: Saver, valid: boolean) {
  const { draft } = useValue(drafts);
  const latest = useRef(settings);
  latest.current = settings;
  useEffect(() => {
    if (!draft || !valid || settings.status !== "ready") return;
    const timer = setTimeout(() => {
      const current = latest.current;
      if (current.status !== "ready" || !current.revision) return;
      const sending = drafts.take();
      if (!sending) return;
      const revision = sending.revision ?? current.revision;
      void current.save(sending.document, revision).then((ok) => drafts.finish(ok));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [drafts, draft, valid, settings.status]);
}
