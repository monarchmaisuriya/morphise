import { documentSchema, type ProfileDocument } from "../shared/document";
import { createValueStore } from "./profile-store";

// One in-memory draft of the whole settings document, shared by every settings tab, with the
// revision it was loaded at. Saving with that revision fails if another app saved in between,
// so neither change is lost silently. Settings save themselves (useAutoSave); this store holds
// the one lock, so two open tabs never send the same draft twice.

export interface Saved {
  document: ProfileDocument;
  revision: string;
}

export interface Draft {
  document: ProfileDocument;
  // null: edited during this app's own save, so it builds on the revision that save produced.
  revision: string | null;
}

interface DraftState {
  draft: Draft | null;
  // Which layout the profile tabs edit; null means the active one.
  editing: string | null;
  // Bumped when the draft is replaced or dropped, so uncontrolled inputs re-read their value.
  generation: number;
  // Why the draft cannot save, when another app saved on top of this app's own save.
  conflict: string | null;
}

// Settings documents are plain JSON, so a JSON copy is a full, independent copy.
const copy = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

// JSON with sorted keys: the stored document comes back in schema key order, which can differ
// from the order the draft was written in.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

export function createDraftStore() {
  const store = createValueStore<DraftState>({ draft: null, editing: null, generation: 0, conflict: null });
  // The draft being saved right now, or null.
  let sending: Draft | null = null;
  // The last document this app saved, and the input version (see inputVersion).
  let lastSent = "";
  let seen = { revision: "", version: 0 };

  function working(saved: Saved): ProfileDocument {
    return store.get().draft?.document ?? saved.document;
  }

  return {
    ...store,
    working,
    dirty: () => store.get().draft !== null,
    edit(saved: Saved, change: (document: ProfileDocument) => void) {
      const base = store.get().draft ?? { document: copy(saved.document), revision: saved.revision };
      const document = copy(base.document);
      change(document);
      store.set({ ...store.get(), draft: { document, revision: base.revision } });
    },
    // Replaces the whole draft, for the JSON editor.
    replace(saved: Saved, document: ProfileDocument) {
      const revision = store.get().draft?.revision ?? saved.revision;
      store.set({ ...store.get(), draft: { document: copy(document), revision } });
    },
    discard() {
      store.set({ ...store.get(), draft: null, generation: store.get().generation + 1, conflict: null });
    },
    // Starts a save: the draft and the revision to send it against, or null when there is none,
    // a save is already running, or it conflicts. A draft edited during this app's own save builds
    // on what that save stored, so it saves only while the stored document is still that one.
    take(saved: Saved): { document: ProfileDocument; revision: string } | null {
      const draft = store.get().draft;
      if (sending || !draft) return null;
      if (draft.revision === null && canonical(saved.document) !== lastSent) {
        const conflict = "another app saved these settings while this app was saving";
        if (store.get().conflict !== conflict) store.set({ ...store.get(), conflict });
        return null;
      }
      if (store.get().conflict !== null) store.set({ ...store.get(), conflict: null });
      sending = draft;
      return { document: draft.document, revision: draft.revision ?? saved.revision };
    },
    // Ends the save `take` started. A failed save keeps the draft as it is (the error is shown);
    // a draft edited while saving stays, and its next save builds on the revision just saved.
    finish(ok: boolean) {
      const sent = sending;
      sending = null;
      if (ok && sent) lastSent = canonical(sent.document);
      const current = store.get().draft;
      if (!ok || !sent || !current) return;
      store.set({ ...store.get(), draft: current === sent ? null : { document: current.document, revision: null } });
    },
    // Goes up when the stored settings change for a reason other than this app's own save
    // (another app, another window), so inputs that keep their own text show the new values.
    // This app's saves leave it alone, so an input being typed in keeps its focus.
    inputVersion(saved: Saved): number {
      if (saved.revision !== seen.revision) {
        const own = seen.revision === "" || canonical(saved.document) === lastSent;
        seen = { revision: saved.revision, version: seen.version + (own ? 0 : 1) };
      }
      return seen.version;
    },
    issues(saved: Saved): Map<string, string> {
      const result = documentSchema.safeParse(working(saved));
      return new Map(result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
    },
    chooseLayout(id: string) {
      store.set({ ...store.get(), editing: id, generation: store.get().generation + 1 });
    },
    // Back to editing the active layout, for links that open settings for what the user sees now.
    editActiveLayout() {
      if (store.get().editing === null) return;
      store.set({ ...store.get(), editing: null, generation: store.get().generation + 1 });
    },
    editingIndex(saved: Saved): number {
      const document = working(saved);
      const chosen = document.layouts.findIndex((layout) => layout.id === store.get().editing);
      if (chosen >= 0) return chosen;
      return Math.max(0, document.layouts.findIndex((layout) => layout.id === document.activeLayout));
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
