// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/server/shells.ts
import { accessSync, constants, statSync } from "node:fs";
import { basename, join, win32 } from "node:path";
import type { BlockShell } from "../../shared/run/row";

// The shell that runs a command, with the arguments that hand it the command.
// macOS and Linux: the shell the code block named, else the user's login shell, non-interactive, so
// startup files like .zshrc don't load. A named shell that isn't installed fails the run: running the
// command in another shell would fail it later, and less clearly.
// Windows: PowerShell, the shell Windows Terminal opens, without the user's profile for the same reason.
export function shellCommand(
  env: NodeJS.ProcessEnv,
  command: string,
  { platform = process.platform, shell, exists = isExecutable }: { platform?: NodeJS.Platform; shell?: BlockShell; exists?: (path: string) => boolean } = {},
): { file: string; args: string[] } {
  if (!blockShellApplies(platform)) return { file: pickPowerShell(env), args: ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShell(command)] };
  if (shell) {
    const file = findShell(shell, exists);
    if (!file) throw new Error(`${shell} isn't installed on this computer`);
    return { file, args: ["-c", command] };
  }
  return { file: pickShell(env.SHELL, exists), args: ["-c", command] };
}

// Windows runs PowerShell for every block; elsewhere a block's fence picks the shell.
export const blockShellApplies = (platform: NodeJS.Platform = process.platform) => platform !== "win32";

// A program file this user may run; a folder named `bash` is not one.
function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Where a code block's shell is looked for: package managers' folders (a newer Homebrew bash first), then
// the system's. Not the daemon's PATH: a tool that installs its own `bash` into ~/.local/bin or an npm
// folder must not receive every command.
const SHELL_FOLDERS = ["/opt/homebrew/bin", "/usr/local/bin", "/bin", "/usr/bin"];

export function findShell(name: BlockShell, exists: (path: string) => boolean = isExecutable): string | null {
  for (const folder of SHELL_FOLDERS) {
    const path = join(folder, name);
    if (exists(path)) return path;
  }
  return null;
}

const SHELLS = new Set(["zsh", "bash", "sh", "dash", "ksh", "fish"]);

export function pickShell(preferred: string | undefined, exists: (path: string) => boolean = isExecutable): string {
  const candidates = [preferred && SHELLS.has(basename(preferred)) ? preferred : null, "/bin/bash", "/bin/sh"];
  for (const candidate of candidates) if (candidate && exists(candidate)) return candidate;
  return "/bin/sh";
}

// PowerShell 7 when it's on the PATH, else the Windows PowerShell every Windows ships.
function pickPowerShell(env: NodeJS.ProcessEnv): string {
  for (const dir of (env.PATH ?? env.Path ?? "").split(";").filter(Boolean)) {
    const pwsh = win32.join(dir, "pwsh.exe");
    try {
      accessSync(pwsh);
      return pwsh;
    } catch {
      continue;
    }
  }
  return win32.join(env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

// -EncodedCommand takes the script as base64 UTF-16, so no quote in it can be misread on the way.
// Before it: UTF-8 output, which Windows PowerShell doesn't default to. After it: the exit code
// of the last program that failed, as bash would give, since PowerShell's own is only 0 or 1.
export function encodePowerShell(command: string): string {
  const script = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    command,
    "if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }",
  ].join("\n");
  return Buffer.from(script, "utf16le").toString("base64");
}
