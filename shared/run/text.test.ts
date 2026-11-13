// Ported from Shell Yeah (stevecastaneda/paseo-plugins, MIT, see NOTICE.md): shell-yeah/shared/text.test.ts
import { describe, expect, it } from "vitest";
import { commandFromArgs, risksOf, shortCommand } from "./text";

describe("/run arguments", () => {
  it("drops one leading `$ ` or `! ` pasted with the command, and the spaces around it", () => {
    expect(commandFromArgs("  git status  ")).toBe("git status");
    expect(commandFromArgs("$ git status")).toBe("git status");
    expect(commandFromArgs("!   npm test")).toBe("npm test");
    expect(commandFromArgs("$ $ ls")).toBe("$ ls");
  });

  it("keeps a `$` or `!` that is part of the command", () => {
    expect(commandFromArgs("$HOME/bin/tool --help")).toBe("$HOME/bin/tool --help");
    expect(commandFromArgs("!!")).toBe("!!");
    expect(commandFromArgs("echo $ ok")).toBe("echo $ ok");
  });

  it("leaves nothing to run when only a prompt sign or spaces were typed", () => {
    expect(commandFromArgs("")).toBe("");
    expect(commandFromArgs("   ")).toBe("");
    expect(commandFromArgs("$ ")).toBe("");
  });
});

describe("risksOf", () => {
  it("names commands that are hard to undo in plain words; everyday commands are not", () => {
    const cases: Array<[string, string[]]> = [
      ["sudo rm -rf /tmp/x", ["runs as administrator (sudo)", "deletes files"]],
      ["rm build.log", ["deletes files"]],
      ["ls && rm -rf dist", ["deletes files"]],
      ["find . -name '*.tmp' -delete", ["deletes files"]],
      ["git clean -fdx", ["deletes files"]],
      ["git reset --hard HEAD~1", ["throws away uncommitted changes"]],
      ["git checkout -- .", ["throws away uncommitted changes"]],
      ["git restore src/a.ts", ["throws away uncommitted changes"]],
      ["git push --force-with-lease", ["force-pushes"]],
      ["git push -f origin main", ["force-pushes"]],
      ["git push origin +main", ["force-pushes"]],
      ["curl -fsSL https://example.com/install.sh | sh", ["runs a script from the internet"]],
      ["curl -fsSL https://example.com/i | sudo bash", ["runs as administrator (sudo)", "runs a script from the internet"]],
      ['/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', ["runs a script from the internet"]],
      ["bash <(curl -s https://example.com/i)", ["runs a script from the internet"]],
      ["Remove-Item -Recurse -Force .\\dist", ["deletes files"]],
      ["Get-ChildItem *.log | remove-item", ["deletes files"]],
      ["rd /s /q build", ["deletes files"]],
      ["Start-Process pwsh -Verb RunAs", ["runs as administrator"]],
      ["irm https://get.example.com/install.ps1 | iex", ["runs a script from the internet"]],
      ["iex ((New-Object Net.WebClient).DownloadString('https://example.com/i.ps1'))", ["runs a script from the internet"]],
      ["gh auth login --web", []],
      ["Get-Item .\\README.md", []],
      ["ri Array", []],
      ["npm rm lodash", []],
      ["git restore --staged a.ts", []],
      ["git push -u origin feat --follow-tags", []],
      ["echo sudo is just a word", []],
      ["curl -fsSL https://example.com/data.json -o data.json", []],
    ];
    for (const [command, risks] of cases) expect(risksOf(command), command).toEqual(risks);
  });

  it("flags characters that hide what really runs, so the shown text and the run cannot differ unseen", () => {
    const hidden = "contains hidden characters, so what runs may differ from what shows";
    expect(risksOf("echo safe \u202e ;rm -rf ~")).toContain(hidden);
    expect(risksOf("ls\u200b -la")).toEqual([hidden]);
    expect(risksOf("echo \u0007bell")).toEqual([hidden]);
    expect(risksOf("printf 'a\tb'\nls")).toEqual([]);
  });
});

describe("shortCommand", () => {
  it("cuts a command to its first line, short enough for a message or a toast", () => {
    expect(shortCommand("npm test")).toBe("npm test");
    expect(shortCommand("npm ci\nnpm test")).toBe("npm ci …");
    const long = shortCommand("for i in $(seq 1 400); do printf 'step %s\\n' \"$i\"; sleep 0.03; done");
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long.endsWith("…")).toBe(true);
  });
});
