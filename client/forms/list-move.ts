// Which item's editor is open after the items at `index` and `target` swap places. The editor
// follows its item, so the row whose item changed never keeps an open editor: rows are keyed by
// position and text inputs read their value once, so a kept editor would show (and save) the
// other item's text.
export function openAfterSwap(open: number | null, index: number, target: number): number | null {
  if (open === index) return target;
  if (open === target) return index;
  return open;
}
