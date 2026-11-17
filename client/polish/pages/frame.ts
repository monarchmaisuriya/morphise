// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/html.ts
// The page frame's rules that need no DOM: its sandbox, the messages a page sends, and its height.

/**
 * The page's height at `width`, from the widths the daemon measured (at least one, sorted by width): in between, along the line between
 * the two nearest; outside, the nearest.
 */
export function heightAt(heights: ReadonlyArray<readonly [number, number]>, width: number) {
  const above = heights.findIndex(([w]) => w >= width);
  if (above <= 0) return heights.at(above)![1];
  const [w0, h0] = heights[above - 1]!;
  const [w1, h1] = heights[above]!;
  return Math.round(h0 + ((h1 - h0) * (width - w0)) / (w1 - w0));
}

/** The frame's height in the chat for a page `height` tall: at most `limit` (Settings, Page height; 0 is no limit), the rest scrolls inside. */
export const limitFrameHeight = (height: number, limit: number) => (limit > 0 ? Math.min(height, limit) : height);

/** The chat frame's sandbox. Never allow-same-origin: with it the page's scripts could reach the app's session and storage. */
export const FRAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

export interface FrameKey {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** The key a frame passed on unhandled (Esc or an app shortcut), if `data` is one. */
export function frameKey(data: unknown): FrameKey | undefined {
  const d = data as Partial<Record<keyof FrameKey | "type", unknown>> | null;
  if (d?.type !== "cp-html-key" || typeof d.key !== "string" || typeof d.code !== "string") return undefined;
  return { key: d.key, code: d.code, metaKey: d.metaKey === true, ctrlKey: d.ctrlKey === true, shiftKey: d.shiftKey === true, altKey: d.altKey === true };
}

/**
 * The app shortcut to replay for a key a focused frame passed on, or undefined. A page's script can post any key, and Paseo acts on
 * replayed ones (archive, close tab, interrupt), so only Mod+K (the Command Center) passes, Mod being Cmd on a Mac and Ctrl elsewhere.
 * The replayed event is built here, not copied from the page, so a forged `code` can't reach a shortcut matched by it.
 */
export function frameShortcut(key: FrameKey, mac: boolean): FrameKey | undefined {
  const mod = mac ? key.metaKey && !key.ctrlKey : key.ctrlKey && !key.metaKey;
  if (!mod || key.shiftKey || key.altKey || key.key.toLowerCase() !== "k" || key.code !== "KeyK") return undefined;
  return { key: "k", code: "KeyK", metaKey: mac, ctrlKey: !mac, shiftKey: false, altKey: false };
}

/** The web address a frame asked to open, if `data` is such a request for an http(s) one. */
export function frameLink(data: unknown) {
  const d = data as { type?: unknown; url?: unknown } | null;
  return d?.type === "cp-html-link" && typeof d.url === "string" && /^https?:\/\//i.test(d.url) ? d.url : undefined;
}

/** The content height (and the frame width it was measured at) a frame reports, if `data` is one. */
export function frameReport(data: unknown): { height: number; width: number } | undefined {
  const d = data as { type?: unknown; height?: unknown; width?: unknown } | null;
  if (d?.type !== "cp-html-height" || typeof d.height !== "number" || !Number.isFinite(d.height) || d.height <= 0) return undefined;
  return { height: Math.min(d.height, 20000), width: typeof d.width === "number" ? d.width : 0 };
}

/**
 * The frame's next height for a report. At one width the frame only grows: a page whose animation or live readout changes its height would
 * otherwise resize the frame every cycle, shifting the chat under the reader and, near its end, making Paseo scroll to the bottom. A new
 * width reflows the page, so the frame follows it down too, `later` (once the page settles) so a resize in progress doesn't flicker it.
 */
export function fitFrame(current: { height: number; width: number }, report: { height: number; width: number }): { height: number; later: boolean } | undefined {
  if (report.width === current.width) return report.height > current.height ? { height: report.height, later: false } : undefined;
  return { height: report.height, later: report.height < current.height };
}

export const ASK_MAX = 2000;
// A page may fill the message box at most this often: longer than a click's or keypress's user activation lasts in
// browsers (about 5 s), so one activation allows one ask at most.
export const ASK_EVERY_MS = 6000;
// The same follow-up is not added again within this time.
export const ASK_REPEAT_MS = 60_000;

/** Whether an ask may fill the message box now, given the last one that did (its time and text). */
export function askAllowed(text: string, now: number, last: { at: number; text: string } | null): boolean {
  if (!last) return true;
  if (now - last.at < ASK_EVERY_MS) return false;
  return !(text === last.text && now - last.at < ASK_REPEAT_MS);
}

/** The follow-up a page asked to put in the message box (Morphise.ask), trimmed, if `data` is one. */
export function frameAsk(data: unknown): string | undefined {
  const d = data as { type?: unknown; text?: unknown } | null;
  if (d?.type !== "cp-html-ask" || typeof d.text !== "string") return undefined;
  const text = d.text.trim().slice(0, ASK_MAX);
  return text || undefined;
}

/** The SVG a frame sent back for an export request (`id`), null when the page has none. */
export function frameSvg(data: unknown): { id: string; svg: string | null } | undefined {
  const d = data as { type?: unknown; id?: unknown; svg?: unknown } | null;
  if (d?.type !== "cp-html-svg" || typeof d.id !== "string") return undefined;
  return { id: d.id, svg: typeof d.svg === "string" && /^<svg[\s>]/.test(d.svg) ? d.svg : null };
}

/** What the chat does with a message posted to it: open a link, leave full screen, replay a shortcut, resize the frame, fill the message box, or take an exported SVG. */
export type FrameMessage =
  | { kind: "link"; url: string }
  | { kind: "escape" }
  | { kind: "shortcut"; key: FrameKey }
  | { kind: "report"; report: { height: number; width: number } }
  | { kind: "ask"; text: string }
  | { kind: "svg"; id: string; svg: string | null };

/**
 * The chat's answer to a message, or undefined to ignore it. Only the page's own frame is heard (`own`). Its script can post whenever
 * it likes, so only a page the reader is using (its frame has focus) opens links or passes keys on; a height report counts either way.
 * An ask also needs the chat's own user activation (`activated`: a click in the frame activates the chat around it), so a page can't
 * fill the message box on its own; how often is the caller's to limit (ASK_EVERY_MS). It never sends anything.
 */
export function frameMessage(data: unknown, from: { own: boolean; focused: boolean; mac: boolean; activated?: boolean }): FrameMessage | undefined {
  if (!from.own) return undefined;
  const ask = frameAsk(data);
  if (ask) return from.focused && from.activated === true ? { kind: "ask", text: ask } : undefined;
  const svg = frameSvg(data);
  if (svg) return { kind: "svg", ...svg };
  const url = frameLink(data);
  if (url) return from.focused ? { kind: "link", url } : undefined;
  const key = frameKey(data);
  if (key) {
    if (!from.focused) return undefined;
    if (key.key === "Escape") return { kind: "escape" };
    const shortcut = frameShortcut(key, from.mac);
    return shortcut && { kind: "shortcut", key: shortcut };
  }
  const report = frameReport(data);
  return report && { kind: "report", report };
}

/** A page's source as a short key (its length and FNV-1a hash), so a long-lived map holds no copy of the page. */
function pageKey(html: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < html.length; i++) hash = Math.imul(hash ^ html.charCodeAt(i), 0x01000193);
  return `${html.length}:${(hash >>> 0).toString(36)}`;
}

/** A value per page source for the `limit` most recently used pages; older ones are dropped. */
export function recentPages<V>(limit: number) {
  const values = new Map<string, V>();
  return {
    get(html: string): V | undefined {
      const key = pageKey(html);
      const value = values.get(key);
      if (value !== undefined) {
        values.delete(key);
        values.set(key, value);
      }
      return value;
    },
    set(html: string, value: V) {
      const key = pageKey(html);
      values.delete(key);
      values.set(key, value);
      if (values.size > limit) values.delete(values.keys().next().value!);
    },
  };
}
