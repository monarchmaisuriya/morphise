// Streams one settings document to an app: the stored document first, then every saved change,
// for as long as the app listens. Paseo does not replay events after a reconnect, so every
// subscriber starts with the stored document. Listening starts before the read, and a save seen
// first wins over the older read.

export type SettingsState<Value> = { status: "ready"; revision: string; values: Value } | { status: "invalid"; revision: string; error: string };

export type SettingsEvent<Value> = { status: "ready"; revision: string; document: Value } | { status: "invalid"; revision: string; error: string };

export interface WatchableSettings<Value> {
  read(): Promise<SettingsState<Value>>;
  subscribe(listener: (state: SettingsState<Value>) => void): () => void;
}

interface WatchContext<Value> {
  push(event: SettingsEvent<Value>): Promise<void>;
  signal: AbortSignal;
}

function toEvent<Value>(state: SettingsState<Value>): SettingsEvent<Value> {
  return state.status === "ready"
    ? { status: "ready", revision: state.revision, document: state.values }
    : { status: "invalid", revision: state.revision, error: state.error };
}

export function watchSettings<Value>(settings: WatchableSettings<Value>) {
  return (_input: unknown, { push, signal }: WatchContext<Value>): Promise<void> =>
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
