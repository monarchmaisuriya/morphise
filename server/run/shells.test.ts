import { describe, expect, it } from "vitest";
import { findShell, shellCommand } from "./shells";

const only = (...paths: string[]) => (path: string) => paths.includes(path);

describe("findShell", () => {
  it("prefers a package manager's copy, so a newer Homebrew bash wins over the system one", () => {
    expect(findShell("bash", only("/opt/homebrew/bin/bash", "/usr/local/bin/bash", "/bin/bash"))).toBe("/opt/homebrew/bin/bash");
    expect(findShell("bash", only("/usr/local/bin/bash", "/bin/bash"))).toBe("/usr/local/bin/bash");
  });

  it("falls back to /bin, then /usr/bin", () => {
    expect(findShell("zsh", only("/bin/zsh", "/usr/bin/zsh"))).toBe("/bin/zsh");
    expect(findShell("sh", only("/usr/bin/sh"))).toBe("/usr/bin/sh");
  });

  it("never looks on the daemon's PATH, so a tool's own bash in a user folder can't take the commands", () => {
    expect(findShell("bash", only("/Users/m/.local/bin/bash", "/Users/m/.npm-global/bin/bash"))).toBeNull();
  });

  it("finds nothing when the program isn't installed", () => {
    expect(findShell("bash", only())).toBeNull();
  });
});

describe("shellCommand", () => {
  it("runs a named shell with -c", () => {
    expect(shellCommand({ PATH: "/Users/m/.local/bin" }, "read -p x n", { platform: "darwin", shell: "bash", exists: only("/Users/m/.local/bin/bash", "/opt/homebrew/bin/bash") })).toEqual({
      file: "/opt/homebrew/bin/bash",
      args: ["-c", "read -p x n"],
    });
  });

  it("says so, instead of using another shell, when the named one isn't installed", () => {
    expect(() => shellCommand({ SHELL: "/bin/zsh" }, "ls", { platform: "linux", shell: "bash", exists: only("/bin/zsh") })).toThrow("bash isn't installed on this computer");
  });

  it("uses the login shell when no shell is named", () => {
    expect(shellCommand({ SHELL: "/bin/zsh" }, "ls", { platform: "darwin", exists: only("/bin/zsh") })).toEqual({ file: "/bin/zsh", args: ["-c", "ls"] });
  });

  it("keeps PowerShell on Windows, whatever shell is named", () => {
    expect(shellCommand({ SystemRoot: "C:\\Windows" }, "dir", { platform: "win32", shell: "bash", exists: only() }).file).toMatch(/powershell\.exe$/);
  });
});
