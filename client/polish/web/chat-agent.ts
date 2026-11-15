// Which chat an element on Paseo's web page belongs to, read from the page (web and desktop only).
// The chat markup carries no agent id; the pane's selected agent tab names it. The one home of that
// lookup: the selection bar, the Run buttons, table copy and the context card all use it.
// Host selectors, checked against Paseo 0.16.0-beta.2.

/** One chat transcript. Inactive tabs keep theirs mounted with `display: none`. */
export const CHAT_SCROLL = '[data-testid="agent-chat-scroll"]';
/** A split-view pane; its tab row names the agent whose chat it shows. */
const PANE = '[data-testid^="workspace-pane-"]';
const ACTIVE_AGENT_TAB = '[data-testid^="workspace-tab-agent_"][aria-selected="true"]';
const AGENT_TAB_PREFIX = "workspace-tab-agent_";

/** The part of an element this lookup reads; both of Morphise's DOM type sets satisfy it. */
export interface ChatElement {
  readonly parentElement: ChatElement | null;
  closest(selector: string): ChatElement | null;
  matches(selector: string): boolean;
  querySelectorAll(selector: string): ArrayLike<ChatElement>;
  getClientRects(): ArrayLike<unknown>;
  getAttribute(name: string): string | null;
}

/** The agent whose chat holds `element`, or null when it is not in a chat or the pane names none. */
export function chatAgentOf(element: ChatElement): string | null {
  const transcript = element.closest(CHAT_SCROLL);
  // A background tab keeps its transcript mounted but hidden; the pane's selected tab names another chat.
  if (!transcript || transcript.getClientRects().length === 0) return null;
  return paneAgentOf(transcript);
}

/** The agent selected in `element`'s pane, or null when the pane's selected tab is no agent or that can't be told. */
export function paneAgentOf(element: ChatElement): string | null {
  return agentIdOf(nearestUnique(element, ACTIVE_AGENT_TAB));
}

/**
 * The first visible match walking up from `from`, stopping at its pane. Two visible matches at the
 * same level mean two chats share it: no answer beats a wrong one.
 */
export function nearestUnique(from: ChatElement, selector: string): ChatElement | null {
  for (let node = from.parentElement; node; node = node.parentElement) {
    const visible = Array.from(node.querySelectorAll(selector)).filter((element) => element.getClientRects().length > 0);
    if (visible.length === 1) return visible[0]!;
    if (visible.length > 1 || node.matches(PANE)) return null;
  }
  return null;
}

function agentIdOf(tab: ChatElement | null): string | null {
  const testId = tab?.getAttribute("data-testid");
  return testId?.startsWith(AGENT_TAB_PREFIX) ? testId.slice(AGENT_TAB_PREFIX.length) || null : null;
}
