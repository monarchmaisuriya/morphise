import { describe, expect, it } from "vitest";
import { openAfterSwap } from "./list-move";

describe("openAfterSwap", () => {
  it("keeps the open editor on its item when that item moves", () => {
    expect(openAfterSwap(0, 0, 1)).toBe(1);
    expect(openAfterSwap(1, 1, 0)).toBe(0);
  });

  it("keeps the open editor on its item when the item beside it moves past it", () => {
    // Items [A, B], B open, A moves down: B is now at 0.
    expect(openAfterSwap(1, 0, 1)).toBe(0);
    // Items [A, B], A open, B moves up: A is now at 1.
    expect(openAfterSwap(0, 1, 0)).toBe(1);
  });

  it("leaves an editor alone when neither swapped item is open", () => {
    expect(openAfterSwap(2, 0, 1)).toBe(2);
    expect(openAfterSwap(null, 0, 1)).toBe(null);
  });
});
