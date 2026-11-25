export function quickChatRowTitle(title: string, width: number) {
  const limit = width > 0 && width < 640 ? 60 : 120;
  if (title.length <= limit) return title;
  const head = title.slice(0, limit - 1);
  const boundary = head.lastIndexOf(" ");
  return `${boundary > limit / 2 ? head.slice(0, boundary) : head}…`;
}
