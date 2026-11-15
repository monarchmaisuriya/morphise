import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@getpaseo/plugin/client/ui", () => ({ copyText: vi.fn() }));
vi.mock("../../prefs", () => ({ currentPrefs: () => ({ barPosition: "above" }), subscribePrefs: () => () => {} }));
vi.mock("../../theme-registry", () => ({ currentTheme: () => undefined }));
vi.mock("../palette", () => ({ choosePalette: () => [], parseColor: () => null }));
vi.mock("../strings", () => ({ say: (key: string) => key }));
// A queued reply's outcome is handed back through the callback the bar gives sendReply.
const sent = vi.hoisted(() => ({ unsent: null as null | ((reason: string, detail: string | null) => void) }));
vi.mock("../actions", () => ({
  SIDE_CHAT_PANEL_ID: "side-chat",
  hasComposer: () => false,
  sendReply: async (_paseo: unknown, _agentId: string, _text: string, _behavior: string, onUnsent: (reason: string, detail: string | null) => void) => {
    sent.unsent = onUnsent;
    return "queued";
  },
}));
vi.mock("../../web/chat-agent", () => ({ CHAT_SCROLL: '[data-testid="agent-chat-scroll"]', chatAgentOf: () => "agent-1" }));
// The bar's top edge is the selection line's top, so a test can read where it was placed.
vi.mock("../bar-layout", () => ({
  BAR_ICONS: {},
  barItems: () => [{ kind: "button", action: "copy-text", word: "text", label: "text", title: "textTitle" }],
  barTop: (anchor: { top: number }) => anchor.top,
}));

import { installSelectionBar, mayTakeOverBar } from "./bar";

type Listener = (event: unknown) => void;

/** An element that takes any call: the bar only writes to its own elements, and reads a few numbers back. */
function fakeElement(extra: Record<string, unknown> = {}) {
  const listeners = new Map<string, Listener>();
  const styles = new Map<string, string>();
  const children = new Map<string, unknown>();
  const element: Record<string, unknown> & { styles: Map<string, string>; listeners: Map<string, Listener> } = {
    nodeType: 1,
    parentElement: null,
    isConnected: true,
    offsetWidth: 0,
    offsetHeight: 0,
    hidden: false,
    style: { setProperty: (name: string, value: string) => styles.set(name, value) },
    styles,
    listeners,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild: (child: unknown) => child,
    contains: (node: unknown) => node === element,
    closest: () => null,
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    getClientRects: () => [],
    remove: () => {},
    focus: () => {},
    attachShadow: () => ({
      innerHTML: "",
      querySelector: (selector: string) => {
        if (!children.has(selector)) children.set(selector, fakeElement());
        return children.get(selector);
      },
      querySelectorAll: () => [],
    }),
    ...extra,
  };
  return element;
}

const rect = (top: number) => ({ left: 10, top, right: 50, bottom: top + 16, width: 40, height: 16 });

let copies = 0;
let lineTop = 100;
let documentListeners: Map<string, Listener>;
let windowListeners: Map<string, Listener>;

