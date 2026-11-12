// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): pluginRequire in server/image.ts
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Big or native npm packages (sharp, pele) are never bundled: Paseo's compiler breaks them. They load
// at run time from this plugin's own node_modules. Paseo evaluates the server bundle from a string,
// so import.meta.url is empty there and a bare require resolves from Paseo's folder; this plugin's
// folder is the one Paseo records for it in $PASEO_HOME/config.json (`plugins.<id>.path`). The id
// is "morphise" unless it was installed with `--id`, so the folder is found by its package name.

const PACKAGE_NAME = "morphise";

type ConfigEntry = { path?: string; enabled?: boolean };

const paseoHome = () => process.env.PASEO_HOME || join(homedir(), ".paseo");

const packageName = (folder: string) => {
  try {
    return (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { name?: unknown }).name;
  } catch {
    return undefined;
  }
};

/** Morphise's folders in Paseo's plugin config that hold `dependency`, enabled ones first. */
export function pluginFolders(config: { plugins?: Record<string, ConfigEntry> }, dependency: string, nameOf = packageName): string[] {
  return Object.values(config.plugins ?? {})
    .filter((entry): entry is ConfigEntry & { path: string } => typeof entry?.path === "string" && nameOf(entry.path) === PACKAGE_NAME)
    .filter((entry) => existsSync(join(entry.path, "node_modules", dependency)))
    .sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false))
    .map((entry) => entry.path);
}

function requireFromConfig(dependency: string) {
  const config = JSON.parse(readFileSync(join(paseoHome(), "config.json"), "utf8")) as { plugins?: Record<string, ConfigEntry> };
  const [folder] = pluginFolders(config, dependency);
  if (!folder) throw new Error(`No Morphise folder with node_modules/${dependency} in Paseo's plugin config`);
  return createRequire(join(folder, "package.json"));
}

// From this file when the module has a URL (tests, a plain Node run), else from Paseo's config.
function requireFor(dependency: string) {
  try {
    const own = createRequire(import.meta.url);
    own.resolve(dependency);
    return own;
  } catch {
    return requireFromConfig(dependency);
  }
}

/** Loads an npm package from Morphise's node_modules. ES-only packages (pele) load through import(). */
export async function loadDependency<T>(name: string): Promise<T> {
  const require = requireFor(name);
  try {
    return require(name) as T;
  } catch (error) {
    if ((error as { code?: string }).code !== "ERR_REQUIRE_ESM") throw error;
    return (await import(pathToFileURL(require.resolve(name)).href)) as T;
  }
}

/**
 * A dependency loaded on first use and kept. A failed load is logged once and gives null from then
 * on, so the feature that needs it falls back (no thumbnails, the diagram's source) instead of failing.
 */
export function optionalDependency<T>(name: string, fallback: string) {
  let loaded: Promise<T | null> | undefined;
  return () =>
    (loaded ??= loadDependency<T>(name).catch((error: unknown) => {
      console.error(`[morphise] ${name} unavailable, ${fallback}`, error);
      return null;
    }));
}
