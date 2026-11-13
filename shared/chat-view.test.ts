import { describe, expect, it } from "vitest";
import { polishPrefs } from "./polish/prefs";
import { accentColor, breaksSteps, turnRecap, chatLook, withLineLimit, chatView, diffCounts, diffLines, foldLines, isTurnTrigger, lastTurnMarkdown, mcpName, relativePath, rowFate, rowStartsOpen, shellProgram, skippedStep, startsOpen, summarizeToolCall, thinkingStartsOpen, thoughtFirstLine, transformedTypes, wordDiff } from "./chat-view";

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
    expect(transformedTypes(view).sort()).toEqual(["assistant_message", "reasoning", "todo", "tool_call"]);
    expect(rowFate("user_message", { type: "user_message", text: "hi" }, chatView(undefined, ["user_message"], false))).toEqual({ kind: "hide" });
  });

  it("hides finished calls of chosen kinds, never running or failed ones, and leaves them out of merged runs", () => {
    const view = chatView({ hideFinished: ["read", "edit"] }, [], false);
    expect(rowFate("tool_call", call({ type: "read", filePath: "a.ts" }), view)).toEqual({ kind: "hide" });
    expect(rowFate("tool_call", call({ type: "write", filePath: "b.ts" }), view)).toEqual({ kind: "hide" });
    expect(rowFate("tool_call", call({ type: "read", filePath: "a.ts" }, "running"), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "read", filePath: "a.ts" }, "failed", { error: "no such file" }), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "shell", command: "ls" }), view)).toEqual({ kind: "keep" });
    const merged = chatView({ toolCalls: "cards", hideFinished: ["read"] }, [], false);
    expect(skippedStep(call({ type: "read", filePath: "a.ts" }), merged)).toBe(true);
    expect(skippedStep(call({ type: "read", filePath: "a.ts" }, "running"), merged)).toBe(false);
  });

  it("draws calls as Chat Polish's rows, merged between replies unless merging is off; compact means tighter rows", () => {
    const view = chatView({ toolCalls: "compact" }, [], false);
    expect(view.toolCalls).toBe("compact");
    expect(view.merge).toBe(true);
    expect(rowFate("tool_call", call({ type: "shell", command: "npm test" }, "failed", { error: { message: "exit 1" } }), view)).toEqual({ kind: "step", alone: "tool" });
    expect(chatView({ toolCalls: "cards", polish: { merge: false } }, [], false).merge).toBe(false);
    // Paseo's own tool rows: nothing to merge either.
    expect(chatView({ polish: { merge: true } }, [], false).merge).toBe(false);
  });

  it("draws plans as a card and keeps the pending approval out; sub-agent calls stay Paseo's (they link to the chat)", () => {
    const view = chatView({ toolCalls: "compact", hideFinished: ["other"] }, [], false);
    expect(rowFate("tool_call", call({ type: "plan", text: "1. Do it" }, "running"), view)).toEqual({ kind: "plan" });
    expect(rowFate("tool_call", call({ type: "unknown", input: {}, output: {} }, "running", { name: "ExitPlanMode" }), view)).toEqual({ kind: "hide" });
    expect(rowFate("tool_call", call({ type: "sub_agent", description: "Explore" }, "running"), view)).toEqual({ kind: "keep" });
    expect(rowFate("tool_call", call({ type: "unknown", input: { q: 1 }, output: {} }, "running"), view)).toEqual({ kind: "step", alone: "tool" });
    // Hiding finished "other" tools is the user's choice.
    expect(rowFate("tool_call", call({ type: "worktree_setup", log: "" }), view)).toEqual({ kind: "hide" });
  });

  it("reads another agent's notice as a row only with Morphise's tool rows; it is never a step", () => {
    const notice = call({ type: "plain_text", text: "Agent a (A) finished." }, "completed", { name: "agent_message" });
    expect(isTurnTrigger(notice)).toBe(true);
    expect(isTurnTrigger(call({ type: "plain_text", text: "x" }, "completed", { agentMessage: {} }))).toBe(true);
    expect(rowFate("tool_call", notice, chatView({ toolCalls: "cards" }, [], false))).toEqual({ kind: "agent-event" });
    expect(rowFate("tool_call", notice, chatView(undefined, [], false))).toEqual({ kind: "keep" });
  });

  it("shows thinking as Paseo does, as a folded or open row, or hides it; inside merged steps it joins the run", () => {
    const thought = { type: "reasoning", text: "because" };
    expect(rowFate("reasoning", thought, chatView({ reasoning: "fold" }, [], false))).toEqual({ kind: "step", alone: "thought" });
    expect(rowFate("reasoning", thought, chatView({ reasoning: "expand" }, [], false))).toEqual({ kind: "step", alone: "thought" });
    expect(rowFate("reasoning", thought, chatView({ reasoning: "hide", toolCalls: "cards" }, [], false))).toEqual({ kind: "hide" });
    expect(rowFate("reasoning", thought, chatView({ toolCalls: "cards" }, [], false))).toEqual({ kind: "step", alone: "keep" });
    expect(skippedStep(thought, chatView({ reasoning: "hide", toolCalls: "cards" }, [], false))).toBe(true);
    const look = chatLook({ reasoning: "fold" });
    expect(thinkingStartsOpen(look, true, false)).toBe(true);
    expect(thinkingStartsOpen(look, false, true)).toBe(false);
    expect(thinkingStartsOpen(chatLook({ reasoning: "expand" }), false, false)).toBe(true);
    expect(thinkingStartsOpen(chatLook({ reasoning: "fold", foldByKind: { thinking: "never" } }), false, false)).toBe(true);
    expect(thinkingStartsOpen(chatLook(undefined), false, true)).toBe(true);
  });

  it("a folded thought's first line is plain words: no Markdown marks, no code fence, one line", () => {
    expect(thoughtFirstLine("**Checking the config**\n\nThen the tests.")).toBe("Checking the config");
    expect(thoughtFirstLine("\n\n## Plan\nmore")).toBe("Plan");
    expect(thoughtFirstLine("- [x] Read `steps.ts` and [the docs](https://x.dev/a_b)")).toBe("Read steps.ts and the docs");
    expect(thoughtFirstLine("> 1. Look at _this_   and   that")).toBe("Look at this and that");
    expect(thoughtFirstLine("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
    expect(thoughtFirstLine("snake_case_name stays and 2 * 3 * 4 too")).toBe("snake_case_name stays and 2 * 3 * 4 too");
    expect(thoughtFirstLine("  \n ")).toBe("");
  });

  it("never redraws prompts; replies only fold into merged steps or show their images", () => {
    expect(rowFate("user_message", { type: "user_message", text: "hi" }, chatView({ toolCalls: "cards" }, [], false))).toEqual({ kind: "keep" });
    expect(rowFate("assistant_message", { type: "assistant_message", text: "ok" }, chatView({ toolCalls: "cards" }, [], false))).toEqual({ kind: "step", alone: "keep" });
    expect(transformedTypes(chatView(undefined, [], false))).not.toContain("assistant_message");
    expect(transformedTypes(chatView({ polish: { images: "small" } }, [], false))).toEqual(["assistant_message"]);
  });

  it("draws plans as the card in the chat, keeping an emptied plan as Paseo draws it, and lets each update end a run then", () => {
    const view = chatView({ toolCalls: "cards" }, [], true);
    const todo = { type: "todo", items: [{ text: "a", completed: false }] };
    expect(rowFate("todo", todo, view)).toEqual({ kind: "steps", data: { steps: [{ text: "a", status: "pending" }] } });
    expect(rowFate("todo", { type: "todo", items: [] }, view)).toEqual({ kind: "keep" });
    // Drawn as its own row where it happened, between the steps before and after it; not passed over.
    expect(skippedStep(todo, view)).toBe(false);
    expect(breaksSteps(todo, view)).toBe(true);
    expect(breaksSteps(todo, chatView({ toolCalls: "cards" }, [], false))).toBe(false);
    expect(rowFate("todo", todo, chatView({ toolCalls: "cards" }, [], false))).toEqual({ kind: "todo" });
    expect(rowFate("todo", todo, chatView(undefined, [], false))).toEqual({ kind: "keep" });
  });

  it("draws pages agents make only while HTML pages are on", () => {
    expect(chatView({ polish: { html: true } }, [], false).pages).toBe(true);
    expect(transformedTypes(chatView({ polish: { html: true } }, [], false))).toEqual(["tool_call"]);
    expect(chatView({ enabled: false, polish: { html: true } }, [], false).pages).toBe(false);
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
    expect(rowFate("tool_call", call({ type: "read", filePath: "a" }), chatView({ toolCalls: "cards" }, [], false))).toEqual({ kind: "step", alone: "tool" });
    const phone = chatView({ toolCalls: "cards", reasoning: "fold", phones: "paseo", hideFinished: ["read"] }, [], false, true);
    expect([phone.draw, phone.toolCalls, phone.merge, phone.reasoning]).toEqual([false, "paseo", false, "show"]);
    expect(rowFate("tool_call", call({ type: "read", filePath: "a" }), phone)).toEqual({ kind: "hide" });
    // "The same as here" draws on phones too.
    expect(chatView({ toolCalls: "cards" }, [], false, true).draw).toBe(true);
  });

  it("fills unset look options with defaults; 0 output lines means show all", () => {
    expect(chatLook(undefined)).toMatchObject({ fold: "finished", outputLines: 12, codeLines: 30, textSize: "medium", codeSize: "medium", density: "normal", timestamps: false, wrap: true, labels: "both", paths: "relative", accent: null, reasoning: "show" });
    expect(chatLook({ outputLines: 0 }).outputLines).toBeNull();
  });

  it("stores a line limit only when it differs from what the setting falls back to, including the code limit inherited from 'show all' output", () => {
    expect(withLineLimit({}, "codeLines", 30)).toEqual({});
    expect(withLineLimit({}, "outputLines", 12)).toEqual({});
    expect(withLineLimit({ outputLines: 0 }, "codeLines", 0)).toEqual({ outputLines: 0 });
    const chosen = withLineLimit({ outputLines: 0 }, "codeLines", 30);
    expect(chosen).toEqual({ outputLines: 0, codeLines: 30 });
    expect(chatLook(chosen).codeLines).toBe(30);
  });

  it("keeps the code limit as shown when terminal output changes what it falls back to", () => {
    const next = withLineLimit({ outputLines: 0 }, "outputLines", 12);
    expect(chatLook(next).outputLines).toBe(12);
    expect(chatLook(next).codeLines).toBeNull();
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
    expect(mcpName("mcp__acme-codebase__search_code")).toEqual({ service: "acme-codebase", action: "Search code" });
    expect(mcpName("Bash")).toBeNull();
    const summary = summarizeToolCall({ type: "tool_call", callId: "c", name: "mcp__x__read_file", detail: { type: "unknown", input: { path: "a" }, output: "ok" }, status: "completed", error: null });
    expect(summary).toMatchObject({ detail: "unknown", subject: "x", body: 'Input\n{\n  "path": "a"\n}\n\nResult\nok' });
    expect(rowFate("tool_call", { type: "tool_call", callId: "c", name: "mcp__x__y", detail: { type: "unknown", input: {}, output: {} }, status: "completed", error: null }, chatView({ toolCalls: "compact" }, [], false))).toEqual({ kind: "step", alone: "tool" });
  });

  it("summarises shell output and failed edits", () => {
    expect(summarizeToolCall(call({ type: "shell", command: "ls", output: "a\nb\n", exitCode: 0 }))?.facts).toEqual(["2 lines"]);
    expect(summarizeToolCall(call({ type: "shell", command: "true", output: "", exitCode: 0 }))?.facts).toEqual(["no output"]);
    expect(summarizeToolCall(call({ type: "edit", filePath: "x", unifiedDiff: "@@ -1 +1 @@\n-a\n+b" }, "failed"))?.facts[0]).toBe("Not applied");
  });

  it("turns everything off with the master switch, but still hides what was hidden", () => {
    const view = chatView({ enabled: false, toolCalls: "cards", reasoning: "fold", notices: true, hideFinished: ["read"], polish: { images: "large" } }, ["error"], false);
    expect([view.draw, view.toolCalls, view.merge, view.reasoning, view.notices, view.images]).toEqual([false, "paseo", false, "show", false, false]);
    expect(rowFate("error", { type: "error", message: "x" }, view)).toEqual({ kind: "hide" });
    expect(rowFate("tool_call", call({ type: "read", filePath: "a" }), view)).toEqual({ kind: "hide" });
    expect(rowFate("assistant_message", { type: "assistant_message", text: "ok" }, view)).toEqual({ kind: "keep" });
    expect(transformedTypes(view).sort()).toEqual(["error", "tool_call"]);
  });

  it("draws errors, notices and compaction as notice rows when asked", () => {
    const view = chatView({ notices: true }, [], false);
    expect(transformedTypes(view).sort()).toEqual(["compaction", "error", "notification"]);
    expect(rowFate("notification", { type: "notification", level: "warning", message: "Rate limited" }, view)).toEqual({ kind: "notice" });
    expect(rowFate("compaction", { type: "compaction", status: "completed" }, chatView(undefined, [], false))).toEqual({ kind: "keep" });
  });

  it("folds per kind, keeps short details open, and opens failures unless asked not to", () => {
    const look = { fold: "finished" as const, foldByKind: { read: "always" as const }, foldMinLines: 3 };
    expect(rowStartsOpen(look, "read", "running", 20)).toBe(false);
    expect(rowStartsOpen(look, "shell", "running", 20)).toBe(true);
    expect(rowStartsOpen(look, "shell", "completed", 2)).toBe(true);
    expect(rowStartsOpen(look, "read", "failed", 50)).toBe(true);
    // Failed calls follow the fold rules like any other when "failed calls start open" is off.
    expect(rowStartsOpen(look, "read", "failed", 50, false)).toBe(false);
    expect(rowStartsOpen({ ...look, fold: "never" }, "shell", "failed", 50, false)).toBe(true);
    expect(polishPrefs({ polish: { failedOpen: false } }).failedOpen).toBe(false);
  });

  it("finds the program a command runs", () => {
    expect(shellProgram("FOO=1 sudo /usr/bin/git status")).toBe("git");
    expect(shellProgram("cd api && npm test")).toBe("npm");
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

  it("reads accent names and colours", () => {
    expect(accentColor("jade")).toBe("#3fb68b");
    expect(accentColor("#123abc")).toBe("#123abc");
    expect(accentColor("theme")).toBeNull();
    expect(accentColor("nope")).toBeNull();
  });

  it("hands Chat Polish's rows the options they share with Morphise's", () => {
    const prefs = polishPrefs({ wrap: false, commandColors: false, labels: "label", strength: "dim", density: "compact", phones: "paseo", reasoning: "expand", polish: { rowIcons: { thought: "hide" } } });
    expect([prefs.diffWrap, prefs.commandColors, prefs.steps, prefs.density, prefs.phoneChat, prefs.reasoning]).toEqual(["off", "expanded", "dim", "compact", "off", "expanded"]);
    // "A label": no icons on any row.
    expect(prefs.rowIcons).toEqual({ steps: "hide", tool: "hide", thought: "hide" });
    expect(polishPrefs({ polish: { rowIcons: { thought: "hide" } } }).rowIcons).toEqual({ steps: "show", tool: "show", thought: "hide" });
    expect(polishPrefs(undefined).commandColors).toBe("always");
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

  it("counts a large change's lines in full and keeps long paths that start alike apart", () => {
    const added = Array.from({ length: 20_000 }, (_, index) => `+line ${index}`).join("\n");
    const root = `/w/${"d".repeat(320)}`;
    const entries = [
      at({ type: "user_message", text: "Big" }, "2026-11-12T10:00:00.000Z"),
      at({ ...call({ type: "edit", filePath: "/w/big.ts", unifiedDiff: `@@ -1 +1,20000 @@\n-old\n${added}` }), callId: "e1" }, "2026-11-12T10:00:10.000Z"),
      at({ ...call({ type: "write", filePath: `${root}/a.ts`, content: "a\nb" }), callId: "w1" }, "2026-11-12T10:00:11.000Z"),
      at({ ...call({ type: "write", filePath: `${root}/b.ts`, content: "c" }), callId: "w2" }, "2026-11-12T10:00:12.000Z"),
    ];
    expect(turnRecap(entries, Date.parse("2026-11-12T10:01:00.000Z"), "completed")?.files).toEqual([
      { path: "/w/big.ts", added: 20_000, removed: 1 },
      { path: `${root}/a.ts`, added: 2, removed: 0 },
      { path: `${root}/b.ts`, added: 1, removed: 0 },
    ]);
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

describe("plans and pages", () => {
  it("keeps a finished plan when finished Other calls are hidden", () => {
    const view = chatView({ toolCalls: "cards", hideFinished: ["other"] }, [], false);
    expect(rowFate("tool_call", { type: "tool_call", name: "plan_approval", status: "completed", detail: { type: "plan", text: "1. Do it" } }, view)).toEqual({ kind: "plan" });
  });

  it("keeps drawing pages after HTML pages is turned off while Morphise draws tool rows", () => {
    expect(chatView({ toolCalls: "cards" }, [], false).pages).toBe(true);
    expect(chatView({}, [], false).pages).toBe(false);
    expect(chatView({ polish: { html: true } }, [], false).pages).toBe(true);
    expect(chatView({ enabled: false, toolCalls: "cards" }, [], false).pages).toBe(false);
  });
});
