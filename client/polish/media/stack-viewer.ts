// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/stack-viewer.ts
// The image viewer for a stack of images Paseo drew itself (a reply with text), opened from a click in the DOM.
// web/image-stacks.ts calls openStackViewer; StackViewerHost (views.tsx), mounted in an always-mounted
// Morphise component, shows it.
import { useEffect, useSyncExternalStore } from "react";

export type StackImage = { alt: string; url: string };
type Shown = { images: StackImage[]; index: number } | undefined;

let shown: Shown;
// Mounted hosts in mount order; only the first draws the viewer, so two mounted hosts never open two.
const hosts: object[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));

/** Whether a host is mounted to show the viewer; when none is, clicks are left to Paseo. */
export const stackViewerHosted = () => hosts.length > 0;

export function openStackViewer(images: StackImage[], index: number) {
  shown = { images, index };
  notify();
}

export function setStackViewerIndex(index: number) {
  if (!shown) return;
  shown = { ...shown, index };
  notify();
}

export function closeStackViewer() {
  shown = undefined;
  notify();
}

/** Counts this host while mounted; true when it is the one that draws the viewer. */
export function useStackViewerHost(token: object): boolean {
  useEffect(() => {
    hosts.push(token);
    notify();
    return () => {
      hosts.splice(hosts.indexOf(token), 1);
      notify();
    };
  }, [token]);
  return useSyncExternalStore(subscribe, () => hosts[0] === token);
}

export function useStackViewer(): Shown {
  return useSyncExternalStore(subscribe, () => shown);
}
