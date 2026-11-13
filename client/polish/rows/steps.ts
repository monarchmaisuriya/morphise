// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): client/steps.ts
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { isTurnTrigger } from "../../../shared/chat-view";
import { isHtmlTool } from "../../../shared/polish/html";
import { translate, type Language } from "../../../shared/polish/i18n";
import type { AgentTimelineItem } from "../agent-types";
import { imageOnly } from "./model";

// Merged steps: each run of consecutive thoughts and tool calls between replies folds into one row.
// A transformer sees one item at a time, so the runs come from each open agent's own timeline (fetched
// and followed live); the transformer looks its item up here: the run's first step becomes the merged
// row, the others are removed from the list (never hidden in place: that crashed Paseo's virtual list).

type Item = AgentTimelineItem;
export type Phase = "streaming" | "complete";
/** A timeline item and when it last changed (ms). */
export interface Entry {
  item: Item;
  /** Unknown when restored history supplies an import time instead of the event time. */
  at?: number;
  /** The daemon's turn id, when it has one: an agent's message steered into a running turn belongs to that turn. */
  turn?: string;
}
export interface Run {
  steps: Item[];
  /** From the end of what came before the run to the last step's latest update. */
  ms?: number;
  /** Nothing has come after the run yet: while the agent works, its next step may still join. */
  open: boolean;
}

const toolName = (item: Extract<Item, { type: "tool_call" }>) => item.name.trim().replace(/[.\s-]+/g, "_").toLowerCase();
// What the app does before any plugin sees a call: these become its todo list (so they end a run like other items)...
const TODO_TOOLS = new Set(["todowrite", "todo_write", "update_plan"]);
// ...and Claude's task tools are dropped outright. The daemon timeline still has them, so a run must pass over them, or a run
// headed by one would never render (its head is never transformed while the rest are removed).
const DROPPED_TOOLS = new Set(["taskcreate", "taskupdate", "tasklist"]);
export const droppedByApp = (item: Item) => item.type === "tool_call" && DROPPED_TOOLS.has(toolName(item));
/** A todo-list update: the daemon's own todo items, or the calls the app turns into one. */
export const isTodo = (item: Item) => item.type === "todo" || (item.type === "tool_call" && TODO_TOOLS.has(toolName(item)));

type Task = Extract<Item, { type: "todo" }>["items"][number];
const taskStatus = (t: Task) => t.status ?? (t.completed ? "completed" : "pending");

/** What a todo update changed, the way Paseo words its own task rows: the first list is "created", then tasks are added, started or completed. */
export type TaskChange = { type: "created"; count: number } | { type: "added" | "started" | "completed"; text: string };
export function taskChanges(before: readonly Task[], after: readonly Task[]): TaskChange[] {
  if (!before.length) return after.length ? [{ type: "created", count: after.length }] : [];
  const key = (t: Task, i: number) => t.id ?? `${i}:${t.text}`;
  const prior = new Map(before.map((t, i) => [key(t, i), t]));
  return after.flatMap((t, i): TaskChange[] => {
    const was = prior.get(key(t, i));
    if (!was) return [{ type: "added", text: t.text }];
    const now = taskStatus(t);
    if (now === taskStatus(was)) return [];
    return now === "completed" ? [{ type: "completed", text: t.text }] : now === "in_progress" ? [{ type: "started", text: t.text }] : [];
  });
}

export { isTurnTrigger };

/** The id a step has both in the app and in the daemon's timeline: tool calls by callId, thoughts (which carry none) by their opening words,
 * todo updates (which carry none either) by their list. Plans, todo-list calls, agent messages and heartbeats aren't steps: they stand on their own.
 * Nor are sub-agent calls: Morphise leaves them to Paseo, whose row links to the sub-agent's chat. */
