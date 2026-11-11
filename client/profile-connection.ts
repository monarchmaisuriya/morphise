import type { ProfileEvent } from "../shared/watch";
import type { ProfileStore } from "./profile-store";

export type ProfileStreamHandle = (() => void) & { readonly ready: Promise<void> };

export type OpenProfileStream = (
  onEvent: (event: ProfileEvent) => void,
  onClosed: (error?: unknown) => void,
) => ProfileStreamHandle;

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "The daemon closed the profile stream";
}

// Paseo does not reopen a stream that plugin code opened itself after the daemon restarts.
// The caller reopens it on each workspace snapshot (sent after every reconnect) and when the
// user asks. Replacing even an open-looking stream means a close notice that arrives late
// cannot leave the client without updates. Only the current stream may write to the store: a
// stream this code released reports "Subscription released", which is not a failure.
export function connectProfile(openStream: OpenProfileStream, store: ProfileStore) {
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

  function fail(handle: ProfileStreamHandle, error: unknown) {
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
