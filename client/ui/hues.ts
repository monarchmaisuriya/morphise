// Paseo themes have no blue or purple, so these two hues are fixed; both read on light and dark.
export const BLUE = "#4c8dff";
export const PURPLE = "#a371f7";
// Done is gray: the theme's muted text colour, drawn faint in the sidebar (as in 0.7).
export const DONE_OPACITY = 0.6;

type StatusColors = { statusWarning: string; statusDanger: string; foregroundMuted: string; foreground: string };
type Status = "needs_input" | "failed" | "running" | "attention" | "done";

// One colour per status, used wherever a status is drawn: waiting on you amber, failed red,
// running white, finished but unread blue, done gray (drawn at DONE_OPACITY in the sidebar).
export function statusColor(colors: StatusColors, status: Status): string {
  if (status === "needs_input") return colors.statusWarning;
  if (status === "failed") return colors.statusDanger;
  if (status === "running") return colors.foreground;
  if (status === "attention") return BLUE;
  return colors.foregroundMuted;
}
