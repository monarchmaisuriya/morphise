import type { Indicator } from "./profile";

// Statuses that mean a chat is waiting on the user: a permission request, a failure, or a
// finished turn not looked at yet.
export const NEEDS_ME: readonly Indicator[] = ["needs_input", "failed", "attention"];

export const needsAttention = (indicator: Indicator) => NEEDS_ME.includes(indicator);

export function needsMeOn(statuses: readonly Indicator[]): boolean {
  return statuses.length === NEEDS_ME.length && NEEDS_ME.every((indicator) => statuses.includes(indicator));
}

// The workspace after the open one, in view order, wrapping around; null when there is nowhere
// else to go.
export function nextAttention<Ref extends { key: string }>(refs: readonly Ref[], activeKey: string | null): Ref | null {
  const index = refs.findIndex((ref) => ref.key === activeKey);
  const next = refs[(index + 1) % refs.length];
  return next && next.key !== activeKey ? next : null;
}

// The workspaces needing attention in the order the view shows them, each once.
export function attentionOrder<Ref extends { key: string }>(sections: readonly { items: readonly Ref[] }[], waiting: ReadonlySet<string>): Ref[] {
  const seen = new Set<string>();
  const order: Ref[] = [];
  for (const section of sections) {
    for (const ref of section.items) {
      if (waiting.has(ref.key) && !seen.has(ref.key)) {
        seen.add(ref.key);
        order.push(ref);
      }
    }
  }
  return order;
}
