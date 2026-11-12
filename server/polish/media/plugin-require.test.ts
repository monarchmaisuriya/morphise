import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDependency, pluginFolders } from "./plugin-require";

const root = mkdtempSync(join(tmpdir(), "morphise-plugin-folders-"));
const folder = (name: string, withSharp: boolean) => {
  const path = join(root, name);
  mkdirSync(join(path, "node_modules", withSharp ? "sharp" : "other"), { recursive: true });
  return path;
};

describe("finding Morphise's folder", () => {
  it("matches by package name (any install id), needs the dependency, and prefers enabled copies", () => {
    const names: Record<string, string> = {};
    const nameOf = (path: string) => names[path];
    const disabled = folder("disabled", true);
    const installed = folder("installed", true);
    const bare = folder("bare", false);
    const other = folder("other", true);
    Object.assign(names, { [disabled]: "morphise", [installed]: "morphise", [bare]: "morphise", [other]: "paseo-chat-polish" });
    const config = {
      plugins: {
        old: { path: disabled, enabled: false },
        "my-morphise": { path: installed, enabled: true },
        unbuilt: { path: bare },
        "chat-polish": { path: other },
        broken: {},
      },
    };
    expect(pluginFolders(config, "sharp", nameOf)).toEqual([installed, disabled]);
    expect(pluginFolders({}, "sharp", nameOf)).toEqual([]);
  });

  it("loads sharp (CommonJS) and pele (ES module) from this checkout", async () => {
    expect(typeof (await loadDependency<unknown>("sharp"))).toBe("function");
    expect(typeof (await loadDependency<{ render?: unknown }>("pele")).render).toBe("function");
  });
});
