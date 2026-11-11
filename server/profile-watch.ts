import type { PluginSettings, PluginSettingsState } from "@getpaseo/plugin/server";
import type { profileSchema } from "../shared/profile";
import type { ProfileEvent } from "../shared/watch";

export type ProfileSettings = Pick<PluginSettings<typeof profileSchema>, "read" | "subscribe">;

interface WatchContext {
  push(event: ProfileEvent): Promise<void>;
  signal: AbortSignal;
}

function toEvent(state: PluginSettingsState<typeof profileSchema>): ProfileEvent {
  return state.status === "ready"
    ? { status: "ready", revision: state.revision, profile: state.values }
    : { status: "invalid", revision: state.revision, error: state.error };
}

// Paseo does not replay events after a reconnect, so every subscriber starts with the stored
// profile. Listening starts before the read, and a save seen first wins over the older read.
export function watchProfile(settings: ProfileSettings) {
  return (_input: unknown, { push, signal }: WatchContext): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let sawSave = false;
      const stopListening = settings.subscribe((state) => {
        sawSave = true;
        void push(toEvent(state));
      });
      const finish = () => {
        stopListening();
        resolve();
      };
      signal.addEventListener("abort", finish, { once: true });
      settings.read().then(
        (state) => {
          if (!sawSave && !signal.aborted) void push(toEvent(state));
        },
        (error: unknown) => {
          signal.removeEventListener("abort", finish);
          stopListening();
          reject(error);
        },
      );
    });
}
