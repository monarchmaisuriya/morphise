// Paseo themes have no blue or purple, so these two hues are fixed; both read on light and dark.
export const BLUE = "#4c8dff";
export const PURPLE = "#a371f7";
// Done is drawn faint, so the theme's success green reads as a dim grey-green.
export const DONE_OPACITY = 0.45;

type StatusColors = { statusWarning: string; statusDanger: string; statusSuccess: string; foreground: string };
type Status = "needs_input" | "failed" | "running" | "attention" | "done";

// One colour per status, used wherever a status is drawn: waiting on you amber, failed red,
// running white, finished but unread blue, done green (drawn at DONE_OPACITY).
export function statusColor(colors: StatusColors, status: Status): string {
  if (status === "needs_input") return colors.statusWarning;
  if (status === "failed") return colors.statusDanger;
  if (status === "running") return colors.foreground;
  if (status === "attention") return BLUE;
  return colors.statusSuccess;
}
