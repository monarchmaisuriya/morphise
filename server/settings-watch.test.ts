import { describe, expect, it } from "vitest";
import { EMPTY_DOCUMENT } from "../shared/document";
import { EMPTY_PROFILE } from "../shared/profile";
import type { ProfileEvent } from "../shared/watch";
import { watchSettings, type WatchableSettings } from "./settings-watch";

type Settings = WatchableSettings<typeof EMPTY_DOCUMENT>;
type State = Awaited<ReturnType<Settings["read"]>>;

function fakeSettings(initial: State) {
  const listeners = new Set<(state: State) => void>();
  let release: (state: State) => void = () => {};
  let deferRead = false;
  const settings: Settings = {
    read: () => (deferRead ? new Promise<State>((resolve) => (release = resolve)) : Promise.resolve(initial)),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    settings,
    save: (state: State) => listeners.forEach((listener) => listener(state)),
    listenerCount: () => listeners.size,
    deferNextRead: () => (deferRead = true),
    resolveRead: (state: State) => release(state),
  };
}

function subscriber() {
  const events: ProfileEvent[] = [];
  const controller = new AbortController();
  return {
    events,
    controller,
    context: { push: async (event: ProfileEvent) => void events.push(event), signal: controller.signal },
  };
}

const ready = (revision: string, name = "x") => ({
  status: "ready" as const,
  revision,
  values: {
    ...EMPTY_DOCUMENT,
    layouts: [{ id: "default", name: "Default", profile: { ...EMPTY_PROFILE, commandCenter: [{ id: name, title: name, icon: "Box", action: { kind: "open-editor" as const } }] } }],
  },
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("watchSettings", () => {
  it("sends the stored profile as soon as a client subscribes", async () => {
    const fake = fakeSettings(ready("r1"));
    const client = subscriber();
    void watchSettings(fake.settings)({}, client.context);
    await flush();
    expect(client.events).toEqual([{ status: "ready", revision: "r1", document: ready("r1").values }]);
  });

  it("sends every later save", async () => {
    const fake = fakeSettings(ready("r1"));
    const client = subscriber();
    void watchSettings(fake.settings)({}, client.context);
    await flush();
    fake.save(ready("r2", "y"));
    expect(client.events.map((event) => event.revision)).toEqual(["r1", "r2"]);
  });

  it("does not let a slow first read overwrite a newer save", async () => {
    const fake = fakeSettings(ready("r1"));
    fake.deferNextRead();
    const client = subscriber();
    void watchSettings(fake.settings)({}, client.context);
    fake.save(ready("r2", "y"));
    fake.resolveRead(ready("r1"));
    await flush();
    expect(client.events.map((event) => event.revision)).toEqual(["r2"]);
  });

  it("passes on a stored document that no longer validates", async () => {
    const fake = fakeSettings({ status: "invalid", revision: "r9", error: "theme: Required" });
    const client = subscriber();
    void watchSettings(fake.settings)({}, client.context);
    await flush();
    expect(client.events).toEqual([{ status: "invalid", revision: "r9", error: "theme: Required" }]);
  });

  it("stops listening when the client leaves", async () => {
    const fake = fakeSettings(ready("r1"));
    const client = subscriber();
    const running = watchSettings(fake.settings)({}, client.context);
    await flush();
    expect(fake.listenerCount()).toBe(1);
    client.controller.abort();
    await running;
    expect(fake.listenerCount()).toBe(0);
  });

  it("closes the subscription with the error when the first read fails", async () => {
    const fake = fakeSettings(ready("r1"));
    fake.settings.read = () => Promise.reject(new Error("settings file unreadable"));
    const client = subscriber();
    await expect(watchSettings(fake.settings)({}, client.context)).rejects.toThrow("settings file unreadable");
    expect(fake.listenerCount()).toBe(0);
  });
});
