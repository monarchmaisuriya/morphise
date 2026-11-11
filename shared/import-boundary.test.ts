import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Paseo builds an installed plugin without its node_modules and supplies only `@getpaseo/plugin`
// (and React, React Native, Zod). Importing another `@getpaseo/*` package, even for types,
// passes locally but fails the install build: "Could not resolve type dependency".
const ROOT = join(__dirname, "..");

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("plugin imports", () => {
  it("use no Paseo package other than @getpaseo/plugin", () => {
    const offenders = sources(ROOT).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/from\s+"(@getpaseo\/[^"]+)"/g)]
        .map((match) => match[1])
        .filter((module) => module !== "@getpaseo/plugin" && !module.startsWith("@getpaseo/plugin/"))
        .map((module) => `${relative(ROOT, path)}: ${module}`),
    );
    expect(offenders).toEqual([]);
  });

  it("take icons from Morphise's kit, which keeps them from being squeezed in crowded rows", () => {
    const offenders = sources(ROOT)
      .filter((path) => relative(ROOT, path) !== join("client", "ui", "kit.tsx"))
      .filter((path) => /import\s*\{[^}]*\bIcon\b[^}]*\}\s*from\s*"@getpaseo\/plugin\/client\/ui"/.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);
  });
});
