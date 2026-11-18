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

describe("labels with an @ in Paseo's diagram frames", () => {
  const DOC = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>__PASEO_MERMAID_RUNTIME_RECEIVE__</script></body></html>";
  // A frame in Paseo's chat, and the theming installed with Pele off.
  function frameWith(restyle: boolean) {
    const proto = {
      setAttribute(this: { attrs: Record<string, string> }, name: string, value: string) {
        this.attrs[name] = value;
      },
    };
    vi.stubGlobal("HTMLIFrameElement", { prototype: proto });
    vi.stubGlobal("document", { querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {} });
    const frame = Object.assign(Object.create(proto) as typeof proto, { attrs: {} as Record<string, string> });
    const cleanup = themeMermaid(() => restyle, { render: vi.fn(async () => null), on: () => false });
    return { frame, cleanup };
  }
  const injected = (doc: string) => /<head>.*?<script>([\s\S]*?)<\/script>/.exec(doc)?.[1] ?? "";

  it("get a script that runs first, with the restyle on or off, added once however often the frame reloads", () => {
    for (const restyle of [true, false]) {
      const { frame, cleanup } = frameWith(restyle);
      frame.setAttribute("srcdoc", DOC);
      expect(injected(frame.attrs.srcdoc)).toContain("__PASEO_MERMAID_RUNTIME_RECEIVE__");
      frame.setAttribute("srcdoc", frame.attrs.srcdoc);
      expect(frame.attrs.srcdoc.split("<script>").length).toBe(DOC.split("<script>").length + 1);
      cleanup();
    }
  });

  it("are drawn quoted, and the reply carries the source Paseo sent, which is how Paseo matches it", () => {
    const { frame, cleanup } = frameWith(true);
    frame.setAttribute("srcdoc", DOC);
    cleanup();
    // The script's world: the frame's window, Paseo's runtime and the chat that sent the request.
    const host = { postMessage: vi.fn() };
    const frameListeners: Array<(event: unknown) => void> = [];
    const win: Record<string, unknown> = { parent: host, __PASEO_MERMAID_RUNTIME_RECEIVE__: vi.fn() };
    new Function("window", "addEventListener", injected(frame.attrs.srcdoc))(win, (_: string, listener: (event: unknown) => void) => frameListeners.push(listener));
    const stop = vi.fn();
    const source = "flowchart LR\n  F[@mention] --> G";
    frameListeners[0]({ source: host, data: { type: "render", revision: 2, source, colorScheme: "dark" }, stopImmediatePropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(win.__PASEO_MERMAID_RUNTIME_RECEIVE__).toHaveBeenCalledWith({ type: "render", revision: 2, source: 'flowchart LR\n  F["@mention"] --> G', colorScheme: "dark" });
    (win.parent as { postMessage(message: unknown, origin: string): void }).postMessage({ type: "rendered", revision: 2, source: 'flowchart LR\n  F["@mention"] --> G' }, "*");
    expect(host.postMessage).toHaveBeenCalledWith({ type: "rendered", revision: 2, source }, "*");
  });
});
