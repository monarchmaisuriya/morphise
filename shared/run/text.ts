// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/shared/text.ts
import { HIDDEN_CHARACTERS } from "../hidden-text";

// The last path segment, for either slash style; the client has no node:path.
export function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

// Errors cross a realm boundary in tests and an RPC boundary in the app, so `instanceof Error` is not reliable.
export function errorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
}

// What `/run <args>` runs: one leading "$ " or "! " that people paste along with the command goes.
export function commandFromArgs(args: string): string {
  return args
    .trim()
    .replace(/^[!$](\s+|$)/, "")
    .trim();
}

// Things worth a second look before pressing Run, in plain words. Pattern checks, not a
// shell parser: they catch the common forms, not every disguise.
const AT_COMMAND = String.raw`(?:^|[;&|(\x60]|\bsudo\s+(?:-\S+\s+)*|\bxargs\s+(?:-\S+\s+)*)\s*`;
export const LONG_OR_PADDED = "is long or padded; read all of it";
// PowerShell names are case-insensitive, so its patterns are too.
const RISKS: Array<[RegExp, string]> = [
  // Text past the edge of the box, after a wide gap, or far below can hide a second command: a line over 200
  // characters, 20 or more spaces of any kind (no-break, em, ideographic) or tabs between words (indentation is
  // fine), or more than 40 lines. First, as the button shows only the first risk, and the others may sit in the
  // part that does not show.
  [/^[^\n]{201}|\S[\t\p{Zs}]{20,}\S|(?:\n[^\n]*){40}/mu, LONG_OR_PADDED],
  [new RegExp(String.raw`(?:^|[;&|(\x60])\s*sudo\b`, "m"), "runs as administrator (sudo)"],
  [/\bStart-Process\b[^\n]*\s-Verb\s+['"]?RunAs\b|(?:^|[;&|(])\s*runas(\.exe)?\s/im, "runs as administrator"],
  [new RegExp(String.raw`${AT_COMMAND}rm\s|\bfind\b[^\n]*\s-delete\b|\bgit\s+clean\s+-\w*f`, "m"), "deletes files"],
  [new RegExp(String.raw`${AT_COMMAND}(?:Remove-Item|del|erase|rd|rmdir)(?:\s|$)`, "im"), "deletes files"],
  [
    /\bgit\s+reset\s+--hard\b|\bgit\s+checkout\s+(--\s+)?\.(\s|$)|\bgit\s+restore\s+(?!--staged\b)\S|\bgit\s+stash\s+(drop|clear)\b/m,
    "throws away uncommitted changes",
  ],
  [/\bgit\s+push\b[^\n;&|]*?\s(--force(-with-lease|-if-includes)?\b|-[a-zA-Z]*f[a-zA-Z]*\b|\+\S)/, "force-pushes"],
  [
    /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+(-\S+\s+)*)?(\S*\/)?((ba|z|da|k|fi)?sh|python3?|node|ruby|perl)\b|\b(ba|z)?sh\b[^\n]*<\(\s*(curl|wget)\b|\b(ba|z)?sh\s+-c\s+["']?\$\(\s*(curl|wget)\b/,
    "runs a script from the internet",
  ],
  [
    /\b(irm|iwr|Invoke-RestMethod|Invoke-WebRequest|curl|wget)\b[^\n]*\|\s*(iex|Invoke-Expression)\b|\b(iex|Invoke-Expression)\b[^\n]*\b(irm|iwr|Invoke-RestMethod|Invoke-WebRequest|DownloadString)\b/i,
    "runs a script from the internet",
  ],
  // Text a reply can use to show one command while another runs (the "Trojan Source" trick).
  [HIDDEN_CHARACTERS, "contains hidden characters, so what runs may differ from what shows"],
];

export function risksOf(script: string): string[] {
  return [...new Set(RISKS.filter(([pattern]) => pattern.test(script)).map(([, risk]) => risk))];
}

// A risk as the confirm words it: a long or padded command also gives its size, a number that shows
// even when the text past the edge does not.
export function describeRisk(risk: string, command: string): string {
  if (risk !== LONG_OR_PADDED) return risk;
  const lines = command.split("\n").length;
  return `${risk} (${lines} ${lines === 1 ? "line" : "lines"}, ${command.length.toLocaleString("en-US")} characters)`;
}

// A command's first line, cut to fit one line of a message or toast.
export function shortCommand(command: string, max = 48): string {
  const [first, ...rest] = command.split("\n");
  if (first.length > max) return `${first.slice(0, max - 1).trimEnd()}…`;
  return rest.length > 0 ? `${first} …` : first;
}
