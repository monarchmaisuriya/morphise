// The selection bar's and side chat's words, in Paseo's language (English, or Chinese for zh-*).
// Kept beside the bar rather than in shared/polish/i18n.ts because no other part uses them.
import { currentLanguage, type Language } from "../i18n";

const EN = {
  quote: "Quote",
  quoteTitle: "Quote into the message box",
  reply: "Reply",
  replyTitle: "Reply to this passage",
  side: "Side chat",
  sideTitle: "Ask about this in a side chat",
  copy: "Copy",
  copied: "Copied",
  text: "Text",
  textTitle: "Copy as plain text",
  markdown: "Markdown",
  markdownTitle: "Copy as Markdown",
  bookmarkTitle: "Bookmark this passage",
  bookmarked: "Bookmarked",
  cancel: "Cancel",
  add: "Add to chat",
  send: "Send",
  ask: "Ask",
  replyPlaceholder: "Reply to this passage…",
  sidePlaceholder: "Ask about this in a side chat…",
  hintSendAdd: "Enter to send · {mod}+Enter to add",
  hintSend: "Enter to send",
  hintAdd: "Enter to add to chat",
  hintAsk: "Enter to ask · Shift+Enter for a new line",
  queued: "Queued: sends when the current turn ends",
  noComposer: "The message box is not available.",
  noMainChat: "The main chat is not available.",
  noWorkspace: "The main chat has no workspace.",
  thinking: "Thinking…",
  openAsTab: "Open as tab",
  openAsTabLabel: "Open the side chat as a tab",
  loading: "Loading…",
  followUp: "Ask a follow-up…",
  sendFollowUp: "Send to the side chat",
} as const;

type Key = keyof typeof EN;

const ZH: Record<Key, string> = {
  quote: "引用",
  quoteTitle: "引用到消息框",
  reply: "回复",
  replyTitle: "回复这段内容",
  side: "侧边对话",
  sideTitle: "在侧边对话中询问这段内容",
  copy: "复制",
  copied: "已复制",
  text: "纯文本",
  textTitle: "复制为纯文本",
  markdown: "Markdown",
  markdownTitle: "复制为 Markdown",
  bookmarkTitle: "为这段内容添加书签",
  bookmarked: "已添加书签",
  cancel: "取消",
  add: "添加到对话",
  send: "发送",
  ask: "提问",
  replyPlaceholder: "回复这段内容…",
  sidePlaceholder: "在侧边对话中询问…",
  hintSendAdd: "Enter 发送 · {mod}+Enter 添加",
  hintSend: "Enter 发送",
  hintAdd: "Enter 添加到对话",
  hintAsk: "Enter 提问 · Shift+Enter 换行",
  queued: "已排队：当前回合结束后发送",
  noComposer: "消息框不可用。",
  noMainChat: "主对话不可用。",
  noWorkspace: "主对话没有工作区。",
  thinking: "思考中…",
  openAsTab: "在标签页中打开",
  openAsTabLabel: "在标签页中打开侧边对话",
  loading: "加载中…",
  followUp: "继续提问…",
  sendFollowUp: "发送到侧边对话",
};

export const WORDS: Record<Language, Record<Key, string>> = { en: EN, zh: ZH };

/** One of the bar's words in Paseo's current language, with `{name}` placeholders filled. */
export function say(key: Key, vars: Record<string, string> = {}, language: Language = currentLanguage()): string {
  return WORDS[language][key].replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}
