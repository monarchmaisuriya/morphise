// Where a dragged card lands, from the places the board's cards had when it was lifted. A task is drawn once per lane it
// falls in (rows by label draw a task with two labels twice), so every drawn copy has a place of its own.
import { type BoardColumn, type DropTarget, dropTarget, type Frame } from "../../shared/board";

/** One drawn copy of a card: its lane and its task. */
export const copyKey = (laneKey: string, taskId: string) => JSON.stringify([laneKey, taskId]);

/** A drop target, with the lane of the copy it lands before (null at the column's end), where the gap opens. */
export interface CopyTarget extends DropTarget {
  lane: string | null;
}

interface Places {
  columns: ReadonlyMap<string, Frame>;
  // By copyKey.
  cards: ReadonlyMap<string, Frame>;
}

interface Options {
  // The lifted task's copies close while it is dragged (manual order), so the cards below each move up.
  closes: boolean;
  gap: number;
  stack: "horizontal" | "vertical";
  // A place moved by the outer scroller's scrolling since the lift, and how far a column has scrolled down since.
  outer(frame: Frame): Frame;
  down(columnId: string): number;
}

/**
 * The target under `pointer` while `taskId` is dragged: every other drawn copy at its measured place, moved by any
 * scrolling since and by the closed copies of the lifted task above it. The gap that opens at the target is left out,
 * so it cannot move the target it shows.
 */
export function boardDropTarget(columns: BoardColumn[], places: Places, taskId: string, pointer: { x: number; y: number }, options: Options): CopyTarget | null {
  const copies = new Map<string, { lane: string; taskId: string }>();
  const shown = columns.flatMap((entry) => {
    const frame = places.columns.get(entry.column.id);
    if (!frame) return [];
    const drawn = entry.lanes.flatMap((lane) => lane.tasks.map((task) => ({ key: copyKey(lane.key, task.id), lane: lane.key, taskId: task.id })));
    const closed = options.closes ? drawn.flatMap((copy) => (copy.taskId === taskId ? places.cards.get(copy.key) ?? [] : [])) : [];
    const down = options.down(entry.column.id);
    const cards = drawn.flatMap((copy) => {
      const card = copy.taskId === taskId ? undefined : places.cards.get(copy.key);
      if (!card) return [];
      copies.set(copy.key, copy);
      const up = closed.reduce((sum, lifted) => sum + (card.y > lifted.y ? lifted.height + options.gap : 0), 0);
      const moved = options.outer(card);
      return [{ id: copy.key, frame: { ...moved, y: moved.y - down - up } }];
    });
    return [{ id: entry.column.id, frame: options.outer(frame), cards }];
  });
  const target = dropTarget(shown, pointer.x, pointer.y, options.stack);
  if (!target) return null;
  const before = target.before === null ? undefined : copies.get(target.before);
  return { column: target.column, before: before?.taskId ?? null, lane: before?.lane ?? null };
}
