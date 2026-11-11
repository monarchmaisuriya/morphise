import { useSyncExternalStore } from "react";
import { EMPTY_PROFILE, type Profile } from "../shared/profile";
import type { ProfileEvent } from "../shared/watch";

export interface ValueStore<Value> {
  get(): Value;
  set(value: Value): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<Value>(initial: Value): ValueStore<Value> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useValue<Value>(store: ValueStore<Value>): Value {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// The last profile event the daemon sent, kept apart from the connection's health: a broken
// connection must not undo the user's customisations, only stop new changes from arriving.
export interface ProfileState {
  event: ProfileEvent | null;
  connectionError: string | null;
}

export type ProfileStore = ValueStore<ProfileState>;

export function createProfileStore(): ProfileStore {
  return createValueStore<ProfileState>({ event: null, connectionError: null });
}

// Only a valid stored profile changes the app. Until one arrives, or while the stored document is
// invalid, nothing is applied; the editor shows why.
export function profileOf(state: ProfileState): Profile {
  return state.event?.status === "ready" ? state.event.profile : EMPTY_PROFILE;
}