export function stepKey(item: Item): string | undefined {
  if (item.type === "todo") return `d:${item.items.map((t) => `${taskStatus(t)} ${t.text}`).join("\n")}`;
  if (item.type === "tool_call") {
    const name = toolName(item);
    // An html_render call never joins a run: once it completes it shows as a page, content like a reply.
    if (item.detail.type === "plan" || item.detail.type === "sub_agent" || TODO_TOOLS.has(name) || isTurnTrigger(item) || DROPPED_TOOLS.has(name) || isHtmlTool(item.name)) return undefined;
    return `t:${item.callId}`;
  }
  // Replies are steps only when Collapse turns folds them (see stepRuns); like thoughts they carry no id in every provider.
  if (item.type !== "reasoning" && item.type !== "assistant_message") return undefined;
  const reply = item.type === "assistant_message";
  // A reply is keyed once complete, so it can take more words: screenshots share their first 80 characters (the attachment folder).
  const words = item.text.replace(/\s+/g, " ").trim().slice(0, reply ? 400 : 80);
  return words ? `${reply ? "m" : "r"}:${words}` : undefined;
}

/** Folds a live timeline event into an agent's list the way the daemon's projection does: tool updates replace their call, thought chunks
 * extend the thought before. Returns false when the runs can't have changed (a reply chunk after a reply), so streaming text costs nothing. */
export function applyItem(list: Entry[], item: Item, at: number, turn?: string): boolean {
  const last = list.at(-1);
  if (item.type === "tool_call") {
    const i = list.findLastIndex((e) => e.item.type === "tool_call" && e.item.callId === item.callId);
    if (i < 0) return (list.push({ item, at, turn }), true);
    const old = list[i]!;
    const call = old.item as typeof item;
    list[i] = { ...old, item: { ...call, ...item, detail: item.detail.type === "unknown" ? call.detail : item.detail }, at };
  } else if (item.type === "reasoning" && last?.item.type === "reasoning") {
    list[list.length - 1] = { ...last, item: { type: "reasoning", text: last.item.text + item.text }, at };
  } else if (item.type === "assistant_message" && last?.item.type === "assistant_message") {
    // One entry per reply (with the time of the latest chunk). Its text keys it when Collapse turns folds it; a reply that is still
    // streaming is the turn's last, so its runs can't have changed.
    list[list.length - 1] = { ...last, item: { ...last.item, text: last.item.text + item.text }, at };
    return false;
  } else list.push({ item, at, turn });
  return true;
}

const timestampMs = (timestamp: string | undefined) => {
  const at = Date.parse(timestamp ?? "");
  return Number.isFinite(at) ? at : undefined;
};

/** Restored events cannot belong after their next prompt or the idle agent's last update.
 * Keep their content, but leave timing unknown rather than measuring the gap to the import date. */
export function historyEntries(entries: readonly { item: Item; timestamp: string; turnId?: string }[], endedAt?: string): Entry[] {
  let ceiling = timestampMs(endedAt);
  const list: Entry[] = entries.map(({ item, timestamp, turnId }) => ({ item, at: timestampMs(timestamp), turn: turnId }));
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i]!;
    if (entry.at === undefined) continue;
    if (ceiling !== undefined && entry.at > ceiling) entry.at = undefined;
    if (entry.item.type === "user_message" && entry.at !== undefined) ceiling = entry.at;
  }
  return list;
}

/** Paseo's rule: turn ids decide when both rows have one; without them a prompt or another agent's message starts a turn. */
const continuesTurn = (prev: Entry, next: Entry) =>
  prev.turn !== undefined && next.turn !== undefined ? prev.turn === next.turn : !(next.item.type === "user_message" || isTurnTrigger(next.item));

/** Runs of consecutive steps; anything else ends a run, and items `skip` names (hidden by prefs) are passed over. Todo updates join a run but
 * never make one: a run of only todo updates isn't a run, so those stand on their own. With `replies` (Paseo's Collapse turns) a reply the
 * agent wrote another after, in the same turn, is a step too, so a turn folds into one row before its last reply, like Paseo's summary.
 * Items `breaks` names are drawn as rows of their own between steps (plan updates as the steps card), so they end a run like a reply:
 * passed over, they would gather under the run's merged row, away from the work around them. */
