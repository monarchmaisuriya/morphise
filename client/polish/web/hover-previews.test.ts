import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachPreview, LEAVE_GRACE_MS, previewControl, previewPlacement } from "./hover-previews";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
const popover = vi.hoisted(() => ({ hide: vi.fn(), show: vi.fn() }));
vi.mock("./popover", () => ({ showAsPopover: (el: unknown) => (popover.show(el), popover.hide) }));

describe("previewControl", () => {
  let shown: boolean[];
  let delay: number;
  const control = () => previewControl(() => delay, (open) => shown.push(open));

  beforeEach(() => {
    vi.useFakeTimers();
    shown = [];
    delay = 1000;
  });
  afterEach(() => vi.useRealTimers());

  it("opens once the pointer has rested on the row for the delay", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(999);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([true]);
  });

  it("does not open when the pointer leaves before the delay", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(500);
    c.leaveRow();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([]);
  });

  it("reads the delay when the pointer arrives, so a changed setting applies to the next hover", () => {
    const c = control();
    delay = 200;
    c.enterRow();
    vi.advanceTimersByTime(200);
    expect(shown).toEqual([true]);
  });

  it("opens right away with a delay of 0", () => {
    const c = control();
    delay = 0;
    c.enterRow();
    vi.advanceTimersByTime(0);
    expect(shown).toEqual([true]);
  });

  it("closes shortly after the pointer leaves the row for somewhere else", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(1000);
    c.leaveRow();
    vi.advanceTimersByTime(LEAVE_GRACE_MS - 1);
    expect(shown).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([true, false]);
  });

  it("stays open while the pointer crosses from the row into the preview, and closes when it leaves the preview", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(1000);
    c.leaveRow();
    vi.advanceTimersByTime(50);
    c.enterPreview();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([true]);
    c.leavePreview();
    vi.advanceTimersByTime(LEAVE_GRACE_MS);
    expect(shown).toEqual([true, false]);
  });

  it("stays open when the pointer goes back from the preview to the row", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(1000);
    c.leaveRow();
    c.enterPreview();
    c.leavePreview();
    c.enterRow();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([true]);
  });

  it("closes at once on dismiss (Escape, a scroll, the row opening)", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(1000);
    c.dismiss();
    expect(shown).toEqual([true, false]);
  });

  it("cancels a pending open on dismiss", () => {
    const c = control();
    c.enterRow();
    c.dismiss();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([]);
  });

  it("does not open again while the pointer stays on the row after a dismiss", () => {
    const c = control();
    c.enterRow();
    vi.advanceTimersByTime(1000);
    c.dismiss();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([true, false]);
  });
});

describe("previewPlacement", () => {
  const viewport = { width: 1200, height: 900 };
  const row = (top: number, left = 100, width = 600) => ({ top, bottom: top + 26, left, width });

  it("sits under the row when there is room below", () => {
    const p = previewPlacement(row(100), viewport);
    expect(p.top).toBe(130);
    expect(p.bottom).toBeUndefined();
    expect(p.left).toBe(100);
    expect(p.width).toBe(600);
    expect(p.maxHeight).toBe(420);
  });

  it("sits above the row, growing upward, when the row is near the bottom of the window", () => {
    const p = previewPlacement(row(800), viewport);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(900 - 800 + 4);
    expect(p.maxHeight).toBe(420);
  });

  it("never runs past the window: its height shrinks to the room on its side", () => {
    const p = previewPlacement(row(300), { width: 1200, height: 600 });
    expect(p.top).toBe(330);
    expect(p.maxHeight).toBe(600 - 330 - 8);
  });

  it("is at least 320 wide for a narrow row and stays inside the window", () => {
    const p = previewPlacement(row(100, 1000, 120), viewport);
    expect(p.width).toBe(320);
    expect(p.left).toBe(1200 - 320 - 8);
  });

  it("is never wider than the window allows", () => {
    const p = previewPlacement(row(100, 0, 900), { width: 400, height: 900 });
    expect(p.width).toBe(400 - 16);
    expect(p.left).toBe(8);
  });
});

describe("attachPreview", () => {
  type Listener = (event: { key?: string; target?: unknown }) => void;
  let docListeners: Map<string, Listener>;
  let elListeners: Map<string, Listener>;
  let styles: Record<string, string>;
  const inside = { name: "inside the preview" };
  const el = {
    style: { setProperty: (name: string, value: string) => void (styles[name] = value), removeProperty: (name: string) => void delete styles[name] },
    contains: (node: unknown) => node === el || node === inside,
    addEventListener: (type: string, l: Listener) => void elListeners.set(type, l),
    removeEventListener: (type: string) => void elListeners.delete(type),
  };
  const rowEl = { getBoundingClientRect: () => ({ top: 100, bottom: 126, left: 100, width: 600 }) };
  const handlers = () => ({ enter: vi.fn(), leave: vi.fn(), dismiss: vi.fn() });

  beforeEach(() => {
    docListeners = new Map();
    elListeners = new Map();
    styles = {};
    popover.show.mockClear();
    popover.hide.mockClear();
    vi.stubGlobal("document", {
      addEventListener: (type: string, l: Listener) => void docListeners.set(type, l),
      removeEventListener: (type: string) => void docListeners.delete(type),
    });
    vi.stubGlobal("window", { innerWidth: 1200, innerHeight: 900 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("places the preview by the row in the top layer", () => {
    attachPreview(el, rowEl, handlers());
    expect(styles).toMatchObject({ position: "fixed", top: "130px", bottom: "auto", left: "100px", right: "auto", width: "600px", "max-height": "420px" });
    expect(popover.show).toHaveBeenCalledWith(el);
  });

  it("closes on Escape, not on another key or a scroll inside it", () => {
    const on = handlers();
    attachPreview(el, rowEl, on);
    docListeners.get("keydown")!({ key: "Enter" });
    docListeners.get("scroll")!({ target: inside });
    expect(on.dismiss).not.toHaveBeenCalled();
    docListeners.get("keydown")!({ key: "Escape" });
    expect(on.dismiss).toHaveBeenCalledTimes(1);
  });

  it("follows its row when the chat scrolls, and closes once the row has left the window", () => {
    const on = handlers();
    let top = 100;
    const moving = { getBoundingClientRect: () => ({ top, bottom: top + 26, left: 100, width: 600 }) };
    attachPreview(el, moving, on);
    const before = styles.top;
    // Paseo's own scroll while a reply streams moves the row up; the preview moves with it.
    top = 60;
    docListeners.get("scroll")!({ target: { name: "the chat" } });
    expect(on.dismiss).not.toHaveBeenCalled();
    expect(styles.top).not.toBe(before);
    top = -200;
    docListeners.get("scroll")!({ target: { name: "the chat" } });
    expect(on.dismiss).toHaveBeenCalledTimes(1);
  });

  it("reports the pointer entering and leaving the preview", () => {
    const on = handlers();
    attachPreview(el, rowEl, on);
    elListeners.get("pointerenter")!({});
    elListeners.get("pointerleave")!({});
    expect(on.enter).toHaveBeenCalledOnce();
    expect(on.leave).toHaveBeenCalledOnce();
  });

  it("takes every listener and the popover away on cleanup", () => {
    const cleanup = attachPreview(el, rowEl, handlers());
    cleanup();
    expect(docListeners.size).toBe(0);
    expect(elListeners.size).toBe(0);
    expect(popover.hide).toHaveBeenCalledOnce();
  });
});
