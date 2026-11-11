// Pure helpers for the settings forms, kept apart from React Native so they can be unit tested.

// A fresh id for a new list item, unique in its list.
export function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

// One "key=value" per line; a value that reads as JSON (true, 3, {"a":1}) is stored as JSON.
export function parseMetadataText(text: string): Record<string, unknown> | undefined {
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const split = line.indexOf("=");
      const key = (split < 0 ? line : line.slice(0, split)).trim();
      const raw = split < 0 ? "" : line.slice(split + 1).trim();
      let value: unknown = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        // Not JSON: keep the text as it was typed.
      }
      return [key, value] as const;
    });
  return entries.length ? Object.fromEntries(entries) : undefined;
}
