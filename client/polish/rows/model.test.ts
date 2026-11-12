// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/model.test.mjs (the row model and highlighting)
import { describe, expect, it } from "vitest";
import type { ToolCallItem } from "../agent-types";
import { highlight, highlightShell, highlightShellBlock, SYNTAX_THEMES } from "./highlight";
import { agentEventData, detailBody, errorText, imageOnly, noticeData, shownTarget, toolData, toolSchema } from "./model";

const tool = (detail: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ type: "tool_call", callId: "1", name: "Bash", status: "completed", error: null, detail, ...extra }) as unknown as ToolCallItem;

describe("tool rows", () => {
  it("shell: tense follows status, nonzero exit is flagged", () => {
    const running = toolData(tool({ type: "shell", command: "npm test\n--watch" }, { status: "running" }));
    expect(running.verb).toBe("Running");
    expect(running.target).toBe("npm test");
    const failed = toolData(tool({ type: "shell", command: "npm test", exitCode: 1, output: "FAIL" }, { status: "failed", error: { message: "x" } }));
    expect(failed.verb).toBe("Ran");
    expect(failed.meta).toBe("exit 1");
    expect(failed.metaTone).toBe("danger");
    expect(failed.detail?.kind).toBe("output");
  });

  it("edit: counts come from old/new strings when no unified diff", () => {
    const d = toolData(tool({ type: "edit", filePath: "/a/b/c/d/e.ts", oldString: "x\ny", newString: "z" }));
    expect(d.meta).toBe("+1 −2");
    expect(d.target).toBe("…/c/d/e.ts");
    expect(d.path).toBe("/a/b/c/d/e.ts");
    expect(d.detail?.kind === "diff" && d.detail.lines.map((l) => l.sign)).toEqual(["-", "-", "+"]);
  });

  it("edit: unified diff headers are dropped, hunk headers give line numbers", () => {
    const d = toolData(tool({ type: "edit", filePath: "a.ts", unifiedDiff: "--- a\n+++ b\n@@ -12,2 +12 @@\n-old\n+new\n same" }));
    expect(d.detail?.kind === "diff" && d.detail.lines).toEqual([{ sign: "-", text: "old", n: 12 }, { sign: "+", text: "new", n: 12 }, { sign: " ", text: "same", n: 13 }]);
  });

  it("canceled overrides verb and icon; every output passes the renderer schema", () => {
    const d = toolData(tool({ type: "read", filePath: "a.ts" }, { status: "canceled" }));
    expect(d.verb).toBe("Canceled");
    expect(d.icon).toBe("CircleSlash");
    for (const detail of [
      { type: "search", query: "q", numMatches: 1, numFiles: 2, filePaths: ["a"] },
      { type: "search", query: "q", toolName: "web_search", webResults: [{ title: "T", url: "https://x.dev" }] },
      { type: "fetch", url: "https://x.dev", code: 200, bytes: 2048 },
      { type: "worktree_setup", worktreePath: "/w", branchName: "b", log: "", commands: [{ index: 0, command: "npm ci", cwd: "/w", log: "", status: "completed", exitCode: 0 }] },
      { type: "sub_agent", subAgentType: "explore", log: "", actions: [{ index: 0, toolName: "Read" }] },
      { type: "plain_text", label: "Spoke", icon: "mic_vocal" },
      { type: "unknown", input: { id: 1 }, output: null },
      { type: "read", filePath: "/w/a.png", content: "x" },
      { type: "write", filePath: "/w/a.md", content: "a\nb" },
    ]) {
      toolSchema.parse(JSON.parse(JSON.stringify(toolData(tool(detail)))));
    }
    expect(toolData(tool({ type: "search", query: "q", numMatches: 1, numFiles: 2 })).meta).toBe("1 match · 2 files");
    expect(toolData(tool({ type: "plain_text", icon: "mic_vocal" })).icon).toBe("MicVocal");
  });

  it("task notifications drop raw XML and keep the summary", () => {
    const d = toolData(tool({ type: "plain_text", label: "Fix ids", icon: "wrench", text: "<task-notification>…" }, { name: "task_notification" }));
    expect(d.verb).toBe("Background task");
    expect(d.target).toBe("Fix ids");
    expect(d.detail).toBeUndefined();
  });

  it("errors read as one line: message first, never a lone brace", () => {
    expect(errorText({ message: "Command failed\nstack…" })).toBe("Command failed");
    expect(errorText({ code: 1 })).toBe('{"code":1}');
    expect(errorText("\n  boom  \n")).toBe("boom");
    expect(errorText(null)).toBeUndefined();
  });

  it("claude shell failures: exit code goes to meta, tool_result content becomes output", () => {
    const d = toolData(tool({ type: "shell", command: "rg x" }, { status: "failed", error: { type: "tool_result", content: "Exit code 2\nline one\nline two" } }));
    expect(d.meta).toBe("exit 2");
    expect(d.error).toBeUndefined();
    expect(d.detail?.kind === "output" && d.detail.text).toBe("line one\nline two");
    expect(errorText({ type: "tool_result", content: [{ type: "text", text: "\nPermission denied" }] })).toBe("Permission denied");
  });

  it("an agent's finish notice reads as a row: its title, then only its reply", () => {
    const notice = (text: string) => tool({ type: "plain_text", text, icon: "bot" }, { name: "agent_message" });
    const done = agentEventData(notice("Agent 48a6 (Fixture) finished.\n\nServer: srv_1\n\n<agent-response>\nThe chart is a fixture.\n</agent-response>"))!;
    expect([done.verb, done.target, done.mono, done.status, done.detail]).toEqual(["Agent finished", "Fixture", false, "completed", { kind: "prose", text: "The chart is a fixture." }]);
    const failed = agentEventData(notice("Agent 48a6 (Fixture) errored.\n\nServer: srv_1"))!;
    expect([failed.verb, failed.status, failed.detail]).toEqual(["Agent errored", "failed", undefined]);
    // A message from another agent has no status line: Paseo shows it as a prompt.
    expect(agentEventData(notice("Please review the diff."))).toBeUndefined();
    expect(toolSchema.safeParse(done).success).toBe(true);
  });

  it("untyped tools read as words: MCP server › tool, known built-ins, labels as targets, search text", () => {
    const unknown = (name: string, input: unknown = null, output: unknown = null, extra = {}) => toolData(tool({ type: "unknown", input, output }, { name, ...extra }));
    expect([unknown("mcp__github__create_issue").target, unknown("mcp__github__create_issue").icon]).toEqual(["github › Create issue", "Blocks"]);
    expect([unknown("mcp__paseo__create_agent").target, unknown("mcp__paseo__create_agent").icon]).toEqual(["Create agent", "Bot"]);
    expect([unknown("mcp__paseo__browser_reload").icon, unknown("paseo.capture_terminal").icon, unknown("mcp__paseo__create_schedule").icon]).toEqual(["AppWindow", "SquareTerminal", "CalendarClock"]);
    expect(unknown("github.create_issue").target).toBe("github › Create issue");
    const ask = unknown("AskUserQuestion", { description: "Pick one\nmore" }, null, { status: "running" });
    expect([ask.verb, ask.target, ask.icon]).toEqual(["Asking", "Pick one", "MessageCircleQuestion"]);
    const speak = unknown("speak", "Hello there");
    expect([speak.verb, speak.target, speak.detail]).toEqual(["Spoke", "Hello there", undefined]);
    expect(unknown("SomeNewTool").target).toBe("Some new tool");
    const skill = toolData(tool({ type: "plain_text", label: "paseo-plugin" }, { name: "Skill" }));
    expect([skill.verb, skill.target]).toEqual(["Used skill", "paseo-plugin"]);
    const term = toolData(tool({ type: "plain_text", label: "npm test" }, { name: "terminal" }));
    expect([term.verb, term.target, term.shell]).toEqual(["Ran", "npm test", true]);
    expect(toolData(tool({ type: "plain_text", label: "Switching mode" }, { name: "switch_mode" })).verb).toBe("Switch mode");
    const grep = toolData(tool({ type: "search", query: "foo", toolName: "grep", content: "a.ts:1: foo" }));
    expect(grep.detail).toEqual({ kind: "text", text: "a.ts:1: foo" });
    for (const d of [ask, speak, skill, term, grep]) expect(toolSchema.safeParse(d).success).toBe(true);
  });
});

