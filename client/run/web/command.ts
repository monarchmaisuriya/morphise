// The command a code block in a reply holds, when it is a shell block: the fence language says so
// (sh, bash, zsh, shell, console, shell-session), or an untagged block is all `$ ` prompt lines.
// A block that shows a session (prompt lines and their output) runs its prompt lines only.

const SHELL_LANGUAGES = new Set(["sh", "bash", "zsh", "shell", "console", "shell-session", "shellsession"]);
const PROMPT = /^\$ /;
// `<<WORD` or `<<-WORD` (not a `<<<` here-string, which stays on its line).
const HEREDOC = /(^|[^<])<<-?\s*['"]?[A-Za-z_]/;

export function shellCommandOf(language: string | null, code: string): string | null {
  const fence = language?.trim().split(/\s+/)[0]?.toLowerCase() || null;
  if (fence !== null && !SHELL_LANGUAGES.has(fence)) return null;
  const lines = code.replace(/\s+$/, "").split("\n");
  const written = lines.filter((line) => line.trim() !== "");
  if (written.length === 0) return null;
  const prompts = written.filter((line) => PROMPT.test(line));
  const session = fence === "console" || fence === "shell-session" || fence === "shellsession";
  // Untagged: only an all-prompt block is clearly a command.
  if (fence === null && prompts.length !== written.length) return null;
  if (prompts.length > 0 || session) return promptCommands(lines);
  return lines.join("\n");
}

// A session's commands: each prompt line, with the lines it continues onto (a trailing backslash),
// so the shell runs what the block shows. A continued line shown with the shell's `> ` prompt, or a
// heredoc, cannot be told apart from output safely: no command then.
function promptCommands(lines: readonly string[]): string | null {
  const commands: string[] = [];
  let continuing = false;
  for (const line of lines) {
    if (continuing) {
      if (line.startsWith(">")) return null;
      commands[commands.length - 1] += `\n${line}`;
    } else if (PROMPT.test(line)) {
      const command = line.replace(PROMPT, "");
      if (HEREDOC.test(command)) return null;
      commands.push(command);
    } else continue;
    continuing = line.endsWith("\\");
  }
  return commands.length ? commands.join("\n") : null;
}

// What a press on Run does: nothing without a command, an error without a chat, a confirm for a risky
// command not yet confirmed, otherwise start it.
export type RunStep = { kind: "skip" } | { kind: "no-chat" } | { kind: "confirm"; risks: string[] } | { kind: "start"; agentId: string; command: string };

export function runStep(command: string | null, agentId: string | null, risks: readonly string[], confirmed: boolean): RunStep {
  if (!command) return { kind: "skip" };
  if (!agentId) return { kind: "no-chat" };
  if (risks.length && !confirmed) return { kind: "confirm", risks: [...risks] };
  return { kind: "start", agentId, command };
}
