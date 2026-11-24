import { expect, it } from "vitest";
import { observeMessagePreview, type MessagePreviewState } from "./sidebar-message";

it("waits for subscription readiness and does not overwrite live messages with a late history page", async () => {
  let ready!: () => void, resolve!: (page: { entries: unknown[] }) => void;
  let listener!: (event: unknown) => void;
  let reads = 0, stopped = false;
  const states: MessagePreviewState[] = [];
  const stop = observeMessagePreview({ refetch: () => { reads++; return new Promise((done) => { resolve = done; }); }, subscribe: (callback) => { listener = callback; return Object.assign(() => { stopped = true; }, { ready: new Promise<void>((done) => { ready = done; }) }); } }, (state) => states.push(state));
  expect(reads).toBe(0);
  ready(); await Promise.resolve();
  expect(reads).toBe(1);
  listener({ seq: 10, event: { type: "timeline", item: { type: "user_message", text: "New request" } } });
  resolve({ entries: [{ seq: 1, item: { type: "assistant_message", text: "Old answer" } }] }); await Promise.resolve();
  expect(states.at(-1)).toEqual({ status: "ready", text: "New request" });
  listener({ seq: 9, event: { type: "timeline", item: { type: "assistant_message", text: "Older edit" } } });
  expect(states.at(-1)?.text).toBe("New request");
  listener({ seq: 10, event: { type: "timeline", item: { type: "user_message", text: "Updated request" } } });
  expect(states.at(-1)?.text).toBe("Updated request");
  stop(); expect(stopped).toBe(true);
  listener({ seq: 11, event: { type: "timeline", item: { type: "assistant_message", text: "After disposal" } } });
  expect(states.at(-1)?.text).toBe("Updated request");
});

it("does not start a history read after disposal while readiness was pending", async () => {
  let ready!: () => void;
  let reads = 0;
  const stop = observeMessagePreview({ refetch: async () => { reads++; return { entries: [] }; }, subscribe: () => Object.assign(() => {}, { ready: new Promise<void>((done) => { ready = done; }) }) }, () => {});
  stop(); ready(); await Promise.resolve();
  expect(reads).toBe(0);
});

it("shows read failures and refreshes after timeline replacement", async () => {
  let listener!: (event: unknown) => void;
  let failed = true;
  const states: MessagePreviewState[] = [];
  const stop = observeMessagePreview({ refetch: async () => { if (failed) throw Error("offline"); return { entries: [{ seq: 1, item: { type: "assistant_message", text: "Restored answer" } }] }; }, subscribe: (callback) => { listener = callback; return () => {}; } }, (state) => states.push(state));
  await Promise.resolve(); expect(states.at(-1)?.status).toBe("failed");
  failed = false; listener({ event: { type: "replacement" } }); await Promise.resolve();
  expect(states.at(-1)).toEqual({ status: "ready", text: "Restored answer" });
  stop();
});