beforeEach(() => {
  vi.useFakeTimers();
  copies = 0;
  lineTop = 100;
  documentListeners = new Map();
  windowListeners = new Map();
  // The selected text sits in a chat transcript.
  const transcript = fakeElement();
  const start = fakeElement({ closest: (selector: string) => (selector.includes("agent-chat-scroll") ? transcript : null) });
  const range = { startContainer: start, endContainer: start, commonAncestorContainer: start, getClientRects: () => [rect(lineTop)], getBoundingClientRect: () => rect(lineTop) };
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    getSelection: () => ({ isCollapsed: false, rangeCount: 1, getRangeAt: () => range, toString: () => "selected" }),
    getComputedStyle: () => ({ color: "", backgroundColor: "", fontFamily: "" }),
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (handle: number) => clearTimeout(handle),
    addEventListener: (type: string, listener: Listener) => windowListeners.set(type, listener),
    removeEventListener: () => {},
  });
  vi.stubGlobal("DataTransfer", class { getData() { return ""; } });
  vi.stubGlobal(
    "ClipboardEvent",
    class {
      defaultPrevented = false;
      constructor() {
        copies += 1;
      }
    },
  );
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("navigator", { userAgent: "" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("follows a scrolling selection without asking the host to copy it again", () => {
  const created: Array<ReturnType<typeof fakeElement>> = [];
  vi.stubGlobal("document", {
    body: fakeElement(),
    createElement: () => {
      const element = fakeElement();
      created.push(element);
      return element;
    },
    addEventListener: (type: string, listener: Listener) => documentListeners.set(type, listener),
    removeEventListener: () => {},
  });
  const stop = installSelectionBar({ client: {} as never, bookmarkPassage: vi.fn() });
  const barHost = created[0]!;

  // Releasing the selection reads it, through one synthetic copy for the host's Markdown.
  documentListeners.get("pointerup")!({ target: null });
  vi.runAllTimers();
  expect(copies).toBe(1);
  expect(barHost.styles.get("display")).toBe("block");
  expect(barHost.styles.get("top")).toBe("100px");

  // A streaming reply scrolls the chat many times: the bar moves with the line, and no copy event fires.
  for (const top of [90, 80, 70]) {
    lineTop = top;
    windowListeners.get("scroll")!({ target: null });
    vi.runAllTimers();
  }
  expect(copies).toBe(1);
  expect(barHost.styles.get("top")).toBe("70px");
  stop();
});

it("lets a late report take over the bar only when the bar is idle", () => {
  expect(mayTakeOverBar("hidden", false)).toBe(true);
  expect(mayTakeOverBar("hidden", true)).toBe(false);
  for (const mode of ["bar", "note", "reply", "side"] as const) expect(mayTakeOverBar(mode, false)).toBe(false);
});

it("keeps a reply being typed when an earlier queued reply is reported not sent, and reports it at the foot of the window", async () => {
  const created: Array<ReturnType<typeof fakeElement>> = [];
  let shadow: { querySelector(selector: string): ReturnType<typeof fakeElement> } | null = null;
  vi.stubGlobal("document", {
    body: fakeElement(),
    createElement: () => {
      const element = fakeElement();
      const attach = element.attachShadow as () => NonNullable<typeof shadow>;
      element.attachShadow = () => (shadow = attach());
      created.push(element);
      return element;
    },
    addEventListener: (type: string, listener: Listener) => documentListeners.set(type, listener),
    removeEventListener: () => {},
  });
  const stop = installSelectionBar({ client: { paseo: {}, composers: () => [] } as never, bookmarkPassage: vi.fn() });
  const barHost = created[0]!;
  const field = created[1]! as ReturnType<typeof fakeElement> & { value: string };
  const panel = shadow!.querySelector(".panel");
  shadow!.querySelector(".note").querySelector = () => fakeElement();
  const replyButton: ReturnType<typeof fakeElement> = fakeElement({ closest: () => replyButton, getAttribute: (name: string) => (name === "data-action" ? "reply" : null), disabled: false });
  const openReply = () => {
    documentListeners.get("pointerup")!({ target: null });
    vi.runAllTimers();
    panel.listeners.get("click")!({ target: replyButton });
  };
  const key = (name: string) => field.listeners.get("keydown")!({ key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, preventDefault: () => {} });

  // A reply is queued behind the running turn; its card closes.
  openReply();
  field.value = "first reply";
  key("Enter");
  await vi.runAllTimersAsync();
  expect(barHost.styles.get("display")).toBe("none");

  // While a second reply is being typed, the first is reported not sent.
  openReply();
  field.value = "draft in progress";
  sent.unsent!("timeout", null);
  // A stray click elsewhere leaves a card with text alone, so the draft survives.
  documentListeners.get("pointerdown")!({ target: null });
  expect(field.value).toBe("draft in progress");

  // Once the card is closed the report shows, anchored at the foot of the 800px window (this file's barTop places at the
  // anchor's top) rather than at the old passage's line at 100px.
  key("Escape");
  expect(barHost.styles.get("display")).toBe("block");
  expect(barHost.styles.get("top")).toBe("800px");
  stop();
});
