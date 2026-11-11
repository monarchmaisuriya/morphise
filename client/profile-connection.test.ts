import { describe, expect, it } from "vitest";
import { EMPTY_DOCUMENT } from "../shared/document";
import type { ProfileEvent } from "../shared/watch";
import { connectProfile, type OpenProfileStream, type ProfileStreamHandle } from "./profile-connection";
import { createProfileStore } from "./profile-store";

interface FakeStream {
  emit(event: ProfileEvent): void;
  close(error?: unknown): void;
  released: boolean;
}

function fakeDaemon(options: { failOpen?: string } = {}) {
  const streams: FakeStream[] = [];
  const open: OpenProfileStream = (onEvent, onClosed) => {
    const stream: FakeStream = { emit: onEvent, close: onClosed, released: false };
    streams.push(stream);
    const handle = (() => void (stream.released = true)) as ProfileStreamHandle;
    Object.assign(handle, {
      ready: options.failOpen ? Promise.reject(new Error(options.failOpen)) : Promise.resolve(),
    });
    return handle;
  };
  return { open, streams };
}

const ready = (revision: string): ProfileEvent => ({ status: "ready", revision, document: EMPTY_DOCUMENT });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("connectProfile", () => {
  it("opens one stream and puts its events in the store", () => {
    const daemon = fakeDaemon();
    const store = createProfileStore();
    connectProfile(daemon.open, store);
    daemon.streams[0].emit(ready("r1"));
    expect(daemon.streams).toHaveLength(1);
    expect(store.get()).toEqual({ event: ready("r1"), connectionError: null });
  });

  it("keeps the last profile and records why when the daemon closes the stream", () => {
    const daemon = fakeDaemon();
    const store = createProfileStore();
    connectProfile(daemon.open, store);
    daemon.streams[0].emit(ready("r1"));
    daemon.streams[0].close(new Error("Plugin stopped: morphise"));
    expect(store.get()).toEqual({ event: ready("r1"), connectionError: "Plugin stopped: morphise" });
  });

  it("reports a stream the daemon refused to open", async () => {
    const daemon = fakeDaemon({ failOpen: "Update the host to use subscriptions" });
    const store = createProfileStore();
    connectProfile(daemon.open, store);
    await flush();
    expect(store.get()).toEqual({ event: null, connectionError: "Update the host to use subscriptions" });
  });

  it("reopens a closed stream and clears the error once an event arrives", () => {
    const daemon = fakeDaemon();
    const store = createProfileStore();
    const connection = connectProfile(daemon.open, store);
    daemon.streams[0].close(new Error("Plugin stopped: morphise"));
    connection.reopen();
    daemon.streams[1].emit(ready("r2"));
    expect(daemon.streams).toHaveLength(2);
    expect(store.get()).toEqual({ event: ready("r2"), connectionError: null });
  });

  it("replaces a stream that still looks open, so a late close notice cannot leave it stuck", () => {
    const daemon = fakeDaemon();
    const store = createProfileStore();
    const connection = connectProfile(daemon.open, store);
    connection.reopen();
    expect(daemon.streams[0].released).toBe(true);
    expect(daemon.streams).toHaveLength(2);
  });

  it("ignores a stream it replaced, even when that stream reports a failure afterwards", () => {
    const daemon = fakeDaemon();
    const store = createProfileStore();
    const connection = connectProfile(daemon.open, store);
    daemon.streams[0].emit(ready("r1"));
    connection.reopen();
    daemon.streams[0].close(new Error("Subscription released"));
    daemon.streams[0].emit(ready("stale"));
    expect(store.get()).toEqual({ event: ready("r1"), connectionError: null });
  });

  it("does not report a stream whose opening was cut short by stop", async () => {
    const daemon = fakeDaemon({ failOpen: "Subscription released" });
    const store = createProfileStore();
    const connection = connectProfile(daemon.open, store);
    connection.stop();
    await flush();
    expect(store.get()).toEqual({ event: null, connectionError: null });
  });

  it("releases the stream on stop and opens nothing afterwards", () => {
    const daemon = fakeDaemon();
    const store = createProfileStore();
    const connection = connectProfile(daemon.open, store);
    connection.stop();
    connection.reopen();
    expect(daemon.streams).toHaveLength(1);
    expect(daemon.streams[0].released).toBe(true);
  });
});