export function stepRuns(list: readonly Entry[], skip: (item: Item) => boolean, replies = foldReplies, breaks: (item: Item) => boolean = breakRun): Run[] {
  const folded = new Set<number>();
  let later = false;
  for (let i = list.length - 1; replies && i >= 0; i--) {
    const { item } = list[i]!;
    if (i + 1 < list.length && !continuesTurn(list[i]!, list[i + 1]!)) later = false;
    if (item.type === "assistant_message") {
      // Tool screenshots reach the chat as image-only messages: pictures of a step, not replies, so they fold in and fold nothing.
      if (later || imageOnly(item.text)) folded.add(i);
      later ||= !imageOnly(item.text);
    }
  }
  const runs: Run[] = [];
  let run: Item[] = [];
  let start: number | undefined;
  let end: number | undefined;
  let timed = true;
  const close = (open = false) => {
    if (run.some((s) => s.type !== "todo")) runs.push({ steps: run, ms: timed && start !== undefined && end !== undefined ? end - start : undefined, open });
    run = [];
    start = end = undefined;
    timed = true;
  };
  let lastTodo: string | undefined;
  for (const [i, { item, at }] of list.entries()) {
    if (droppedByApp(item) || skip(item)) continue;
    if (breaks(item)) {
      close();
      continue;
    }
    // An agent can send the same list again; it changes nothing (Paseo rewrites its row in place), so it isn't a step.
    if (item.type === "todo") {
      const key = stepKey(item);
      if (key === lastTodo) continue;
      lastTodo = key;
    }
    if (!stepKey(item) || (item.type === "assistant_message" && !folded.has(i))) {
      close();
      continue;
    }
    if (!run.length) {
      start = i ? list[i - 1]!.at : at;
      timed = start !== undefined;
    }
    run.push(item);
    if (at === undefined || (start !== undefined && at < start)) timed = false;
    if (at !== undefined) end = Math.max(end ?? at, at);
  }
  close(true);
  return runs;
}

const PASEO_TOOL = /^(mcp__paseo(_[a-z0-9_]*)?__.|paseo(_[a-z0-9_]*)?\.|paseo_)/;

