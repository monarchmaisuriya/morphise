import { describe, expect, it } from "vitest";
import { chatTools, SLOT_MS, slotOf } from "../../shared/activity";
import { ActivityFold, changesFiles, isTypedPrompt } from "./fold-activity";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 17, 10, 0) + minutes * 60_000).toISOString();
const user = (minutes: number, content: unknown, extra: Record<string, unknown> = {}) => ({ type: "user", timestamp: at(minutes), message: { role: "user", content }, ...extra });
const assistant = (minutes: number, blocks: unknown[], model = "claude-opus-5-5") => ({ type: "assistant", timestamp: at(minutes), message: { id: `m${minutes}`, model, content: blocks } });
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}) => ({ type: "tool_use", id, name, input });
const result = (minutes: number, id: string, isError = false) => user(minutes, [{ type: "tool_result", tool_use_id: id, is_error: isError, content: "x" }]);

describe("ActivityFold, Claude", () => {
  it("counts typed prompts only, and gives each the model that answers it", () => {
    const fold = new ActivityFold("claude");
    for (const row of [
      user(0, "fix the bug"),
      user(1, [{ type: "text", text: "and this" }]),
      user(2, [{ type: "image" }]),
      user(3, "<command-name>/review</command-name>"),
      user(4, "<task-notification><task-id>x</task-id></task-notification>", { origin: { kind: "task-notification" } }),
      user(5, "<task-notification>no origin</task-notification>"),
      user(6, [{ type: "text", text: "<chat-history-summary>old</chat-history-summary>" }]),
      user(7, '<paseo-system version="1">note</paseo-system>'),
      user(8, [{ type: "text", text: "[Request interrupted by user]" }]),
      user(9, "<system_instruction>x</system_instruction>"),
      user(10, "<local-command-stdout>ok</local-command-stdout>"),
      user(11, "meta", { isMeta: true }),
      user(12, "side", { isSidechain: true }),
      assistant(13, [{ type: "text", text: "done" }]),
    ])
      fold.apply(row);
    const tools = chatTools(fold.activity);
    expect(tools.prompts).toBe(4);
    const models = Object.values(fold.activity.slots).flatMap((slot) => Object.entries(slot.models ?? {}));
    expect(models).toEqual([["claude-opus-5-5", 4]]);
    expect(fold.pending.awaitingModel).toEqual([]);
  });

  it("sorts tool calls into skills, MCP, shell, reads and writes, once per tool id", () => {
    const fold = new ActivityFold("claude");
    for (const row of [
      user(0, "go"),
      assistant(1, [toolUse("a", "Bash", { command: "ls" }), toolUse("b", "Bash", { command: "npm test" }), toolUse("c", "Bash", { command: "git status" })]),
      assistant(1, [toolUse("a", "Bash", { command: "ls" })]),
      assistant(2, [toolUse("d", "Skill", { skill: "review" }), toolUse("e", "Read", { file_path: "/x/.claude/skills/plan/SKILL.md" }), toolUse("f", "Read", { file_path: "/x/a.ts" })]),
      assistant(3, [toolUse("g", "mcp__notion__notion-search", {}), toolUse("h", "mcp__notion__notion-search", {}), toolUse("i", "Edit", {}), toolUse("j", "TaskCreate", {})]),
      result(4, "g", true),
      result(4, "h", false),
    ])
      fold.apply(row);
    const tools = chatTools(fold.activity);
    expect(tools).toMatchObject({ shellCalls: 3, skillCalls: 2, fileReads: 1, fileWrites: 1, mcpCalls: 2, mcpFailures: 1, toolsExplored: 3 });
    expect(tools.skills.map((skill) => skill.name).sort()).toEqual(["plan", "review"]);
    expect(tools.mcp).toEqual([{ name: "notion.notion-search", count: 2, failures: 1, lastAt: Date.parse(at(3)) }]);
    expect(fold.activity.coding).toBe(true);
    expect(fold.pending.openMcp).toEqual({});
  });

  it("is not a coding chat from reads and read-only commands alone", () => {
    const fold = new ActivityFold("claude");
    fold.apply(assistant(0, [toolUse("a", "Bash", { command: "git log --oneline | head" }), toolUse("b", "Read", { file_path: "/a" })]));
    expect(fold.activity.coding).toBe(false);
  });

  it("puts each count in its 15-minute slot", () => {
    const fold = new ActivityFold("claude");
    fold.apply(user(0, "a"));
    fold.apply(user(14, "b"));
    fold.apply(user(15, "c"));
    const start = slotOf(Date.parse(at(0)));
    expect(fold.activity.slots[String(start)].p).toBe(2);
    expect(fold.activity.slots[String(start + 1)].p).toBe(1);
    expect(SLOT_MS).toBe(900_000);
  });

  it("carries a prompt waiting for its model across a saved position", () => {
    const first = new ActivityFold("claude");
    first.apply(user(0, "a"));
    first.apply(assistant(1, [toolUse("m", "mcp__x__y")]));
    first.apply(user(2, "b"));
    const saved = JSON.parse(JSON.stringify({ activity: first.activity, pending: first.pending }));
    const second = ActivityFold.restore("claude", saved.activity, saved.pending);
    second.apply(result(3, "m", true));
    second.apply(assistant(4, [{ type: "text", text: "ok" }], "claude-sonnet-5-5"));
    const models = Object.values(second.activity.slots).flatMap((slot) => Object.entries(slot.models ?? {}));
    expect(models.sort()).toEqual([["claude-opus-5-5", 1], ["claude-sonnet-5-5", 1]]);
    expect(second.activity.mcp["x.y"].failures).toBe(1);
  });
});

