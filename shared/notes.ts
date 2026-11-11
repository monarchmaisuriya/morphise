// A chat's note lives on the chat itself (agent metadata), so it goes when the chat does.
export const NOTE_KEY = "morphise.note";
export const MAX_NOTE_LENGTH = 10_000;

export function readNote(metadata: unknown): string {
  const value = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>)[NOTE_KEY] : undefined;
  return typeof value === "string" ? value : "";
}

export function notePatch(text: string): Record<typeof NOTE_KEY, string | null> {
  if (text.length > MAX_NOTE_LENGTH) throw new Error(`A note can be at most ${MAX_NOTE_LENGTH} characters`);
  return { [NOTE_KEY]: text.trim() === "" ? null : text };
}
