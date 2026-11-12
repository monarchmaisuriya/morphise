import { describe, expect, it } from "vitest";
import { chatLook, chatView, diffCounts, diffLines, foldLines, lastTurnMarkdown, rowFate, startsOpen, summarizeToolCall, transformedTypes } from "./chat-view";

// Shaped like Paseo's timeline items (protocol AgentTimelineItem, ToolCallTimelineItem).
const call = (detail: Record<string, unknown>, status = "completed", extra: Record<string, unknown> = {}) => ({ type: "tool_call", callId: "c1", name: "Bash", detail, status, error: null, ...extra });

describe("chat view rules", () => {
  it("leaves every row to Paseo by default, and transforms nothing", () => {
    const view = chatView(undefined, [], false);
    expect(transformedTypes(view)).toEqual([]);
    expect(rowFate("tool_call", call({ type: "shell", command: "ls" }), view)).toEqual({ kind: "keep" });
    expect(rowFate("reasoning", { type: "reasoning", text: "hmm" }, view)).toEqual({ kind: "keep" });
  });

  it("hides whole row types the user hid, before any other rule", () => {
    const view = chatView({ toolCalls: "compact" }, ["tool_call"], true);
    expect(rowFate("tool_call", call({ type: "shell", command: "ls" }), view)).toEqual({ kind: "hide" });
    expect(transformedTypes(view).sort()).toEqual(["todo", "tool_call"]);
  });

  it("hides finished calls of chosen kinds, never running or failed ones", () => {
    const view = chatView({ hideFinished: ["read", "edit"] }, [], false);
    expect(rowFate("tool_call", call({ type: "read", filePath: "a.ts" }), view)).toEqual({ kind: "hide" });
    expect(rowFate("tool_call", call({ type: "write", filePath: "b.ts" }), view)).toEqual({ kind: "hide" });
    expect(rowFate("tool_call", call({ type: "read", filePath: "a.ts" }, "running"), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "read", filePath: "a.ts" }, "failed", { error: "no such file" }), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "shell", command: "ls" }), view)).toEqual({ kind: "keep" });
  });

  it("redraws calls as compact rows with what they acted on", () => {
    const view = chatView({ toolCalls: "compact" }, [], false);
    const fate = rowFate("tool_call", call({ type: "shell", command: "npm test\n--watch", output: "ok" }, "failed", { error: { message: "exit 1" } }), view);
    expect(fate).toEqual({ kind: "tool", data: { kind: "shell", detail: "shell", name: "Bash", subject: "npm test", status: "failed", error: "exit 1", body: "ok", bodyKind: "output", facts: [], style: "compact" } });
  });

  it("keeps Paseo's rows for plans, sub-agent tasks and unknown tools, which a compact row would empty", () => {
    const view = chatView({ toolCalls: "compact", hideFinished: ["other"] }, [], false);
    expect(rowFate("tool_call", call({ type: "plan", text: "1. Do it" }), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "sub_agent", description: "Explore" }, "running"), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "unknown", input: {}, output: {} }, "running"), view)).toEqual({ kind: "keep" });
    // Hiding finished "other" tools is the user's choice; plans are never hidden by it.
    expect(rowFate("tool_call", call({ type: "worktree_setup", log: "" }), view)).toEqual({ kind: "hide" });
  });

  it("folds or hides thinking", () => {
    expect(rowFate("reasoning", { type: "reasoning", text: "because" }, chatView({ reasoning: "fold" }, [], false))).toEqual({ kind: "thinking", data: { text: "because" } });
    expect(rowFate("reasoning", { type: "reasoning", text: "because" }, chatView({ reasoning: "hide" }, [], false))).toEqual({ kind: "hide" });
  });

  it("draws plans as the card in the chat, keeping an emptied plan as Paseo draws it", () => {
    const view = chatView(undefined, [], true);
    expect(rowFate("todo", { type: "todo", items: [{ text: "a", completed: false }] }, view)).toEqual({ kind: "steps", data: { steps: [{ text: "a", status: "pending" }] } });
    expect(rowFate("todo", { type: "todo", items: [] }, view)).toEqual({ kind: "keep" });
  });

  it("summarises only tool calls", () => {
    expect(summarizeToolCall({ type: "reasoning", text: "x" })).toBeNull();
    expect(summarizeToolCall(call({ type: "search", query: "foo", filePaths: ["a", "b"] }))?.body).toBe("a\nb");
  });
});

