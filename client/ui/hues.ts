// Paseo themes have no blue or purple, so these two hues are fixed; both read on light and dark.
export const BLUE = "#4c8dff";
export const PURPLE = "#a371f7";
// Done is a dark grey-green: quieter than the theme's success green, which marks passing checks.
export const DONE_GREEN = "#264a33";

type StatusColors = { statusWarning: string; statusDanger: string; foreground: string };
type Status = "needs_input" | "failed" | "running" | "attention" | "done";

// One colour per status, used wherever a status is drawn: waiting on you amber, failed red,
// running white, finished but unread blue, done dark green.
export function statusColor(colors: StatusColors, status: Status): string {
  if (status === "needs_input") return colors.statusWarning;
  if (status === "failed") return colors.statusDanger;
  if (status === "running") return colors.foreground;
  if (status === "attention") return BLUE;
  return DONE_GREEN;
}
