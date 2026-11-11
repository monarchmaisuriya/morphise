import type { ValueStore } from "./profile-store";

export type StreamHandle = (() => void) & { readonly ready: Promise<void> };

export type OpenStream<Event> = (onEvent: (event: Event) => void, onClosed: (error?: unknown) => void) => StreamHandle;

// The last event a stream sent, kept apart from the connection's health.
export type StreamStore<Event> = ValueStore<{ event: Event | null; connectionError: string | null }>;

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "The daemon closed the profile stream";
}

// Paseo does not reopen a stream that plugin code opened itself after the daemon restarts.
// The caller reopens it on each workspace snapshot (sent after every reconnect) and when the
// user asks. Replacing even an open-looking stream means a close notice that arrives late
// cannot leave the client without updates. Only the current stream may write to the store: a
// stream this code released reports "Subscription released", which is not a failure.
export function connectStream<Event>(openStream: OpenStream<Event>, store: StreamStore<Event>) {
  let release: (() => void) | null = null;

  function open() {
    const handle = openStream(
      (event) => {
        if (release === handle) store.set({ event, connectionError: null });
      },
      (error) => fail(handle, error),
    );
    release = handle;
    handle.ready.catch((error: unknown) => fail(handle, error));
  }

  function fail(handle: StreamHandle, error: unknown) {
    if (release === handle) store.set({ ...store.get(), connectionError: describe(error) });
  }

  open();
  return {
    reopen() {
      if (!release) return;
      release();
      open();
    },
    stop() {
      release?.();
      release = null;
    },
  };
}
