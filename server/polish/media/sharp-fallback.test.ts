import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Paseo's macOS app loads only code signed by its own team, so it refuses sharp's native binary; sharp then loads its
// WebAssembly build, which must be installed and match sharp's own version.
describe("sharp's WebAssembly fallback", () => {
  const { dependencies } = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };

  it("is a dependency at exactly sharp's version", () => {
    expect(dependencies.sharp).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dependencies["@img/sharp-wasm32"]).toBe(dependencies.sharp);
  });
});
