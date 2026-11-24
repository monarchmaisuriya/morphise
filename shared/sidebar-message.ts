function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

export function messagePreview(item: unknown): string | null {
  const value = record(item);
  if (!value || (value.type !== "user_message" && value.type !== "assistant_message") || typeof value.text !== "string") return null;
  const text = value.text
    .replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/gm, "")
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, "")
    .replace(/^\s*(?:=+|-+)\s*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+|\s+#+\s*$/gm, "")
    .replace(/^\s*(?:>\s*)+/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, "")
    .replace(/!?\[([^\]]*)\]\([^\n)]*\)/g, "$1")
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>\n]+>/g, (tag) => /^<https?:\/\//i.test(tag) ? tag.slice(1, -1) : "")
    .replace(/(`+)([^`]*?)\1/g, "$2")
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[\s(])([*_])(?=\S)([^\n]*?\S)\2(?=$|[\s).,!?:;])/g, "$1$3")
    .replace(/\\([\\`*_{}\[\]()#+.!>~-])/g, "$1")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[entity] ?? entity)
    .replace(/\s+/g, " ").trim();
  return !text ? null : text.length > 240 ? `${text.slice(0, 239)}…` : text;
}

export function lastMessagePreview(entries: readonly unknown[]) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const preview = messagePreview(record(entries[index])?.item);
    if (preview) return preview;
  }
  return null;
}
