import { describe, expect, it } from "vitest";
import { type ChatElement, chatAgentOf, paneAgentOf } from "./chat-agent";

// A pane with one selected agent tab and one transcript; `visible` is whether the transcript is drawn.
function pane(visible: boolean): ChatElement {
  const tab: ChatElement = { parentElement: null, closest: () => null, matches: () => false, querySelectorAll: () => [], getClientRects: () => [{}], getAttribute: (name) => (name === "data-testid" ? "workspace-tab-agent_a1" : null) };
  const root: ChatElement = { parentElement: null, closest: () => null, matches: (s) => s.includes("workspace-pane-"), querySelectorAll: () => [tab], getClientRects: () => [{}], getAttribute: () => null };
  const transcript: ChatElement = { parentElement: root, closest: () => null, matches: () => false, querySelectorAll: () => [], getClientRects: () => (visible ? [{}] : []), getAttribute: () => null };
  transcript.closest = () => transcript;
  return { parentElement: transcript, closest: () => transcript, matches: () => false, querySelectorAll: () => [], getClientRects: () => [{}], getAttribute: () => null };
}

// A small element tree that answers the attribute selectors the lookup uses ([name="v"], [name^="v"], combined).
interface Node extends ChatElement {
  parentElement: Node | null;
  children: Node[];
}
function el(attrs: Record<string, string>, children: Node[] = [], drawn = true): Node {
  const matches = (selector: string) => [...selector.matchAll(/\[([\w-]+)(\^?=)"([^"]*)"\]/g)].every(([, name, op, value]) => (op === "=" ? attrs[name!] === value : attrs[name!]?.startsWith(value!) === true));
  const descendants = (node: Node): Node[] => node.children.flatMap((child) => [child, ...descendants(child)]);
  const node: Node = {
    parentElement: null,
    children,
    matches,
    closest: (selector) => {
      for (let at: Node | null = node; at; at = at.parentElement) if (at.matches(selector)) return at;
      return null;
    },
    querySelectorAll: (selector) => descendants(node).filter((child) => child.matches(selector)),
    getClientRects: () => (drawn ? [{}] : []),
    getAttribute: (name) => attrs[name] ?? null,
  };
  for (const child of children) child.parentElement = node;
  return node;
}
const agentTab = (id: string, drawn = true) => el({ "data-testid": `workspace-tab-agent_${id}`, "aria-selected": "true" }, [], drawn);
const transcriptWith = (text: Node) => el({ "data-testid": "agent-chat-scroll" }, [text]);

describe("chatAgentOf", () => {
  it("names the chat of an element in the transcript on screen", () => {
    expect(chatAgentOf(pane(true))).toBe("a1");
  });

  it("names no chat for a background tab's hidden transcript, whose pane has another chat selected", () => {
    expect(chatAgentOf(pane(false))).toBeNull();
  });

  it("names no chat for a pane showing something else, even when the pane beside it shows a chat", () => {
    const text = el({});
    el({}, [
      el({ "data-testid": "workspace-pane-left" }, [el({ "data-testid": "workspace-tab-file_readme", "aria-selected": "true" }), transcriptWith(text)]),
      el({ "data-testid": "workspace-pane-right" }, [agentTab("b2"), transcriptWith(el({}))]),
    ]);
    expect(chatAgentOf(text)).toBeNull();
  });
});

describe("paneAgentOf", () => {
  it("names the agent selected in the element's pane, from anywhere in it", () => {
    const text = el({});
    el({ "data-testid": "workspace-pane-1" }, [agentTab("a1"), el({}, [text])]);
    expect(paneAgentOf(text)).toBe("a1");
  });

  it("ignores a selected tab that is not drawn", () => {
    const text = el({});
    el({ "data-testid": "workspace-pane-1" }, [agentTab("hidden", false), agentTab("a1"), el({}, [text])]);
    expect(paneAgentOf(text)).toBe("a1");
  });

  it("names no agent when the pane's selected tab is not an agent, even when the pane beside it shows one", () => {
    const text = el({});
    el({}, [el({ "data-testid": "workspace-pane-left" }, [el({ "data-testid": "workspace-tab-file_readme", "aria-selected": "true" }), text]), el({ "data-testid": "workspace-pane-right" }, [agentTab("b2")])]);
    expect(paneAgentOf(text)).toBeNull();
  });

  it("names no agent when two drawn selected agent tabs share the nearest ancestor that has any", () => {
    const text = el({});
    el({}, [agentTab("a1"), agentTab("b2"), el({}, [text])]);
    expect(paneAgentOf(text)).toBeNull();
  });

  it("names no agent for an element with no pane and no agent tab above it", () => {
    const text = el({});
    el({}, [el({}, [text])]);
    expect(paneAgentOf(text)).toBeNull();
  });
});
