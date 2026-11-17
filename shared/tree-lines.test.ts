import { describe, expect, it } from "vitest";
import { branchSegments } from "./tree-lines";

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
