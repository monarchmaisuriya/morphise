import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

import { diagramDoc, redrawDiagram, redrawDiagrams, stopCardDraws, themeMermaid } from "./mermaid";

type Listener = (event: { source: unknown; data: unknown }) => void;

// The document Paseo gives a diagram frame, as far as the swap reads it.
const PASEO_DOC = "<html>__PASEO_MERMAID_RUNTIME_RECEIVE__ theme:x===\"dark\"?\"dark\":\"default\"</html>";
const MERMAID_FRAME = '[data-testid="mermaid-viewport-canvas"] iframe';

let listeners: Set<Listener>;
const send = (source: unknown, data: unknown) => [...listeners].forEach((listener) => listener({ source, data }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A minimal element: attributes, listeners and children, enough for the redraw card. */
function fakeElement(extra: Record<string, unknown> = {}) {
  const attrs: Record<string, string> = {};
  return {
    isConnected: true,
    attrs,
    setAttribute: (name: string, value: string) => void (attrs[name] = value),
    getAttribute: (name: string) => attrs[name] ?? null,
    addEventListener: () => {},
    appendChild: () => {},
    remove: () => {},
    querySelector: () => null,
    ...extra,
  };
}

beforeEach(() => {
  listeners = new Set();
  vi.stubGlobal("window", { addEventListener: (_: string, listener: Listener) => listeners.add(listener), removeEventListener: (_: string, listener: Listener) => listeners.delete(listener) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("diagrams when the plugin unloads", () => {
  // A diagram frame in Paseo's chat, showing Pele while the restyle is on.
  function setup() {
    const proto = {
      setAttribute(this: { attrs: Record<string, string> }, name: string, value: string) {
        this.attrs[name] = value;
      },
    };
    vi.stubGlobal("HTMLIFrameElement", { prototype: proto });
    const win = { postMessage: vi.fn() };
    const frame = Object.assign(Object.create(proto) as typeof proto, { attrs: {} as Record<string, string>, contentWindow: win, getAttribute: (name: string) => frame.attrs[name] ?? null });
    vi.stubGlobal("document", {
      querySelectorAll: (selector: string) => (selector === MERMAID_FRAME || selector === "iframe" ? [frame] : []),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    let on = true;
    const pele = { render: vi.fn(async () => ({ svg: "<svg></svg>", width: 10, height: 10 })), on: () => true };
    const cleanup = themeMermaid(() => on, pele);
    frame.setAttribute("srcdoc", PASEO_DOC);
    expect(frame.attrs.srcdoc).toBe(diagramDoc(true));
    send(win, { type: "cp-pele-render", revision: 3, source: "graph TD", colorScheme: "dark" });
    // The restyle turns off as the plugin unloads: the frame goes back to Paseo's mermaid, then the theming is removed.
    on = false;
    redrawDiagrams();
    expect(frame.attrs.srcdoc).toBe(PASEO_DOC);
    return { win, cleanup };
  }

  it("replays the render request to a frame that reloads after cleanup, then stops listening", async () => {
    const { win, cleanup } = setup();
    await flush();
    cleanup();
    win.postMessage.mockClear();
    send(win, { type: "bridgeReady" });
    expect(win.postMessage).toHaveBeenCalledWith({ type: "render", revision: 3, source: "graph TD", colorScheme: "dark", interactive: false }, "*");
    expect(listeners.size).toBe(0);
  });

  it("stops waiting for a frame that never loads", async () => {
    const { cleanup } = setup();
    await flush();
    vi.useFakeTimers();
    cleanup();
    expect(listeners.size).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(listeners.size).toBe(0);
  });
});

describe("the redraw card", () => {
  it("stops listening for its frame's answer once the card leaves the page", async () => {
    const created: Array<ReturnType<typeof fakeElement>> = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const element = fakeElement({ contentWindow: null });
        created.push(element);
        return element;
      },
    });
    const source = { textContent: "graph TD\n" };
    const box = fakeElement({ querySelector: (selector: string) => (selector.includes("mermaid") ? source : null), nextElementSibling: null });
    const button = fakeElement();
    redrawDiagram(box as never, button as never);
    await flush();
    await flush();
    expect(listeners.size).toBe(1);
    const card = created.find((element) => "data-cp-redraw-card" in element.attrs)!;
    card.isConnected = false;
    stopCardDraws();
    expect(listeners.size).toBe(0);
  });
});
