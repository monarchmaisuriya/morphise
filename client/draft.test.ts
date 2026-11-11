import { describe, expect, it } from "vitest";
import { documentSchema } from "../shared/document";
import { createDraftStore } from "./draft";

const saved = { document: documentSchema.parse({}), revision: "r1" };

describe("draft store", () => {
  it("shows the saved document until something is edited", () => {
    const store = createDraftStore();
    expect(store.working(saved)).toEqual(saved.document);
    expect(store.dirty()).toBe(false);
  });

  it("starts the draft from the saved document and the revision it was loaded at, without touching the saved copy", () => {
    const store = createDraftStore();
    store.edit(saved, (document) => {
      document.layouts[0].profile.sidebar.view.counts = false;
    });
    expect(store.working(saved).layouts[0].profile.sidebar.view.counts).toBe(false);
    expect(saved.document.layouts[0].profile.sidebar.view.counts).toBe(true);
    expect(store.get().draft?.revision).toBe("r1");
    store.edit({ ...saved, revision: "r2" }, (document) => void (document.activeLayout = "default"));
    expect(store.get().draft?.revision).toBe("r1");
  });

  it("discards the draft and bumps the generation so inputs show the saved values again", () => {
    const store = createDraftStore();
    store.edit(saved, (document) => void (document.prompts = []));
    const generation = store.get().generation;
    store.discard();
    expect(store.dirty()).toBe(false);
    expect(store.get().generation).toBe(generation + 1);
  });

  it("lists each problem by its path in the document", () => {
    const store = createDraftStore();
    store.edit(saved, (document) => {
      document.layouts[0].profile.sidebar.view.rowLimit.rows = 0;
      document.activeLayout = "missing";
    });
    expect([...store.issues(saved)]).toEqual([
      ["layouts.0.profile.sidebar.view.rowLimit.rows", "Too small: expected number to be >=3"],
      ["activeLayout", 'No layout has the id "missing"'],
    ]);
  });

  it("edits the active layout unless another one is chosen, and falls back when the chosen one goes away", () => {
    const store = createDraftStore();
    const twoLayouts = { document: documentSchema.parse({ activeLayout: "b", layouts: [{ id: "a", name: "A" }, { id: "b", name: "B" }] }), revision: "r1" };
    expect(store.editingIndex(twoLayouts)).toBe(1);
    store.chooseLayout("a");
    expect(store.editingIndex(twoLayouts)).toBe(0);
    store.chooseLayout("gone");
    expect(store.editingIndex(twoLayouts)).toBe(1);
  });
});
