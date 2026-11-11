import { describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, profileSchema } from "../shared/profile";
import { createProfileStore, profileOf } from "./profile-store";

const saved = profileSchema.parse({ timeline: { hide: ["reasoning"] } });

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
    store.set({ event: { status: "ready", revision: "r1", profile: saved }, connectionError: null });
    leave();
    store.set({ event: { status: "ready", revision: "r2", profile: saved }, connectionError: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(profileOf(store.get())).toEqual(saved);
  });

  it("applies nothing while the stored profile is invalid", () => {
    const store = createProfileStore();
    store.set({ event: { status: "invalid", revision: "r2", error: "theme: Required" }, connectionError: null });
    expect(profileOf(store.get())).toEqual(EMPTY_PROFILE);
  });

  it("keeps the last received profile while the connection is broken", () => {
    const store = createProfileStore();
    store.set({ event: { status: "ready", revision: "r1", profile: saved }, connectionError: "Plugin stopped: morphise" });
    expect(profileOf(store.get())).toEqual(saved);
  });
});