describe("Morphise's additions to tool rows", () => {
  it("draws MCP and unknown tools with their input and result, and copies both", () => {
    const d = toolData(tool({ type: "unknown", input: { path: "a" }, output: "ok" }, { name: "mcp__x__read_file" }));
    expect(d.detail).toEqual({ kind: "io", input: '{\n  "path": "a"\n}', output: "ok" });
    expect(d.kind).toBe("other");
    expect(detailBody(d.detail)).toEqual({ body: 'Input\n{\n  "path": "a"\n}\n\nResult\nok', bodyKind: "output" });
  });

  it("keeps a file tool's whole path, its content, and whether it is a picture", () => {
    const read = toolData(tool({ type: "read", filePath: "/w/assets/logo.png", content: "x\ny" }));
    expect([read.path, read.image, read.kind]).toEqual(["/w/assets/logo.png", true, "read"]);
    expect(detailBody(read.detail)).toEqual({ body: "x\ny", bodyKind: "content" });
    expect(toolData(tool({ type: "read", filePath: "/w/a.ts" })).image).toBeUndefined();
    const write = toolData(tool({ type: "write", filePath: "/w/new.md", content: "a\nb" }));
    expect([write.kind, write.detail]).toEqual(["edit", { kind: "file", text: "a\nb" }]);
  });

  it("names the program a command runs with its icon", () => {
    expect(toolData(tool({ type: "shell", command: "cd api && npm test" })).icon).toBe("Package");
    expect(toolData(tool({ type: "shell", command: "git status" })).icon).toBe("GitBranch");
    expect(toolData(tool({ type: "shell", command: "./run.sh" })).icon).toBe("SquareTerminal");
  });

  it("names files from the workspace folder or in full (File paths), and in short outside the workspace", () => {
    const d = toolData(tool({ type: "read", filePath: "/ws/app/src/cart/total.ts" }));
    expect(shownTarget(d, "relative", "/ws/app")).toBe("src/cart/total.ts");
    expect(shownTarget(d, "absolute", "/ws/app")).toBe("/ws/app/src/cart/total.ts");
    expect(shownTarget(d, "relative", "/elsewhere")).toBe("…/src/cart/total.ts");
    expect(shownTarget(d, "relative", null)).toBe("…/src/cart/total.ts");
    expect(shownTarget(toolData(tool({ type: "shell", command: "ls" })), "absolute", null)).toBe("ls");
  });

  it("gives a diff to Details as unified lines", () => {
    const d = toolData(tool({ type: "edit", filePath: "a.ts", unifiedDiff: "@@ -1 +1 @@\n-a\n+b" }));
    expect(detailBody(d.detail)).toEqual({ body: "-a\n+b", bodyKind: "diff" });
  });
});

