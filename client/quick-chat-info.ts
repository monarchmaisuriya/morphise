import type { QuickChatListItem } from "../shared/quick-chat";

export function quickChatInfo(chat: QuickChatListItem): { label: string; value: string }[] {
  const text = (value?: string) => value?.trim() || "Unavailable";
  const timestamp = (value?: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) return "Unavailable";
    const day = value.slice(0, 10);
    if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return "Unavailable";
    return new Date(value).toISOString();
  };
  return [
    { label: "Title", value: text(chat.title) },
    { label: "Provider", value: text(chat.provider) },
    { label: "State", value: chat.archivedAt === undefined ? "Unavailable" : chat.archivedAt ? "Archived" : "Active" },
    { label: "Created (UTC)", value: timestamp(chat.createdAt) },
    { label: "Updated (UTC)", value: timestamp(chat.updatedAt) },
    ...(chat.archivedAt ? [{ label: "Archived (UTC)", value: timestamp(chat.archivedAt) }] : []),
    { label: "Chat ID", value: text(chat.id) },
    { label: "Workspace ID", value: text(chat.workspaceId) },
  ];
}
