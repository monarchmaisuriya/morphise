// Line numbers and stripes for hover previews (Chat settings, Hover previews).

/** Every other line is shaded, starting with the second, so the first line sits on the plain background. */
export const striped = (index: number, stripes: boolean) => stripes && index % 2 === 1;

/** Lines with their number and shading, for a part of a text that starts `from` lines in. */
export function numberedLines(lines: readonly string[], from: number, stripes: boolean) {
  return lines.map((text, i) => ({ n: from + i + 1, text, shaded: striped(from + i, stripes) }));
}
