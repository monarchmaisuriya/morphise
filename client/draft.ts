import { documentSchema, type ProfileDocument } from "../shared/document";
import { createValueStore } from "./profile-store";

// One in-memory draft of the whole settings document, shared by every settings tab, with the
// revision it was loaded at. Saving with that revision fails if another app saved in between,
// so neither change is lost silently.

export interface Saved {
  document: ProfileDocument;
  revision: string;
}

interface DraftState {
  draft: Saved | null;
  // Which layout the profile tabs edit; null means the active one.
  editing: string | null;
  // Bumped when the draft is replaced or dropped, so uncontrolled inputs re-read their value.
  generation: number;
}

// Settings documents are plain JSON, so a JSON copy is a full, independent copy.
const copy = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

export function createDraftStore() {
  const store = createValueStore<DraftState>({ draft: null, editing: null, generation: 0 });

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
      store.set({ ...store.get(), draft: null, generation: store.get().generation + 1 });
    },
    // After a successful save the saved document is the draft.
    saved() {
      store.set({ ...store.get(), draft: null });
    },
    issues(saved: Saved): Map<string, string> {
      const result = documentSchema.safeParse(working(saved));
      return new Map(result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
    },
    chooseLayout(id: string) {
      store.set({ ...store.get(), editing: id, generation: store.get().generation + 1 });
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
