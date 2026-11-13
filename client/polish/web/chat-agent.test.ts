import { describe, expect, it } from "vitest";
import { type ChatElement, chatAgentOf } from "./chat-agent";

// A pane with one selected agent tab and one transcript; `visible` is whether the transcript is drawn.
function pane(visible: boolean): ChatElement {
  const tab: ChatElement = { parentElement: null, closest: () => null, matches: () => false, querySelectorAll: () => [], getClientRects: () => [{}], getAttribute: (name) => (name === "data-testid" ? "workspace-tab-agent_a1" : null) };
  const root: ChatElement = { parentElement: null, closest: () => null, matches: (s) => s.includes("workspace-pane-"), querySelectorAll: () => [tab], getClientRects: () => [{}], getAttribute: () => null };
  const transcript: ChatElement = { parentElement: root, closest: () => null, matches: () => false, querySelectorAll: () => [], getClientRects: () => (visible ? [{}] : []), getAttribute: () => null };
  transcript.closest = () => transcript;
  return { parentElement: transcript, closest: () => transcript, matches: () => false, querySelectorAll: () => [], getClientRects: () => [{}], getAttribute: () => null };
}

describe("chatAgentOf", () => {
  it("names the chat of an element in the transcript on screen", () => {
    expect(chatAgentOf(pane(true))).toBe("a1");
  });

  it("names no chat for a background tab's hidden transcript, whose pane has another chat selected", () => {
    expect(chatAgentOf(pane(false))).toBeNull();
  });
});
