import { describe, expect, it } from "vitest";
import { chatView, rowFate, summarizeToolCall, transformedTypes } from "./chat-view";

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
    expect(fate).toEqual({ kind: "tool", data: { kind: "shell", detail: "shell", name: "Bash", subject: "npm test", status: "failed", error: "exit 1", body: "ok" } });
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
