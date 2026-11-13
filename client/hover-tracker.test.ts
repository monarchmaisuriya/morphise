import { describe, expect, it } from "vitest";
import { createHoverTracker } from "./hover-tracker";

describe("createHoverTracker", () => {
  it("hovers the item a move passed through on its way to the list", () => {
    const tracker = createHoverTracker();
    tracker.mark("a");
    tracker.settle();
    expect(tracker.get()).toBe("a");
  });

  it("drops a stale hover on the next move over no item, though that item never heard the pointer leave", () => {
    const tracker = createHoverTracker();
    tracker.mark("a");
    tracker.settle();
    // The list re-sorted under the pointer; the next move lands on a heading or empty space.
    tracker.settle();
    expect(tracker.get()).toBeNull();
  });

  it("hovers one item at a time", () => {
    const tracker = createHoverTracker();
    tracker.mark("a");
    tracker.settle();
    tracker.mark("b");
    tracker.settle();
    expect(tracker.get()).toBe("b");
  });

  it("clears when the pointer leaves the list, and tells listeners only on a change", () => {
    const tracker = createHoverTracker();
    let calls = 0;
    const stop = tracker.subscribe(() => calls++);
    tracker.mark("a");
    tracker.settle();
    tracker.mark("a");
    tracker.settle();
    tracker.clear();
    expect(tracker.get()).toBeNull();
    expect(calls).toBe(2);
    stop();
  });
});
