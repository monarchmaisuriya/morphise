import { lastMessagePreview, messagePreview } from "../shared/sidebar-message";

export interface PreviewTimeline {
  refetch(options: { direction: "tail"; limit: number }): Promise<{ entries: readonly unknown[] }>;
  subscribe(handler: (update: unknown) => void): (() => void) & { ready?: Promise<unknown> };
}
export type MessagePreviewState = { status: "loading" | "ready" | "failed"; text: string | null };

const record = (value: unknown) => typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

export function observeMessagePreview(timeline: PreviewTimeline, publish: (state: MessagePreviewState) => void) {
  let alive = true, generation = 0, live = 0, latestSeq = -1;
  const fail = () => { if (alive) publish({ status: "failed", text: null }); };
  const load = () => {
    const request = ++generation, seen = live;
    publish({ status: "loading", text: null });
    void timeline.refetch({ direction: "tail", limit: 100 }).then((page) => {
      const pageSeq = page.entries.reduce<number>((latest, entry) => { const value = record(entry); return messagePreview(value?.item) && typeof value?.seq === "number" ? Math.max(latest, value.seq) : latest; }, -1);
      if (alive && generation === request && (live === seen || pageSeq > latestSeq)) {
        latestSeq = pageSeq;
        publish({ status: "ready", text: lastMessagePreview(page.entries) });
      }
    }, () => { if (generation === request && live === seen) fail(); });
  };
  const unsubscribe = timeline.subscribe((update) => {
    if (!alive) return;
    const event = record(record(update)?.event);
    if (event?.type === "error") { generation++; live++; fail(); return; }
    if (event?.type === "replacement" || event?.type === "subscription_restored") { latestSeq = -1; live++; load(); return; }
    if (event?.type !== "timeline") return;
    const text = messagePreview(event.item);
    if (text) {
      const seq = record(update)?.seq;
      if (typeof seq !== "number") { load(); return; }
      if (seq < latestSeq) return;
      latestSeq = seq; live++; publish({ status: "ready", text });
    }
  });
  if (unsubscribe.ready) void unsubscribe.ready.then(() => { if (alive) load(); }, fail);
  else load();
  return () => { alive = false; generation++; unsubscribe(); };
}
