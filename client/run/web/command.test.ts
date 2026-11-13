import { describe, expect, it } from "vitest";
import { runStep, shellCommandOf, shellOf } from "./command";

describe("shellCommandOf", () => {
  it("runs a shell block as written, without its trailing line breaks", () => {
    expect(shellCommandOf("bash", "npm test\n\n")).toBe("npm test");
    expect(shellCommandOf("sh", "cd web\nnpm run build")).toBe("cd web\nnpm run build");
    expect(shellCommandOf("zsh", "git status")).toBe("git status");
    expect(shellCommandOf("shell", "ls -la")).toBe("ls -la");
  });

  it("takes only the prompt lines of a session with output, without their prompts", () => {
    expect(shellCommandOf("console", "$ npm test\n> tests passed\n$ git status\nclean")).toBe("npm test\ngit status");
    expect(shellCommandOf("bash", "$ npm install")).toBe("npm install");
  });

  it("keeps a prompt line's continuation lines, so the shell runs what the block shows", () => {
    expect(shellCommandOf("console", "$ git add src \\\n    docs\n$ git commit -m wip")).toBe("git add src \\\n    docs\ngit commit -m wip");
    expect(shellCommandOf("bash", "$ rm -rf build \\\n  dist \\\n  out\n$ npm run build\nbuilt")).toBe("rm -rf build \\\n  dist \\\n  out\nnpm run build");
  });

  it("gives no command for a session it cannot read safely: a continued line shown with the shell's > prompt, or a heredoc", () => {
    expect(shellCommandOf("console", "$ echo a \\\n> b")).toBeNull();
    expect(shellCommandOf("console", "$ cat <<EOF\nhello\nEOF")).toBeNull();
    expect(shellCommandOf("console", "$ grep x <<< \"$v\"")).toBe("grep x <<< \"$v\"");
  });

  it("runs an untagged block only when every line is a prompt", () => {
    expect(shellCommandOf(null, "$ make build")).toBe("make build");
    expect(shellCommandOf(null, "make build")).toBeNull();
    expect(shellCommandOf(null, "$ make\nbuilding...")).toBeNull();
  });

  it("leaves other languages and empty blocks alone", () => {
    expect(shellCommandOf("ts", "console.log(1)")).toBeNull();
    expect(shellCommandOf("python", "$ x")).toBeNull();
    expect(shellCommandOf("bash", "  \n")).toBeNull();
    expect(shellCommandOf("console", "no prompt here")).toBeNull();
  });

  it("reads the fence language case-insensitively and ignores what follows it", () => {
    expect(shellCommandOf("Bash", "echo hi")).toBe("echo hi");
    expect(shellCommandOf("bash title=x", "echo hi")).toBe("echo hi");
  });
});

describe("runStep", () => {
  it("starts a safe command in its chat at once", () => {
    expect(runStep("npm test", "a1", [], false)).toEqual({ kind: "start", agentId: "a1", command: "npm test" });
  });

  it("asks before a risky command, then starts it once confirmed", () => {
    expect(runStep("rm -rf build", "a1", ["Deletes files"], false)).toEqual({ kind: "confirm", risks: ["Deletes files"] });
    expect(runStep("rm -rf build", "a1", ["Deletes files"], true)).toEqual({ kind: "start", agentId: "a1", command: "rm -rf build" });
  });

  it("does nothing without a command, and says so without a chat", () => {
    expect(runStep(null, "a1", [], false)).toEqual({ kind: "skip" });
    expect(runStep("ls", null, [], false)).toEqual({ kind: "no-chat" });
  });
});

describe("shellOf", () => {
  it("names the shell a fence asks for, and leaves the rest to the login shell", () => {
    expect([shellOf("bash"), shellOf("sh"), shellOf("zsh"), shellOf("Bash title=x")]).toEqual(["bash", "sh", "zsh", "bash"]);
    expect([shellOf("shell"), shellOf("console"), shellOf("shell-session"), shellOf(null), shellOf("")]).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});