describe("tool cards", () => {
  it("counts diff lines and numbers them from the hunk header", () => {
    const diff = "--- a/x.ts\n+++ b/x.ts\n@@ -10,3 +10,4 @@\n keep\n-old\n+new\n+added\n keep2";
    expect(diffCounts(diff)).toEqual({ added: 2, removed: 1 });
    expect(diffLines(diff).map((line) => [line.kind, line.oldLine, line.newLine])).toEqual([
      ["hunk", null, null],
      ["same", 10, 10],
      ["remove", 11, null],
      ["add", null, 11],
      ["add", null, 12],
      ["same", 12, 13],
    ]);
  });

  it("puts facts in the header: diff counts, exit codes, matches, HTTP codes", () => {
    expect(summarizeToolCall(call({ type: "edit", filePath: "x.ts", unifiedDiff: "@@ -1 +1 @@\n-a\n+b" }))?.facts).toEqual(["+1 −1"]);
    expect(summarizeToolCall(call({ type: "edit", filePath: "x.ts", oldString: "a", newString: "b\nc" }))).toMatchObject({ bodyKind: "diff", facts: ["+2 −1"] });
    expect(summarizeToolCall(call({ type: "shell", command: "false", exitCode: 1 }))?.facts).toEqual(["exit 1"]);
    expect(summarizeToolCall(call({ type: "shell", command: "true", exitCode: 0 }))?.facts).toEqual([]);
    expect(summarizeToolCall(call({ type: "search", query: "x", numMatches: 3, filePaths: ["a", "b"], durationMs: 1500 }))?.facts).toEqual(["3 matches", "2 files", "1.5s"]);
    expect(summarizeToolCall(call({ type: "fetch", url: "https://x", code: 404 }))?.facts).toEqual(["404"]);
  });

  it("opens failed and running cards by the fold rule, and failed always", () => {
    expect(startsOpen("finished", "running")).toBe(true);
    expect(startsOpen("finished", "completed")).toBe(false);
    expect(startsOpen("always", "running")).toBe(false);
    expect(startsOpen("always", "failed")).toBe(true);
    expect(startsOpen("never", "completed")).toBe(true);
  });

  it("keeps the first and last lines of long output", () => {
    const body = Array.from({ length: 30 }, (_, index) => `l${index + 1}`).join("\n");
    expect(foldLines(body, 4)).toEqual({ head: ["l1", "l2"], tail: ["l29", "l30"], hidden: 26 });
    expect(foldLines("a\nb\nc", 4).hidden).toBe(0);
    expect(foldLines(body, null).head).toHaveLength(30);
  });

  it("draws cards or lines as chosen, and leaves the chat to Paseo on phones when asked", () => {
    expect(rowFate("tool_call", call({ type: "read", filePath: "a" }), chatView({ toolCalls: "cards" }, [], false))).toMatchObject({ kind: "tool", data: { style: "cards" } });
    const phone = chatView({ toolCalls: "cards", reasoning: "fold", phones: "paseo", hideFinished: ["read"] }, [], false, true);
    expect(phone.toolCalls).toBe("paseo");
    expect(phone.reasoning).toBe("show");
    expect(rowFate("tool_call", call({ type: "read", filePath: "a" }), phone)).toEqual({ kind: "hide" });
  });

  it("fills unset look options with defaults; 0 output lines means show all", () => {
    expect(chatLook(undefined)).toEqual({ fold: "finished", outputLines: 12, textSize: "medium", density: "normal", timestamps: false });
    expect(chatLook({ outputLines: 0 }).outputLines).toBeNull();
  });
});

describe("diff edge cases", () => {
  it("counts removed '--' and added '++' lines inside a hunk, and skips 'No newline' notes", () => {
    const diff = "--- a/q.sql\n+++ b/q.sql\n@@ -1,2 +1,3 @@\n--- old comment\n-select 1;\n+-- new comment\n+select 2;\n\\ No newline at end of file\n+foo";
    expect(diffCounts(diff)).toEqual({ added: 3, removed: 2 });
    expect(diffLines(diff).filter((line) => line.kind === "add").map((line) => line.newLine)).toEqual([1, 2, 3]);
  });

  it("does not count the empty line after a final newline", () => {
    expect(summarizeToolCall(call({ type: "read", filePath: "a", content: "x\ny\n" }))?.facts).toEqual(["2 lines"]);
  });
});

describe("lastTurnMarkdown", () => {
  it("joins streamed reply chunks and keeps one line per tool call, in its latest state", () => {
    const at = (item: unknown) => ({ item, timestamp: "2026-11-12T10:00:00.000Z" });
    const entries = [at({ type: "user_message", text: "Go" }), at({ type: "assistant_message", text: "Hel" }), at({ type: "assistant_message", text: "lo world" }), at({ ...call({ type: "shell", command: "ls" }, "running"), callId: "c9" }), at({ ...call({ type: "shell", command: "ls" }), callId: "c9" })];
    expect(lastTurnMarkdown(entries)).toBe("**Prompt**\n\nGo\n\nHello world\n\n- Ran `ls`");
  });

  const entry = (item: unknown) => ({ item, timestamp: "2026-11-12T10:00:00.000Z" });
  it("copies the last prompt, its replies and a line per tool call", () => {
    const entries = [entry({ type: "user_message", text: "old" }), entry({ type: "assistant_message", text: "old answer" }), entry({ type: "user_message", text: "Fix it" }), entry(call({ type: "shell", command: "npm test", exitCode: 1 }, "failed")), entry({ type: "assistant_message", text: "Fixed." })];
    expect(lastTurnMarkdown(entries)).toBe("**Prompt**\n\nFix it\n\n- Ran `npm test` exit 1 (failed)\n\nFixed.");
    expect(lastTurnMarkdown([entry({ type: "assistant_message", text: "x" })])).toBeNull();
  });
});
