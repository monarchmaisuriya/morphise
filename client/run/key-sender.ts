// Sends keys to a running command in the order they were pressed, one request at a time, joining what
// was typed while a request was out. A paste past the limit goes in pieces of `chunkChars` characters.
// A failed send drops what was waiting (typing on after an error would land out of order) and is
// reported once. Used by the run card and by the panel under a code block.
import { LIMITS } from "../../shared/run/limits";

// Half the request limit in characters: one character can take two of the limit's units.
export const KEY_CHUNK_CHARS = LIMITS.inputChars / 2;

export function createKeySender(
  send: (keys: string) => Promise<unknown>,
  { chunkChars = KEY_CHUNK_CHARS, onError }: { chunkChars?: number; onError(error: unknown): void },
): (keys: string) => void {
  let pending: string[] = [];
  let sending = false;
  return (keys) => {
    pending.push(...keys);
    if (sending) return;
    sending = true;
    void (async () => {
      try {
        while (pending.length > 0) await send(pending.splice(0, chunkChars).join(""));
      } catch (error) {
        pending = [];
        onError(error);
      } finally {
        sending = false;
      }
    })();
  };
}
