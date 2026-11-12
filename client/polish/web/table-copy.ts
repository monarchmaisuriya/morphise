// Ported from Better Paseo (RoundRedDot/better-paseo, MIT, see NOTICE.md): client/components/markdown/render/table-range.ts
// Which cells a table selection holds and what it copies, apart from the DOM. A table is read as rows of cell text; row 0 is the header.

/** A cell by row and column; row 0 is the header. */
export interface CellPos {
  row: number;
  column: number;
}

/** The rectangle between the cell a range began on and the one it reached; a selection holds one or more. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type Grid = ReadonlyArray<ReadonlyArray<string>>;

export function cellRange(anchor: CellPos, focus: CellPos): CellRange {
  return {
    top: Math.min(anchor.row, focus.row),
    left: Math.min(anchor.column, focus.column),
    bottom: Math.max(anchor.row, focus.row),
    right: Math.max(anchor.column, focus.column),
  };
}

export const sameCell = (a: CellPos, b: CellPos) => a.row === b.row && a.column === b.column;

/**
 * Ranges added beside each other take the columns of the last one, the range being drawn or drawn most recently, so rows picked
 * apart line up under it.
 */
export function alignColumns(ranges: readonly CellRange[]): readonly CellRange[] {
  if (ranges.length < 2) return ranges;
  const { left, right } = ranges[ranges.length - 1]!;
  return ranges.map((range) => ({ ...range, left, right }));
}

export function rangeHas(ranges: readonly CellRange[], row: number, column: number): boolean {
  return ranges.some((range) => row >= range.top && row <= range.bottom && column >= range.left && column <= range.right);
}

/** A cell's text as a Markdown table cell: one line, `|` escaped. */
const markdownCell = (text: string) => text.replace(/\s*\n\s*/g, " ").trim().replace(/\|/g, "\\|");

function markdownTable(grid: Grid, rows: readonly number[], columns: readonly number[]): string {
  const line = (row: number) => `| ${columns.map((column) => markdownCell(grid[row]?.[column] ?? "")).join(" | ")} |`;
  return [line(0), `| ${columns.map(() => "---").join(" | ")} |`, ...rows.filter((row) => row > 0).map(line)].join("\n");
}

/** The whole table as Markdown: header row, separator, then every body row. */
export function tableMarkdown(grid: Grid): string {
  const width = Math.max(0, ...grid.map((row) => row.length));
  return markdownTable(
    grid,
    grid.map((_, row) => row),
    Array.from({ length: width }, (_, column) => column),
  );
}

/**
 * What a selection copies. One cell copies its text. Several copy a Markdown table of the rows and columns the ranges cover, in the
 * table's order; a Markdown table cannot start without its header, so the selected columns' header leads even when no range reaches it.
 */
export function selectionText(grid: Grid, ranges: readonly CellRange[]): string {
  const aligned = alignColumns(ranges);
  const rows = new Set<number>();
  const columns = new Set<number>();
  for (const range of aligned) {
    for (let row = range.top; row <= range.bottom; row++) rows.add(row);
    for (let column = range.left; column <= range.right; column++) columns.add(column);
  }
  const byOrder = (a: number, b: number) => a - b;
  const rowList = [...rows].sort(byOrder);
  const columnList = [...columns].sort(byOrder);
  if (rowList.length === 0) return "";
  if (rowList.length === 1 && columnList.length === 1) return (grid[rowList[0]!]?.[columnList[0]!] ?? "").trim();
  return markdownTable(grid, rowList, columnList);
}