/** "Thought 2 times, edited 1 file and ran 3 commands": what a run did, in the words and order of Paseo's own groups. */
export function stepSummary(items: readonly Item[], changesOf: (item: Item) => readonly TaskChange[] = (item) => todoChanges.get(stepKey(item)!) ?? [], lang: Language = "en"): string {
  const edited = new Set<string>();
  const read = new Set<string>();
  let thoughts = 0;
  let commands = 0;
  let searches = 0;
  let other = 0;
  let paseo = 0;
  let replies = 0;
  let completed = 0;
  for (const item of items) {
    if (item.type === "reasoning") thoughts++;
    if (item.type === "assistant_message") replies++;
    if (item.type === "todo") completed += changesOf(item).filter((c) => c.type === "completed").length;
    if (item.type !== "tool_call") continue;
    const d = item.detail;
    if (PASEO_TOOL.test(item.name.trim().toLowerCase())) paseo++;
    else if (d.type === "edit" || d.type === "write") edited.add(d.filePath);
    else if (d.type === "shell") commands++;
    else if (d.type === "read") read.add(d.filePath);
    else if (d.type === "search") searches++;
    else other++;
  }
  const parts = [
    thoughts && translate(lang, "summary.thoughts", { n: thoughts }),
    edited.size && translate(lang, "summary.editedFiles", { n: edited.size }),
    commands && translate(lang, "summary.commands", { n: commands }),
    read.size && translate(lang, "summary.readFiles", { n: read.size }),
    searches && translate(lang, "summary.searches", { n: searches }),
    other && translate(lang, "summary.otherTools", { n: other }),
    completed && translate(lang, "summary.tasks", { n: completed }),
    paseo && translate(lang, "summary.paseo", { n: paseo }),
  ].filter((p): p is string => !!p);
  // Replies only name a run that did nothing else, like Paseo's turn summary, which counts calls.
  if (!parts.length && replies) parts.push(translate(lang, "summary.messages", { n: replies }));
  const text =
    parts.length > 2
      ? `${parts.slice(0, -1).join(translate(lang, "summary.comma"))}${translate(lang, "summary.andList")}${parts.at(-1)}`
      : parts.join(translate(lang, "summary.and"));
  // English sentences start with a capital; Chinese has no case.
  return lang === "en" ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// The live state: every open agent's list, and where each step sits.
const lists = new Map<string, Entry[]>();
const keysByAgent = new Map<string, string[]>();
const runs = new Map<string, Run>();
/** Where each step sits: `alone` when its run is too short to merge (drawn as with merging off). */
const places = new Map<string, { head: string; index: number; alone?: boolean }>();
/** The app's own copy of each step (with its phase), newer than the daemon's while it streams. */
const seen = new Map<string, { item: Item; phase: Phase }>();
/** What the transformer last made of each step, to tell when Paseo must transform again ("native": a reply left to Paseo). */
const made = new Map<string, "head" | "none" | "alone" | "native">();
/** What each todo update changed, against the update before it in its agent's timeline. */
const todoChanges = new Map<string, TaskChange[]>();
/** How often each step key occurs in each followed agent's list, and in all of them. The transformer gets no agent or position, so a key
 * that occurs twice (a thought's or reply's opening words in two turns or two agents) can't say which step it is: it is never merged. */
const keyCounts = new Map<string, Map<string, number>>();
const occurrences = new Map<string, number>();
const shared = (key: string | undefined) => !!key && (occurrences.get(key) ?? 0) > 1;
/** Agents no longer followed, oldest first. Their steps stay placed as last followed, so unfollowing changes no row: a merged row still on
 * screen keeps drawing its run, and no left-out step comes back as a new merged row, whose mount (steps-row) would follow its agent again
 * and push another out (a loop whenever more chats are on screen than are followed). */
const frozen: string[] = [];
export const FROZEN_MAX = 8;
/** Steps of agents released past FROZEN_MAX: drawn as with merging off, never as a merged row, for the same reason. Kept per agent (and
 * counted, as two agents can share a key) so an agent placed again takes exactly its own keys back. */
const releasedByAgent = new Map<string, Set<string>>();
const released = new Map<string, number>();
const placeOf = (key: string) => places.get(key) ?? (released.has(key) ? { head: key, index: 0, alone: true } : undefined);

function unrelease(agentId: string) {
  for (const key of releasedByAgent.get(agentId) ?? []) {
    const left = released.get(key)! - 1;
    if (left) released.set(key, left);
    else released.delete(key);
  }
  releasedByAgent.delete(agentId);
}
// ponytail: seen keeps the latest few thousand steps across agents; key it per agent if long sessions show stale rows.
const SEEN_MAX = 4000;
const HISTORY_MAX = 1000;
const HISTORY_KEEP = 750;

const headListeners = new Map<string, Set<() => void>>();
const versions = new Map<string, number>();
const dirty = new Set<string>();
let flushQueued = false;
let onStale: () => void = () => {};
let onUnplaced: () => void = () => {};
let onShown: (agentId: string) => void = () => {};
let skip: (item: Item) => boolean = () => false;
let breakRun: (item: Item) => boolean = () => false;
let foldReplies = false;
let mergeMin = 2;

/** Whether a run of this many steps folds into one row. A run of one always heads its own row (the merged row draws it as itself);
 * a longer run shorter than the minimum is split, each step drawn as it would be with merging off. */
export const runSplits = (length: number, min: number) => length > 1 && length < min;

/** The merge minimum (prefs.mergeMin). Re-splits every agent when it changes. */
export function setMergeMin(min: number) {
  if (min === mergeMin) return;
  mergeMin = min;
  for (const agentId of lists.keys()) rebuild(agentId);
}

/** Paseo's Collapse turns: replies before a turn's last fold into its run. Re-splits every agent when that changes. */
export function setReplyFolding(on: boolean) {
  if (on === foldReplies) return;
  foldReplies = on;
  for (const agentId of lists.keys()) rebuild(agentId);
}

/** Steps the transformer hides (prefs) are left out of runs, and items drawn as their own rows (`breaks`) end one; re-splits every agent when
 * that changes. */
export function setStepSkip(fn: (item: Item) => boolean, breaks: (item: Item) => boolean = () => false) {
  skip = fn;
  breakRun = breaks;
  for (const agentId of lists.keys()) rebuild(agentId);
}

function touch(head: string) {
  dirty.add(head);
  if (flushQueued) return;
  flushQueued = true;
  // Transformers run during Paseo's render; listeners are told afterwards so no component updates mid-render.
  queueMicrotask(() => {
    flushQueued = false;
    for (const h of dirty) {
      if (!headListeners.has(h)) continue;
      versions.set(h, (versions.get(h) ?? 0) + 1);
      headListeners.get(h)?.forEach((l) => l());
    }
    dirty.clear();
  });
}

function unplace(agentId: string) {
  for (const key of keysByAgent.get(agentId) ?? []) {
    places.delete(key);
    runs.delete(key);
    todoChanges.delete(key);
  }
}

function forget(key: string) {
  seen.delete(key);
  made.delete(key);
  if (!headListeners.has(key)) versions.delete(key);
}

/** Keep recent complete turns, without splitting the active turn even when it exceeds the history budget. */
function trimHistory(list: Entry[]) {
  if (list.length <= HISTORY_MAX) return;
  let cut = 0;
  for (let i = 1; i < list.length; i++) {
    if (list[i]!.item.type !== "user_message") continue;
    cut = i;
    if (list.length - i <= HISTORY_KEEP) break;
  }
  if (cut) list.splice(0, cut);
}

/** Recounts an agent's step keys (none once it is no longer followed); returns the keys whose count changed. */
function countKeys(agentId: string, list: readonly Entry[] | undefined) {
  const before = keyCounts.get(agentId) ?? new Map<string, number>();
  const after = new Map<string, number>();
  let lastTodo: string | undefined;
  for (const { item } of list ?? []) {
    const key = stepKey(item);
    if (!key) continue;
    // The same list sent again is one row in Paseo (stepRuns passes over it), so it doesn't count twice.
    if (item.type === "todo") {
      if (key === lastTodo) continue;
      lastTodo = key;
    }
    after.set(key, (after.get(key) ?? 0) + 1);
  }
  const changed = new Set<string>();
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(key) ?? 0) - (before.get(key) ?? 0);
    if (!delta) continue;
    const total = (occurrences.get(key) ?? 0) + delta;
    if (total) occurrences.set(key, total);
    else occurrences.delete(key);
    changed.add(key);
  }
  if (list) keyCounts.set(agentId, after);
  else keyCounts.delete(agentId);
  return changed;
}

