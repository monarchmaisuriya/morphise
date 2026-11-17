// What a chat did, folded from its Claude Code or Codex log: prompts, skill calls, MCP calls, shell calls, file reads
// and writes, per 15-minute slot, plus skill, MCP tool and model names. Counting rules after Activity by koinzhang
// (koinzhang/paseo-plugins, activity/, MIT, see NOTICE.md): shared/classify.ts at 83a1c90, reading the provider's log
// instead of Paseo's timeline (a timeline read resumes a stored agent).
import { type ChatActivity, emptySlot, type NamedUse, type SlotCounts, slotOf } from "../../shared/activity";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as RecordValue) : {});
const text = (value: unknown) => (typeof value === "string" ? value : "");

// Text a provider or Paseo puts in a user message that the user did not type.
const NOT_TYPED = ["<task-notification", "<chat-history-summary", "<paseo-system", "<system_instruction", "<system-reminder", "<local-command-", "<command-stdout", "<bash-", "<environment_context", "<user_instructions", "# AGENTS.md instructions", "[Request interrupted"];
export function isTypedPrompt(body: string): boolean {
  const start = body.trimStart();
  return !NOT_TYPED.some((prefix) => start.startsWith(prefix));
}

const SHELL = new Set(["Bash", "exec", "shell", "exec_command", "local_shell"]);
const READS = new Set(["Read"]);
const WRITES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "apply_patch"]);
// Shell commands that change files or the repo, as Activity's MUTATING_SHELL_HEADS.
const MUTATING = new Set(["rm", "mv", "cp", "mkdir", "rmdir", "touch", "sed", "tee", "npm", "pnpm", "yarn", "bun", "pip", "pip3", "cargo", "make", "tsc", "vite", "go", "chmod", "ln"]);
const MUTATING_GIT = new Set(["add", "commit", "checkout", "switch", "push", "pull", "merge", "rebase", "reset", "restore", "stash", "worktree", "cherry-pick", "revert", "tag", "rm", "mv", "apply"]);
const MAX_OPEN = 500;

export function changesFiles(command: string): boolean {
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const words = part.trim().split(/\s+/).filter((word) => !/^\w+=/.test(word));
    const head = words[0]?.split("/").pop() ?? "";
    if (head === "git") {
      // The subcommand is the first word after git's own options; -C and -c take a value.
      let index = 1;
      while (index < words.length && words[index].startsWith("-")) index += words[index] === "-C" || words[index] === "-c" ? 2 : 1;
      if (MUTATING_GIT.has(words[index] ?? "")) return true;
      continue;
    }
    if (MUTATING.has(head)) return true;
  }
  return false;
}

// The small state between lines that a saved read position must carry with it.
export interface ActivityPending {
  // MCP calls waiting for their result: tool id -> MCP name.
  openMcp: Record<string, string>;
  // Slots of Claude prompts still waiting for the model that answers them.
  awaitingModel: number[];
  // Codex: the model of the current turn.
  model: string | null;
}

export class ActivityFold {
  readonly activity: ChatActivity = { slots: {}, skills: {}, mcp: {}, coding: false };
  pending: ActivityPending = { openMcp: {}, awaitingModel: [], model: null };
  // The newest line time counted so far.
  lastAt = 0;
  private seenTools = new Set<string>();

  // `since`: lines older than this are not counted (the index passes the agent's creation, so history a forked or
  // resumed chat's log copied from another chat is counted once, by the chat it belongs to).
  constructor(
    readonly provider: "codex" | "claude",
    private since = 0,
  ) {}

  static restore(provider: "codex" | "claude", activity: ChatActivity, pending: ActivityPending, since = 0): ActivityFold {
    const fold = new ActivityFold(provider, since);
    Object.assign(fold.activity, activity);
    fold.pending = pending;
    return fold;
  }

  apply(value: unknown) {
    const row = record(value);
    const at = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (!Number.isFinite(at) || at < this.since) return;
    this.lastAt = Math.max(this.lastAt, at);
    if (this.provider === "codex") this.codex(row, at);
    else this.claude(row, at);
  }

  private slot(at: number): SlotCounts {
    const key = String(slotOf(at));
    return (this.activity.slots[key] ??= emptySlot());
  }

  private use(map: Record<string, NamedUse>, name: string, at: number) {
    const use = (map[name] ??= { count: 0, failures: 0, lastAt: at });
    use.count++;
    use.lastAt = Math.max(use.lastAt, at);
  }

