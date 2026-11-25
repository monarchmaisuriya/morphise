function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

export function messagePreview(item: unknown): string | null {
  const value = record(item);
  if (!value || value.type !== "assistant_message" || typeof value.text !== "string") return null;
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
  if (!text) return null;
  if (text.length <= 240) return text;
  const head = text.slice(0, 239), boundary = head.lastIndexOf(" ");
  return `${boundary > 0 ? head.slice(0, boundary) : head}…`;
}

export function lastMessagePreview(entries: readonly unknown[]) {
  const message = lastAssistantMessage(entries);
  return message ? messagePreview(message) : null;
}

export function lastAssistantMessage(entries: readonly unknown[]): { type: "assistant_message"; text: string; messageId?: string } | null {
  let result: { type: "assistant_message"; text: string; messageId?: string } | null = null;
  let separated = false;
  for (const entry of entries) {
    const item = record(record(entry)?.item);
    if (item?.type === "user_message") { separated = true; continue; }
    if (item?.type !== "assistant_message" || typeof item.text !== "string") continue;
    const messageId = typeof item.messageId === "string" ? item.messageId : undefined;
    if (result && !separated && (messageId === undefined || result.messageId === messageId)) result.text += item.text;
    else result = { type: "assistant_message", text: item.text, messageId };
    separated = false;
  }
  return result;
}