/** Re-splits one agent's runs, and those of other agents holding a key whose count changed: a key that became shared, or stopped being
 * shared, places differently there too. */
function rebuild(agentId: string) {
  const changed = countKeys(agentId, lists.get(agentId));
  place(agentId);
  if (!changed.size) return;
  for (const [other, counts] of keyCounts) if (other !== agentId && [...changed].some((key) => counts.has(key))) place(other);
}

/** Splits one agent's runs, notifying only changed runs and restoring rows that left the retained history. */
function place(agentId: string) {
  unrelease(agentId);
  const oldKeys = keysByAgent.get(agentId) ?? [];
  const oldRuns = new Map(oldKeys.flatMap((key) => runs.has(key) ? [[key, runs.get(key)!] as const] : []));
  unplace(agentId);
  const keys: string[] = [];
  const list = lists.get(agentId) ?? [];
  // Every todo update, placed or not, so one that leaves a run is made again on its own; the same list twice keeps its first changes.
  let before: readonly Task[] = [];
  for (const { item } of list) {
    if (item.type !== "todo") continue;
    const key = stepKey(item)!;
    if (!todoChanges.has(key)) todoChanges.set(key, taskChanges(before, item.items));
    before = item.items;
    keys.push(key);
  }
  // A shared key ends a run like a row of its own and is drawn as with merging off, so a collision only ever costs the merge.
  for (const key of keyCounts.get(agentId)?.keys() ?? []) {
    if (!shared(key)) continue;
    places.set(key, { head: key, index: 0, alone: true });
    keys.push(key);
  }
  for (const run of stepRuns(list, skip, foldReplies, (item) => breakRun(item) || shared(stepKey(item)))) {
    // The merged row stands where the run's first thought or tool call is; todo updates are only ever folded in.
    const head = stepKey(run.steps.find((s) => s.type !== "todo")!)!;
    const before = oldRuns.get(head);
    if (runSplits(run.steps.length, mergeMin)) {
      // A merged row that is now split is told, so it does not keep drawing the old run until the re-transform.
      if (before) touch(head);
      for (const item of run.steps) {
        const key = stepKey(item)!;
        places.set(key, { head: key, index: 0, alone: true });
        keys.push(key);
      }
      continue;
    }
    runs.set(head, run);
    if (!before || before.ms !== run.ms || before.open !== run.open || before.steps.length !== run.steps.length || before.steps.some((x, i) => x !== run.steps[i])) touch(head);
    run.steps.forEach((item, index) => {
      const key = stepKey(item)!;
      places.set(key, { head, index: key === head ? 0 : index + 1 });
      keys.push(key);
    });
  }
  keysByAgent.set(agentId, keys);
  const retained = new Set(keys);
  let evictedRows = false;
  for (const key of oldKeys) {
    if (retained.has(key)) continue;
    evictedRows ||= made.has(key);
    forget(key);
    if (oldRuns.has(key)) touch(key);
  }
  if (evictedRows || keys.some(stale)) onStale();
}

