import { describe, expect, it } from "vitest";
import { alignColumns, cellRange, rangeHas, selectionText, tableMarkdown } from "./table-copy";

const GRID = [
  ["Route", "p95", "Calls"],
  ["/api/billing", "412 ms", "18,204"],
  ["/api/users", "238 ms", "94,551"],
  ["/api/search", "201 ms", "61,032"],
];

describe("cellRange", () => {
  it("spans the rectangle between two cells whichever corner the drag started from", () => {
    expect(cellRange({ row: 3, column: 2 }, { row: 1, column: 0 })).toEqual({ top: 1, left: 0, bottom: 3, right: 2 });
  });
});

describe("alignColumns", () => {
  it("gives every range the columns of the range drawn last", () => {
    const ranges = [cellRange({ row: 1, column: 0 }, { row: 1, column: 2 }), cellRange({ row: 3, column: 1 }, { row: 3, column: 1 })];
    expect(alignColumns(ranges)).toEqual([
      { top: 1, left: 1, bottom: 1, right: 1 },
      { top: 3, left: 1, bottom: 3, right: 1 },
    ]);
  });

  it("leaves a single range as drawn", () => {
    const ranges = [cellRange({ row: 1, column: 0 }, { row: 2, column: 2 })];
    expect(alignColumns(ranges)).toEqual(ranges);
  });
});

describe("rangeHas", () => {
  it("holds the cells inside any range and nothing else", () => {
    const ranges = [cellRange({ row: 1, column: 0 }, { row: 2, column: 1 })];
    expect(rangeHas(ranges, 2, 1)).toBe(true);
    expect(rangeHas(ranges, 3, 1)).toBe(false);
    expect(rangeHas(ranges, 1, 2)).toBe(false);
  });
});

describe("tableMarkdown", () => {
  it("writes the header row, the separator and every body row", () => {
    expect(tableMarkdown(GRID)).toBe(
      ["| Route | p95 | Calls |", "| --- | --- | --- |", "| /api/billing | 412 ms | 18,204 |", "| /api/users | 238 ms | 94,551 |", "| /api/search | 201 ms | 61,032 |"].join("\n"),
    );
  });

  it("escapes pipes, keeps each cell on one line and fills short rows", () => {
    expect(tableMarkdown([["a", "b"], ["x | y", " two\n  lines "], ["only"]])).toBe(["| a | b |", "| --- | --- |", "| x \\| y | two lines |", "| only |  |"].join("\n"));
  });
});

describe("selectionText", () => {
  it("copies one cell as its own text, unescaped", () => {
    expect(selectionText([["a"], ["x | y"]], [cellRange({ row: 1, column: 0 }, { row: 1, column: 0 })])).toBe("x | y");
  });

  it("copies a dragged 2x2 block as a Markdown table under those columns' header", () => {
    expect(selectionText(GRID, [cellRange({ row: 2, column: 2 }, { row: 1, column: 1 })])).toBe(["| p95 | Calls |", "| --- | --- |", "| 412 ms | 18,204 |", "| 238 ms | 94,551 |"].join("\n"));
  });

  it("lists added ranges in table order under the columns of the range drawn last", () => {
    const ranges = [cellRange({ row: 3, column: 0 }, { row: 3, column: 2 }), cellRange({ row: 1, column: 0 }, { row: 1, column: 0 })];
    expect(selectionText(GRID, ranges)).toBe(["| Route |", "| --- |", "| /api/billing |", "| /api/search |"].join("\n"));
  });

  it("copies nothing for no ranges", () => {
    expect(selectionText(GRID, [])).toBe("");
  });
});
