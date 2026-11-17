import { describe, expect, it } from "vitest";
import { branchSegments, parentStem } from "./tree-lines";

const place = { x: 23, to: 32, middle: 15 };

describe("branchSegments", () => {
  it("runs a row that is not the last straight down and tees into its status slot at its middle", () => {
    expect(branchSegments(place, false)).toEqual([
      { kind: "down", left: 23 },
      { kind: "tee", left: 23, top: 14, width: 9 },
    ]);
  });

  it("turns the line into the last row with the elbow, ending at the same point as the tees", () => {
    expect(branchSegments(place, true)).toEqual([{ kind: "turn", left: 23, width: 9, height: 15 }]);
  });

  it("meets a short Show row at its own middle", () => {
    expect(branchSegments({ ...place, middle: 14 }, false)[1]).toEqual({ kind: "tee", left: 23, top: 13, width: 9 });
  });
});

describe("parentStem", () => {
  it("starts the line just under a one-line parent's centred dot, under that dot", () => {
    expect(parentStem({ x: 39, inset: 8, dotFromTop: null })).toEqual({ left: 31, top: "50%", marginTop: 5.5 });
  });

  it("starts it under a two-line parent's dot on the title line", () => {
    expect(parentStem({ x: 23, inset: 8, dotFromTop: 16 })).toEqual({ left: 15, top: 16, marginTop: 5.5 });
  });
});