/** A step the transformer made differently than it would now. Only a step made before its run was known and that turned out not to
 * lead it: a step not placed yet is made a head of its own, which renders as itself and grows into the merged row in place. */
function stale(key: string) {
  const was = made.get(key);
  const now = expected(key);
  // A reply left to Paseo is already what a split run draws.
  return !!was && was !== now && !(was === "native" && now === "alone");
}

function expected(key: string) {
  const place = placeOf(key);
  return place?.alone ? "alone" : (place?.index ?? 0) > 0 ? "none" : "head";
}

// ponytail: any followed agent counts, so a new call of an agent opened next to a busy one waits for its event too (~50ms late, no split).
const GROWING_MS = 60_000;
/** A followed agent is mid-run: its timeline ends in a step that changed within the last minute. */
function runGrowing() {
  const now = Date.now();
  for (const [agentId, list] of lists) {
    // A frozen list never updates, so its last step would look busy for the whole window.
    if (frozen.includes(agentId)) continue;
    const last = list.at(-1);
    if (last && last.at !== undefined && now - last.at < GROWING_MS && last.item.type !== "assistant_message" && stepKey(last.item) && !skip(last.item)) return true;
  }
  return false;
}

let recheck: ReturnType<typeof setTimeout> | undefined;
function recheckAfterGrowing() {
  recheck ??= setTimeout(() => {
    recheck = undefined;
    onStale();
  }, GROWING_MS);
}

