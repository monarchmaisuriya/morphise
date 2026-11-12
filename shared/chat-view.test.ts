import { describe, expect, it } from "vitest";
import { accentColor, turnRecap, chatLook, chatView, commandTokens, diffCounts, diffLines, foldLines, lastTurnMarkdown, mcpName, relativePath, rowFate, rowStartsOpen, shellProgram, startsOpen, summarizeNotice, summarizeToolCall, thinkingSteps, transformedTypes, wordDiff } from "./chat-view";

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

  it("keeps Paseo's rows for plans and sub-agent tasks; draws unknown tools with their input and result", () => {
    const view = chatView({ toolCalls: "compact", hideFinished: ["other"] }, [], false);
    expect(rowFate("tool_call", call({ type: "plan", text: "1. Do it" }), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "sub_agent", description: "Explore" }, "running"), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "unknown", input: { q: 1 }, output: {} }, "running"), view).kind).toBe("tool");
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
    expect(summarizeToolCall(call({ type: "shell", command: "true", exitCode: 0 }))?.facts).toEqual(["no output"]);
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
    expect(chatLook(undefined)).toMatchObject({ fold: "finished", outputLines: 12, codeLines: 30, textSize: "medium", codeSize: "medium", density: "normal", timestamps: false, wrap: true, labels: "both", paths: "relative", accent: null, reasoning: "show" });
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
    expect(lastTurnMarkdown(entries)).toBe("**Prompt**\n\nGo\n\nHello world\n\n- Ran `ls` no output");
  });

  const entry = (item: unknown) => ({ item, timestamp: "2026-11-12T10:00:00.000Z" });
  it("copies the last prompt, its replies and a line per tool call", () => {
    const entries = [entry({ type: "user_message", text: "old" }), entry({ type: "assistant_message", text: "old answer" }), entry({ type: "user_message", text: "Fix it" }), entry(call({ type: "shell", command: "npm test", exitCode: 1 }, "failed")), entry({ type: "assistant_message", text: "Fixed." })];
    expect(lastTurnMarkdown(entries)).toBe("**Prompt**\n\nFix it\n\n- Ran `npm test` exit 1 (failed)\n\nFixed.");
    expect(lastTurnMarkdown([entry({ type: "assistant_message", text: "x" })])).toBeNull();
  });
});

describe("0.15 chat rules", () => {
  it("draws MCP tools with their service and input and result", () => {
    expect(mcpName("mcp__brevo-codebase__search_code")).toEqual({ service: "brevo-codebase", action: "Search code" });
    expect(mcpName("Bash")).toBeNull();
    const summary = summarizeToolCall({ type: "tool_call", callId: "c", name: "mcp__x__read_file", detail: { type: "unknown", input: { path: "a" }, output: "ok" }, status: "completed", error: null });
    expect(summary).toMatchObject({ detail: "unknown", subject: "x", body: 'Input\n{\n  "path": "a"\n}\n\nResult\nok' });
    expect(rowFate("tool_call", { type: "tool_call", callId: "c", name: "mcp__x__y", detail: { type: "unknown", input: {}, output: {} }, status: "completed", error: null }, chatView({ toolCalls: "compact" }, [], false)).kind).toBe("tool");
  });

  it("summarises shell output and failed edits", () => {
    expect(summarizeToolCall(call({ type: "shell", command: "ls", output: "a\nb\n", exitCode: 0 }))?.facts).toEqual(["2 lines"]);
    expect(summarizeToolCall(call({ type: "shell", command: "true", output: "", exitCode: 0 }))?.facts).toEqual(["no output"]);
    expect(summarizeToolCall(call({ type: "edit", filePath: "x", unifiedDiff: "@@ -1 +1 @@\n-a\n+b" }, "failed"))?.facts[0]).toBe("Not applied");
  });

  it("turns everything off with the master switch, but still hides what was hidden", () => {
    const view = chatView({ enabled: false, toolCalls: "cards", reasoning: "fold", notices: true, hideFinished: ["read"] }, ["error"], false);
    expect(view.toolCalls).toBe("paseo");
    expect(view.reasoning).toBe("show");
    expect(view.notices).toBe(false);
    expect(rowFate("error", { type: "error", message: "x" }, view)).toEqual({ kind: "hide" });
  });

  it("draws errors, notices and compaction as notice rows when asked", () => {
    const view = chatView({ notices: true }, [], false);
    expect(transformedTypes(view).sort()).toEqual(["compaction", "error", "notification"]);
    expect(rowFate("notification", { type: "notification", level: "warning", message: "Rate limited" }, view)).toEqual({ kind: "notice", data: { level: "warning", title: "Warning", message: "Rate limited" } });
    expect(summarizeNotice("compaction", { type: "compaction", status: "completed", trigger: "auto", preTokens: 152000 })).toEqual({ level: "info", title: "Context compacted", message: "152K tokens before" });
  });

  it("folds per kind, keeps short details open, and always opens failures", () => {
    const look = { fold: "finished" as const, foldByKind: { read: "always" as const }, foldMinLines: 3 };
    expect(rowStartsOpen(look, "read", "running", 20)).toBe(false);
    expect(rowStartsOpen(look, "shell", "running", 20)).toBe(true);
    expect(rowStartsOpen(look, "shell", "completed", 2)).toBe(true);
    expect(rowStartsOpen(look, "read", "failed", 50)).toBe(true);
  });

  it("finds the program and colours a command's parts", () => {
    expect(shellProgram("FOO=1 sudo /usr/bin/git status")).toBe("git");
    expect(shellProgram("cd api && npm test")).toBe("npm");
    const tokens = commandTokens('git grep -n "a b" | head -5');
    expect(tokens.filter((token) => token.kind === "program").map((token) => token.text)).toEqual(["git", "head"]);
    expect(tokens.find((token) => token.kind === "string")?.text).toBe('"a b"');
    expect(tokens.map((token) => token.text).join("")).toBe('git grep -n "a b" | head -5');
  });

  it("shows paths relative to the workspace", () => {
    expect(relativePath("/ws/app/src/a.ts", "/ws/app")).toBe("src/a.ts");
    expect(relativePath("/other/a.ts", "/ws/app")).toBe("/other/a.ts");
    expect(relativePath("src/a.ts", "/ws/app")).toBe("src/a.ts");
  });

  it("marks changed words between a removed and an added line", () => {
    const diff = wordDiff("return items.reduce(sum)", "return prices.reduce(sum)");
    expect(diff.before.filter((part) => part.changed).map((part) => part.text)).toEqual(["items"]);
    expect(diff.after.filter((part) => part.changed).map((part) => part.text)).toEqual(["prices"]);
  });

  it("splits thinking at its headings", () => {
    expect(thinkingSteps("intro\n**Plan**\ndo a\n## Check\ndo b")).toEqual([
      { title: "", text: "intro" },
      { title: "Plan", text: "do a" },
      { title: "Check", text: "do b" },
    ]);
  });

  it("reads accent names and colours", () => {
    expect(accentColor("jade")).toBe("#3fb68b");
    expect(accentColor("#123abc")).toBe("#123abc");
    expect(accentColor("theme")).toBeNull();
    expect(accentColor("nope")).toBeNull();
  });
});

