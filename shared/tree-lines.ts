// The pieces of line that hang one sidebar row off its parent's line. `x`: where the line runs; `to`: where the row's
// status slot starts; `middle`: the row's middle, from its top. Every row reaches its slot: the last with an elbow,
// rounded or square per the Line corners setting (the line ends there), every other row with a tee off a line that runs on past it. The tee sits one pixel
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

// Half the status dot (7 px), and the space left between the dot and the line that comes out of it.
const DOT_RADIUS = 3.5;
const STEM_GAP = 2;

// The line out of a parent row's dot, from just under the dot to the row's bottom, where its first child's line
// starts: so the children's line reads as coming from the parent. `x`: where the children's line runs, in the list's
// coordinates; the row sits `inset` in from them. `dotFromTop`: the dot's centre from the row's top, or null when the
// row centres it.
export function parentStem({ x, inset, dotFromTop }: { x: number; inset: number; dotFromTop: number | null }): { left: number; top: number | "50%"; marginTop: number } {
  return { left: x - inset, top: dotFromTop ?? "50%", marginTop: DOT_RADIUS + STEM_GAP };
}
