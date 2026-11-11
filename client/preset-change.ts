import type { Profile } from "../shared/profile";

type Preset = Profile["newWorkspace"]["presets"][number];
type Isolation = "local" | "worktree";

// The New workspace screen merges metadata keys, so switching presets must remove (null) the keys
// only the previous preset set, and fall back to the isolation the screen had before any preset.
export function presetChange(previous: Preset | null, next: Preset | null, original: Isolation) {
  const metadata: Record<string, unknown> = {};
  for (const key of Object.keys(previous?.metadata ?? {})) {
    if (!(key in (next?.metadata ?? {}))) metadata[key] = null;
  }
  Object.assign(metadata, next?.metadata ?? {});
  return { isolation: next?.isolation ?? original, metadata };
}
