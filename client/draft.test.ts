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
    store.chooseLayout("a");
    store.editActiveLayout();
    expect(store.editingIndex(twoLayouts)).toBe(1);
  });

  it("sends one draft at a time, keeps edits made while saving, and builds them on the saved revision", () => {
    const store = createDraftStore();
    store.edit(saved, (document) => void (document.layouts[0].profile.sidebar.view.counts = false));
    const sent = store.take(saved);
    expect(sent?.revision).toBe("r1");
    expect(store.take(saved)).toBeNull();
    store.edit(saved, (document) => void (document.activeLayout = "default"));
    store.finish(true);
    expect(store.get().draft?.revision).toBeNull();
    const next = store.take({ document: sent!.document, revision: "r2" });
    expect(next?.revision).toBe("r2");
    expect(next?.document.activeLayout).toBe("default");
    store.finish(true);
    expect(store.dirty()).toBe(false);
  });

  it("refuses an edit made during its own save when another app saved after that save, and keeps it", () => {
    const store = createDraftStore();
    store.edit(saved, (document) => void (document.layouts[0].profile.sidebar.view.counts = false));
    store.take(saved);
    store.edit(saved, (document) => void (document.activeLayout = "default"));
    store.finish(true);
    // Another app saved on top of this app's save: the stored document is not the one sent.
    const theirs = { document: documentSchema.parse({}), revision: "r3" };
    expect(store.take(theirs)).toBeNull();
    expect(store.get().conflict).not.toBeNull();
    expect(store.get().draft?.document.activeLayout).toBe("default");
    store.discard();
    expect(store.get().conflict).toBeNull();
  });

  it("keeps the draft when a save fails", () => {
    const store = createDraftStore();
    store.edit(saved, (document) => void (document.prompts = []));
    const draft = store.get().draft;
    store.take(saved);
    store.finish(false);
    expect(store.get().draft).toBe(draft);
  });

  it("changes the input version for another app's save, not for its own", () => {
    const store = createDraftStore();
    expect(store.inputVersion(saved)).toBe(0);
    store.edit(saved, (document) => void (document.layouts[0].profile.sidebar.view.counts = false));
    const sent = store.take(saved);
    store.finish(true);
    // The stored copy comes back with its keys in schema order.
    const reverse = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
    expect(store.inputVersion({ document: reverse(sent?.document) as typeof saved.document, revision: "r2" })).toBe(0);
    expect(store.inputVersion({ document: saved.document, revision: "r3" })).toBe(1);
  });
});
