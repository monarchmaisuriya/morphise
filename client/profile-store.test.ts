import { describe, expect, it, vi } from "vitest";
import { documentSchema } from "../shared/document";
import { EMPTY_PROFILE, profileSchema } from "../shared/profile";
import { createProfileStore, profileOf } from "./profile-store";

const saved = profileSchema.parse({ timeline: { hide: ["reasoning"] } });
const document = documentSchema.parse({ layouts: [{ id: "default", name: "Default", profile: saved }] });

describe("profile store", () => {
  it("starts with nothing received, which applies nothing", () => {
    const store = createProfileStore();
    expect(store.get()).toEqual({ event: null, connectionError: null });
    expect(profileOf(store.get())).toEqual(EMPTY_PROFILE);
  });

  it("tells listeners about each new state and stops after they leave", () => {
    const store = createProfileStore();
    const listener = vi.fn();
    const leave = store.subscribe(listener);
    store.set({ event: { status: "ready", revision: "r1", document }, connectionError: null });
    leave();
    store.set({ event: { status: "ready", revision: "r2", document }, connectionError: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(profileOf(store.get())).toEqual(saved);
  });

  it("applies nothing while the stored profile is invalid", () => {
    const store = createProfileStore();
    store.set({ event: { status: "invalid", revision: "r2", error: "theme: Required" }, connectionError: null });
    expect(profileOf(store.get())).toEqual(EMPTY_PROFILE);
  });

  it("applies the active layout's profile and follows a switch to another layout", () => {
    const store = createProfileStore();
    const focus = profileSchema.parse({ timeline: { hide: ["todo"] } });
    const twoLayouts = documentSchema.parse({
      activeLayout: "default",
      layouts: [
        { id: "default", name: "Default", profile: saved },
        { id: "focus", name: "Focus", profile: focus },
      ],
    });
    store.set({ event: { status: "ready", revision: "r1", document: twoLayouts }, connectionError: null });
    expect(profileOf(store.get())).toEqual(saved);
    store.set({ event: { status: "ready", revision: "r2", document: { ...twoLayouts, activeLayout: "focus" } }, connectionError: null });
    expect(profileOf(store.get())).toEqual(focus);
  });

  it("keeps the last received profile while the connection is broken", () => {
    const store = createProfileStore();
    store.set({ event: { status: "ready", revision: "r1", document }, connectionError: "Plugin stopped: morphise" });
    expect(profileOf(store.get())).toEqual(saved);
  });
});
