import { createContext, useContext, useSyncExternalStore } from "react";
import { type ChatLook, chatLook } from "../../../shared/chat-view";
import type { RowActions } from "../../chat-rows";

// Morphise's own chat options for the rows (fold rules, long output, sizes, paths, accent, time)
// and what rows can do (files, Details), which Chat Polish's preferences have no place for.
// Renderers read them here; the chat.timeline section sets them, the settings preview overrides
// them with unsaved choices and no actions.

export interface RowLook extends ChatLook {
  // Tool calls as "cards" (Chat Polish's spacing) or "compact" (tighter rows).
  style: "cards" | "compact";
}

export interface RowSetup {
  look: RowLook;
  actions: RowActions | null;
}

let setup: RowSetup = { look: { ...chatLook(undefined), style: "cards" }, actions: null };
const listeners = new Set<() => void>();

export const currentRowSetup = () => setup;

export function setRowSetup(next: RowSetup) {
  setup = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

export const RowSetupOverride = createContext<RowSetup | undefined>(undefined);

export function useRowSetup(): RowSetup {
  const override = useContext(RowSetupOverride);
  const live = useSyncExternalStore(subscribe, currentRowSetup);
  return override ?? live;
}
