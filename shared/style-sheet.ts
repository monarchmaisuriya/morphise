import type { ChatWebSettings } from "./chat-view";
import type { Prefs } from "./polish/prefs";
import type { Profile } from "./profile";

// Test ids are already limited to selector-safe characters by the profile schema.
export function buildStyleSheet(style: Profile["style"]): string {
  if (!style.enabled) return "";
  const hidden = style.hideTestIds.map((id) => `[data-testid="${id}"] { display: none !important; }`);
  return [...hidden, style.css].filter((part) => part.trim() !== "").join("\n");
}

// Paseo's own prompts and replies on the web, by the test ids Paseo gives them (checked against
// Paseo 0.16). Morphise styles them without redrawing them, so their Fork and Copy stay.
const REPLY = '[data-testid="assistant-message"]';
const CHAT = ':is([data-testid="assistant-message"], [data-testid="user-message"])';
const CODE = ':is(pre, pre *, code, [data-paseo-markdown-tag="code"], [data-paseo-markdown-tag="pre"], [data-paseo-markdown-tag="pre"] *)';
// A prompt's bubble: its first container without a test id (a "Sent by" button may lead it).
const PROMPT_BUBBLE = '[data-testid="user-message"] > div > div:not([data-testid])';

// A reading style for Paseo's replies (body text only; code keeps its own font and spacing).
const TEXT = `${REPLY} .enrm-text :is(p, li)`;
const MARKDOWN_STYLES: Record<Exclude<Prefs["markdownStyle"], "paseo">, string[]> = {
  document: [`${TEXT} { line-height: 1.75 !important; }`, `${REPLY} .enrm-text p { margin-block: 0.85em !important; }`, `${REPLY} .enrm-text :is(h1, h2, h3) { margin-top: 1.4em !important; }`],
  compact: [`${TEXT} { line-height: 1.4 !important; }`, `${REPLY} .enrm-text p { margin-block: 0.3em !important; }`, `${REPLY} .enrm-text li { margin-block: 0.05em !important; }`, `${REPLY} .enrm-text :is(h1, h2, h3) { margin-top: 0.7em !important; margin-bottom: 0.2em !important; }`],
  // The size is set once on the reply's text and inherited, so nested lists and bold text are not shrunk again.
  terminal: [`${REPLY} .enrm-text { font-size: 0.93em; }`, `${REPLY} .enrm-text :not(${CODE}) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; }`, `${TEXT} { line-height: 1.55 !important; }`],
};

// The Chat settings' "Experimental (web)" choices as CSS; empty when none is set. Every value was
// checked when saved (colours as #rrggbb, fonts as plain names, sizes as numbers in range). `look`
// adds the system font and a reply reading style from Chat Polish's options.
export function buildChatWebCss(web: ChatWebSettings | undefined, look?: Pick<Prefs, "uiFont" | "markdownStyle">): string {
  const rules: string[] = [];
  if (look && look.markdownStyle !== "paseo") rules.push(...MARKDOWN_STYLES[look.markdownStyle]);
  if (look?.uiFont === "system" && !web?.uiFont) rules.push(`${CHAT} :not(${CODE}) { font-family: system-ui, -apple-system, sans-serif !important; }`);
  if (!web) return rules.join("\n");
  if (web.replySize && web.replySize !== 100) rules.push(`${REPLY} { zoom: ${web.replySize / 100}; }`);
  if (web.replyLineHeight && web.replyLineHeight !== 100) rules.push(`${REPLY} .enrm-text :is(p, li, div, span) { line-height: ${((1.5 * web.replyLineHeight) / 100).toFixed(2)} !important; }`);
  if (web.boldColor) rules.push(`${REPLY} :is(strong, b) { color: ${web.boldColor} !important; }`);
  if (web.linkStyle === "dashed") rules.push(`${REPLY} a { text-decoration: underline dashed !important; text-underline-offset: 3px; }`);
  if (web.clampPrompts) {
    rules.push(`${PROMPT_BUBBLE} { display: -webkit-box !important; -webkit-box-orient: vertical; -webkit-line-clamp: ${web.clampPrompts}; overflow: hidden; }`);
    rules.push(`${PROMPT_BUBBLE}:hover { -webkit-line-clamp: unset; display: block !important; }`);
  }
  if (web.uiFont) rules.push(`${CHAT} :not(${CODE}) { font-family: "${web.uiFont}", system-ui, sans-serif !important; }`);
  if (web.codeFont) rules.push(`${CHAT} ${CODE} { font-family: "${web.codeFont}", ui-monospace, monospace !important; }`);
  return rules.join("\n");
}