describe("ActivityFold, Codex", () => {
  const item = (minutes: number, payload: Record<string, unknown>) => ({ type: "response_item", timestamp: at(minutes), payload });
  it("counts typed user messages with the turn's model, and exec and patch calls", () => {
    const fold = new ActivityFold("codex");
    for (const row of [
      { type: "turn_context", timestamp: at(0), payload: { model: "gpt-6-luna" } },
      item(0, { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for /x" }, { type: "input_text", text: "<environment_context>" }] }),
      item(1, { type: "message", role: "user", content: [{ type: "input_text", text: "<system_instruction>x" }] }),
      item(1, { type: "message", role: "user", content: [{ type: "input_text", text: "" }] }),
      item(2, { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }),
      item(3, { type: "custom_tool_call", name: "exec", call_id: "c1", input: "const x = 1" }),
      item(3, { type: "function_call", name: "shell", call_id: "c2", arguments: JSON.stringify({ command: ["git", "commit", "-m", "x"] }) }),
      item(4, { type: "custom_tool_call", name: "apply_patch", call_id: "c3", input: "*** Begin Patch" }),
      item(5, { type: "function_call", name: "notion.search", call_id: "c4", arguments: "{}" }),
    ])
      fold.apply(row);
    expect(chatTools(fold.activity)).toMatchObject({ prompts: 1, shellCalls: 2, fileWrites: 1, mcpCalls: 1 });
    expect(Object.values(fold.activity.slots).flatMap((slot) => Object.entries(slot.models ?? {}))).toEqual([["gpt-6-luna", 1]]);
    expect(fold.activity.coding).toBe(true);
  });
});

describe("helpers", () => {
  it("tells typed text from wrappers", () => {
    expect(isTypedPrompt("  hello")).toBe(true);
    expect(isTypedPrompt("<command-name>/x</command-name>")).toBe(true);
    expect(isTypedPrompt("<command-message>review</command-message>\n<command-name>/review</command-name>")).toBe(true);
    expect(isTypedPrompt("<task-notification>")).toBe(false);
  });
  it("finds commands that change files", () => {
    expect(changesFiles("FOO=1 npm install")).toBe(true);
    expect(changesFiles("git -C /x commit -m y")).toBe(true);
    expect(changesFiles("git diff && cat a | grep b")).toBe(false);
    expect(changesFiles("/bin/rm -f a")).toBe(true);
  });
});