describe("notices and images", () => {
  it("notices", () => {
    expect(noticeData({ type: "compaction", status: "completed", trigger: "manual", preTokens: 182400 }).text).toBe("Context manually compacted · 182K tokens");
    expect(noticeData({ type: "compaction", status: "loading" }).pulsing).toBe(true);
    expect(noticeData({ type: "error", message: "boom" }).variant).toBe("inline");
    expect(noticeData({ type: "notification", level: "warning", message: "Rate limited" })).toMatchObject({ variant: "inline", tone: "warning", text: "Rate limited" });
  });

  it("image-only assistant messages are pictures of a step; mixed text is a reply", () => {
    expect(imageOnly("![Image](file:///a.png)![](file:///b.png)\n")).toEqual([{ alt: "Image", url: "file:///a.png" }, { alt: "", url: "file:///b.png" }]);
    expect(imageOnly("Here it is: ![Image](file:///a.png)")).toBeUndefined();
    expect(imageOnly("no images")).toBeUndefined();
  });
});

describe("highlighting", () => {
  it("colors code tokens and keeps every character", () => {
    const line = 'const user = await verifyToken(req.headers.auth) // 401 if "missing"';
    const spans = highlight(line);
    expect(spans.map((s) => s.text).join("")).toBe(line);
    const kind = (t: string) => spans.find((s) => s.text === t)?.kind;
    expect(kind("const")).toBe("keyword");
    expect(kind("await")).toBe("keyword");
    expect(kind("verifyToken")).toBe("function");
    expect(kind("=")).toBe("operator");
    expect(kind('// 401 if "missing"')).toBe("comment");
    expect(highlight('{ "id": 12, "ok": true }').filter((s) => s.kind).map((s) => s.kind).join(" ")).toBe("punctuation string operator number punctuation string operator constant punctuation");
  });

  it("shell: commands after pipes and &&, flags, variables, strings, comments", () => {
    const line = `F=$(rg -l "export" src) && cat $F | head -20 2>&1; sudo npm test # run`;
    const spans = highlightShell(line);
    expect(spans.map((s) => s.text).join("")).toBe(line);
    const kinds = Object.fromEntries(spans.filter((s) => s.kind).map((s) => [s.text, s.kind]));
    expect(kinds.F).toBe("variable");
    expect(kinds.rg).toBe("function");
    expect(kinds["-l"]).toBe("parameter");
    expect(kinds['"export"']).toBe("string");
    expect(kinds.cat).toBe("function");
    expect(kinds.$F).toBe("variable");
    expect(kinds.head).toBe("function");
    expect(kinds["2>&1"]).toBe("operator");
    expect(kinds.sudo).toBe("keyword");
    expect(kinds.npm).toBe("function");
    expect(kinds["# run"]).toBe("comment");
    expect(kinds.test).toBeUndefined();
  });

  it("shell blocks: heredoc bodies are code, the terminator closes them, each line starts a command", () => {
    const text = "python3 - <<'EOF'\nimport json\nEOF\necho done";
    const spans = highlightShellBlock(text);
    expect(spans.map((s) => s.text).join("")).toBe(text);
    const kinds = spans.filter((s) => s.kind).map((s) => `${s.text}:${s.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(["python3:function", "import:keyword", "EOF:keyword", "echo:function"]));
  });

  it("every highlight theme colors every token kind", () => {
    for (const t of SYNTAX_THEMES) {
      expect(Object.keys(t.colors)).toHaveLength(10);
      for (const c of Object.values(t.colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