/** Called by the transformer for every step: "head" (render the merged row), "none" (leave it out) or "alone" (its run is too short to
 * merge: draw it as with merging off). A step the followed timelines don't
 * have yet (a tab just opened, the subscription a beat behind) leads a run of one until they catch up. Except a tool call while a run is
 * growing: Paseo sometimes transforms it before the plugin's event arrives, and as a run of one it showed as its own row for ~80ms, then
 * merged (the split-then-merge flicker). It almost always joins that run, so it stays out until its event places it; if it turns out to
 * start a run instead, it is stale and the re-transform shows it. A streaming thought waits the same way. Only a step still racing its
 * event waits (a running call, a streaming thought): a finished one no followed timeline has (another agent's, or history trimmed away)
 * shows at once rather than staying out while some agent is busy. */
export function placeStep(item: Item, phase: Phase): { key: string; as: "head" | "none" | "alone" } | undefined {
  const key = stepKey(item);
  const reply = item.type === "assistant_message";
  if (!key || (reply && !foldReplies)) return undefined;
  // A reply no run holds stays Paseo's; noted (once complete, its key final) so the re-transform folds it when a later reply arrives.
  if (reply && !places.has(key)) return void (phase === "complete" && made.set(key, "native"));
  const previous = seen.get(key);
  seen.delete(key);
  seen.set(key, { item, phase });
  if (seen.size > SEEN_MAX) for (const old of [...seen.keys()].slice(0, SEEN_MAX / 4)) forget(old);
  const place = placeOf(key);
  const waits = (item.type === "tool_call" && item.status === "running") || (item.type === "reasoning" && phase === "streaming");
  const held = !place && waits && runGrowing();
  // Held back while some followed agent is busy: if no run claims it (its agent is not followed, as
  // on phones before a merged row of it shows), it must still show once that window ends.
  if (held) recheckAfterGrowing();
  const as = held ? "none" : expected(key);
  const changed = previous?.item !== item || previous.phase !== phase || made.get(key) !== as;
  made.set(key, as);
  if (!place) onUnplaced();
  if (changed) touch(place?.head ?? key);
  return { key, as };
}

/** Keeps an agent's list current: the latest 1000 entries, then live events (those that raced the fetch are replayed past its end). */
export function followAgent(paseo: PluginClientContext["paseo"], agentId: string) {
  // A provider subagent's pane (`provider:<parent>:<child>`) has no daemon agent behind it, so nothing to fetch or subscribe to.
  if (agentId.startsWith("provider:")) return () => {};
  const thawed = frozen.indexOf(agentId);
  if (thawed >= 0) frozen.splice(thawed, 1);
  const timeline = paseo.agents.ref(agentId).timeline;
  /** Live events that came while the latest load was in flight. */
  let pending: Array<{ seq?: number; item: Item; at: number; turn?: string }> | undefined;
  // A load started later (a replacement while the first was in flight) supersedes earlier ones: only the latest commits.
  let generation = 0;
  // A list frozen from an earlier follow misses the events of the gap: live events land only on a list this follow loaded.
  let committed = false;
  let closed = false;
  const load = async () => {
    const mine = ++generation;
    const buffered: NonNullable<typeof pending> = [];
    pending = buffered;
    try {
      const page = await timeline.refetch({ direction: "tail", limit: 1000, projection: "projected" });
      if (closed || mine !== generation) return;
      const list = historyEntries(page.entries, page.agent?.status === "idle" ? page.agent.updatedAt : undefined);
      const end = page.endCursor?.seq ?? -1;
      for (const e of buffered) if (e.seq === undefined || e.seq > end) applyItem(list, e.item, e.at, e.turn);
      trimHistory(list);
      lists.set(agentId, list);
      committed = true;
      rebuild(agentId);
    } catch (error) {
      console.warn("[morphise] Couldn't load the timeline to merge steps", error);
      if (!committed && !closed && mine === generation) drop(agentId);
    } finally {
      if (mine === generation) pending = undefined;
    }
  };
  const subscription = timeline.subscribe((payload) => {
    const { event } = payload;
    if (event.type === "timeline") {
      const item = event.item as Item;
      const at = timestampMs("timestamp" in payload ? payload.timestamp : undefined) ?? Date.now();
      const turn = (event as { turnId?: string }).turnId;
      if (pending) return void pending.push({ seq: "seq" in payload ? payload.seq : undefined, item, at, turn });
      const list = committed ? lists.get(agentId) : undefined;
      if (list && applyItem(list, item, at, turn)) {
        trimHistory(list);
        rebuild(agentId);
      }
    } else if (event.type === "replacement" || event.type === "subscription_restored") void load();
  });
  subscription.ready.then(load, (error: unknown) => console.warn("[morphise] Couldn't follow the timeline to merge steps", error));
  return () => {
    if (closed) return;
    closed = true;
    subscription();
    frozen.push(agentId);
    if (frozen.length > FROZEN_MAX) release(frozen.shift()!);
  };
}

