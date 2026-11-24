function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

export function messagePreview(item: unknown): string | null {
  const value = record(item);
  if (!value || (value.type !== "user_message" && value.type !== "assistant_message") || typeof value.text !== "string") return null;
  const text = value.text.replace(/\s+/g, " ").trim();
  return !text ? null : text.length > 240 ? `${text.slice(0, 239)}…` : text;
}

export function lastMessagePreview(entries: readonly unknown[]) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const preview = messagePreview(record(entries[index])?.item);
    if (preview) return preview;
  }
  return null;
}
