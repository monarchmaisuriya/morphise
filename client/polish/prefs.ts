import { createContext, useContext, useSyncExternalStore } from "react";
import { type Prefs, polishPrefs } from "../../shared/polish/prefs";

// Chat Polish's preferences store (lthieu96/paseo-chat-polish, MIT, see NOTICE.md), fed from
// Morphise's profile instead of Chat Polish's own settings document. Transformers read
// `currentPrefs()` when they run; components subscribe with `usePrefs()`.

let prefs: Prefs = polishPrefs(undefined);
const listeners = new Set<() => void>();

export const currentPrefs = () => prefs;

export function setPrefs(next: Prefs) {
  prefs = next;
  listeners.forEach((listener) => listener());
}

export const subscribePrefs = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

// Lets a settings preview draw with prefs that are not saved yet.
export const PrefsOverride = createContext<Prefs | undefined>(undefined);

export function usePrefs() {
  const override = useContext(PrefsOverride);
  const live = useSyncExternalStore(subscribePrefs, currentPrefs);
  return override ?? live;
}