  private model(slot: SlotCounts, model: string) {
    slot.models ??= {};
    slot.models[model] = (slot.models[model] ?? 0) + 1;
  }

  private tool(name: string, input: RecordValue, id: string, at: number) {
    if (id) {
      if (this.seenTools.has(id)) return;
      this.seenTools.add(id);
    }
    const slot = this.slot(at);
    if (name === "Skill" || name === "skill") {
      const skill = text(input.skill) || text(input.name) || text(input.command);
      if (skill) {
        slot.k++;
        this.use(this.activity.skills, skill, at);
      }
      return;
    }
    const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
    const dotted = this.provider === "codex" && /^[\w-]+\.[\w-]+$/.test(name);
    if (mcp || dotted) {
      const label = mcp ? `${mcp[1]}.${mcp[2]}` : name;
      slot.m++;
      this.use(this.activity.mcp, label, at);
      if (id && this.provider === "claude") {
        if (Object.keys(this.pending.openMcp).length >= MAX_OPEN) this.pending.openMcp = {};
        this.pending.openMcp[id] = label;
      }
      return;
    }
    if (READS.has(name)) {
      const path = text(input.file_path);
      if (path.endsWith("/SKILL.md")) {
        // Reading a skill's own instructions is using it (Activity's "inferred" tier).
        const skill = path.split("/").at(-2) ?? "";
        if (skill) {
          slot.k++;
          this.use(this.activity.skills, skill, at);
          return;
        }
      }
      slot.r++;
      return;
    }
    if (WRITES.has(name)) {
      slot.w++;
      this.activity.coding = true;
      return;
    }
    if (SHELL.has(name)) {
      slot.x++;
      if (!this.activity.coding && changesFiles(text(input.command))) this.activity.coding = true;
    }
  }

  private claude(row: RecordValue, at: number) {
    if (row.isSidechain === true) return;
    const message = record(row.message);
    const content = Array.isArray(message.content) ? message.content.map(record) : null;
    if (row.type === "user") {
      if (content) {
        for (const block of content) {
          if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
          const name = this.pending.openMcp[block.tool_use_id];
          if (name === undefined) continue;
          delete this.pending.openMcp[block.tool_use_id];
          if (block.is_error === true && this.activity.mcp[name]) this.activity.mcp[name].failures++;
        }
      }
      if (row.isMeta === true || row.origin !== undefined || row.isCompactSummary === true) return;
      let body: string | null = null;
      if (typeof message.content === "string") body = message.content;
      else if (content && !content.some((block) => block.type === "tool_result")) {
        const first = content.find((block) => block.type === "text");
        body = first ? text(first.text) : content.some((block) => block.type === "image") ? "" : null;
      }
      if (body === null || !isTypedPrompt(body)) return;
      this.slot(at).p++;
      this.pending.awaitingModel.push(slotOf(at));
      return;
    }
    if (row.type !== "assistant" || !content) return;
    const model = text(message.model);
    if (model && model !== "<synthetic>" && this.pending.awaitingModel.length) {
      for (const slot of this.pending.awaitingModel) this.model((this.activity.slots[String(slot)] ??= emptySlot()), model);
      this.pending.awaitingModel = [];
    }
    for (const block of content) if (block.type === "tool_use") this.tool(text(block.name), record(block.input), text(block.id), at);
  }

  private codex(row: RecordValue, at: number) {
    const payload = record(row.payload);
    if (row.type === "turn_context") {
      const model = text(payload.model);
      if (model) this.pending.model = model;
      return;
    }
    if (row.type !== "response_item") return;
    if (payload.type === "message" && payload.role === "user") {
      const parts = Array.isArray(payload.content) ? payload.content.map(record) : [];
      const body = text(parts.find((part) => part.type === "input_text")?.text);
      if (!body.trim() && !parts.some((part) => part.type === "input_image")) return;
      if (!isTypedPrompt(body)) return;
      const slot = this.slot(at);
      slot.p++;
      if (this.pending.model) this.model(slot, this.pending.model);
      return;
    }
    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      let input: RecordValue = {};
      if (typeof payload.arguments === "string") {
        try {
          input = record(JSON.parse(payload.arguments));
        } catch {
          input = {};
        }
      }
      const command = Array.isArray(input.command) ? input.command.filter((word) => typeof word === "string").join(" ") : text(input.command) || text(input.cmd);
      this.tool(text(payload.name), { ...input, command }, text(payload.call_id), at);
    }
  }
}