/** Forgets an agent's steps: placed against no list, its merged rows are told and rows already made are transformed again; agents sharing
 * a key with it may merge that key again. */
function drop(agentId: string) {
  lists.delete(agentId);
  rebuild(agentId);
  keysByAgent.delete(agentId);
}

function release(agentId: string) {
  const keys = new Set(keysByAgent.get(agentId));
  // Dropped first: dropping places the agent against no list, which would take back keys already released.
  drop(agentId);
  releasedByAgent.set(agentId, keys);
  for (const key of keys) released.set(key, (released.get(key) ?? 0) + 1);
}

/** Drops every agent no longer followed, and what was released: merging stopped altogether, so nothing draws from them any more. */
export function forgetFrozenAgents() {
  for (const agentId of frozen.splice(0)) drop(agentId);
  releasedByAgent.clear();
  released.clear();
}

/** After a fresh transform everything is made again. */
export const resetMade = () => made.clear();
export const onStaleSteps = (fn: () => void) => void (onStale = fn);
/** A step came before its agent's timeline was followed or caught up; lets the entry follow newly opened tabs right away. */
export const onUnplacedStep = (fn: () => void) => void (onUnplaced = fn);
/** A merged row rendered for an agent: the only way the entry learns which timelines to follow on native, where tabs can't be read. */
export const noteShownAgent = (agentId: string) => onShown(agentId);
export const onShownAgent = (fn: (agentId: string) => void) => void (onShown = fn);

/** A run's steps as the app last saw them and its duration; a single step when the run isn't known (yet, or any more: its agent released,
 * or the head trimmed from what the app saw). `own` is the head step the merged row was made from, so it always draws something. */
export function runOf(head: string, own?: { item: Item; phase: Phase }): { steps: Array<{ item: Item; phase: Phase }>; ms?: number; open?: boolean } {
  const run = runs.get(head);
  if (!run) {
    const step = own ?? seen.get(head);
    return { steps: step ? [step] : [] };
  }
  return { steps: run.steps.map((item) => seen.get(stepKey(item)!) ?? { item, phase: "complete" as const }), ms: run.ms, open: run.open };
}

export function subscribeRun(head: string, listener: () => void) {
  let set = headListeners.get(head);
  if (!set) headListeners.set(head, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) {
      headListeners.delete(head);
      versions.delete(head);
    }
  };
}

export const runVersion = (head: string) => versions.get(head) ?? 0;
export const changesOfTodo = (key: string): readonly TaskChange[] => todoChanges.get(key) ?? [];
/** What a todo update changed when there is no timeline to work it out from (the dashboard preview's sample). */
export const setTodoChanges = (item: Item, changes: TaskChange[]) => void todoChanges.set(stepKey(item)!, changes);