describe("turnRecap", () => {
  const at = (item: unknown, timestamp: string) => ({ item, timestamp });
  it("sums up the last turn: time, files changed, failed commands, calls counted once", () => {
    const entries = [
      at({ type: "user_message", text: "old" }, "2026-11-12T09:00:00.000Z"),
      at({ type: "user_message", text: "Fix it" }, "2026-11-12T10:00:00.000Z"),
      at({ ...call({ type: "edit", filePath: "/w/a.ts", unifiedDiff: "@@ -1 +1,2 @@\n-a\n+b\n+c" }, "running"), callId: "e1" }, "2026-11-12T10:00:10.000Z"),
      at({ ...call({ type: "edit", filePath: "/w/a.ts", unifiedDiff: "@@ -1 +1,2 @@\n-a\n+b\n+c" }), callId: "e1" }, "2026-11-12T10:00:11.000Z"),
      at({ ...call({ type: "shell", command: "npm test", exitCode: 1 }, "failed"), callId: "s1" }, "2026-11-12T10:01:00.000Z"),
    ];
    expect(turnRecap(entries, Date.parse("2026-11-12T10:02:05.000Z"), "completed")).toEqual({
      prompt: "@2026-11-12T10:00:00.000Z",
      seconds: 125,
      files: [{ path: "/w/a.ts", added: 2, removed: 1 }],
      failed: [{ command: "npm test", exitCode: 1 }],
      calls: 2,
      outcome: "completed",
      error: "",
    });
    expect(turnRecap([], 0, "completed")).toBeNull();
    // A prompt that arrived after the turn ended belongs to the next turn.
    const later = [...entries, at({ type: "user_message", text: "Next" }, "2026-11-12T10:03:00.000Z")];
    expect(turnRecap(later, Date.parse("2026-11-12T10:02:05.000Z"), "completed")?.files).toHaveLength(1);
  });
});

describe("0.14 output setting", () => {
  it("keeps showing all code when 0.14 showed all output", () => {
    expect(chatLook({ outputLines: 0 }).codeLines).toBeNull();
    expect(chatLook({ outputLines: 5 }).codeLines).toBe(30);
    expect(chatLook({ outputLines: 0, codeLines: 8 }).codeLines).toBe(8);
  });
});

describe("file paths", () => {
  it("keeps the whole path of a file tool while the subject is cut", () => {
    const long = `/${"a".repeat(400)}.ts`;
    const summary = summarizeToolCall({ type: "tool_call", callId: "c", name: "Read", status: "completed", error: null, detail: { type: "read", filePath: long, content: "x" } });
    expect(summary?.path).toBe(long);
    expect(summary?.subject.length).toBeLessThan(long.length);
  });
});
