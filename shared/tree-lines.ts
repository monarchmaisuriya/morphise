// The pieces of line that hang one sidebar row off its parent's line. `x`: where the line runs; `to`: where the row's
// status slot starts; `middle`: the row's middle, from its top. Every row reaches its slot: the last with a rounded
// elbow (the line ends there), every other row with a tee off a line that runs on past it. The tee sits one pixel
// above `middle` so it lines up with the elbow's bottom border, the last pixel row of a box `middle` high.
export type BranchSegment =
  | { kind: "down"; left: number }
  | { kind: "tee"; left: number; top: number; width: number }
  | { kind: "turn"; left: number; width: number; height: number };

export function branchSegments({ x, to, middle }: { x: number; to: number; middle: number }, last: boolean): BranchSegment[] {
  if (last) return [{ kind: "turn", left: x, width: to - x, height: middle }];
  return [
    { kind: "down", left: x },
    { kind: "tee", left: x, top: middle - 1, width: to - x },
  ];
}
