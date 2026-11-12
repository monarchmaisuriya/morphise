// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/icons.test.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { HUGEICONS, hugeicon, roundPath, UNTITLED, untar, untitledIcon } from "./icons";

describe("icon sets", () => {
  it("rounding keeps packed path numbers apart", () => {
    expect(roundPath("l-.17.213")).toBe("l-.17 0.21");
    expect(roundPath("l-.334.998a2")).toBe("l-0.33 1a2");
    expect(roundPath("l.003.02")).toBe("l0 .02");
    expect(roundPath("M12 2v3")).toBe("M12 2v3");
  });

  it("untar reads a package's files, long paths included", () => {
    const dir = mkdtempSync(join(tmpdir(), "morphise-untar-"));
    const deep = `package/${"d".repeat(60)}/${"e".repeat(60)}`;
    mkdirSync(join(dir, deep), { recursive: true });
    writeFileSync(join(dir, "package/icons.json"), '{"icons":{}}');
    writeFileSync(join(dir, deep, "Check.mjs"), "x".repeat(700));
    // npm packs ustar with pax records for long names; GNU and BSD tar both write either on request.
    for (const format of ["ustar", "pax"]) {
      execFileSync("tar", [`--format=${format}`, "-czf", join(dir, `${format}.tgz`), "-C", dir, "package"]);
      const files = untar(gunzipSync(readFileSync(join(dir, `${format}.tgz`))));
      expect(files.get("package/icons.json"), format).toBe('{"icons":{}}');
      expect(files.get(`${deep}/Check.mjs`), format).toBe("x".repeat(700));
    }
  });

  it("icons read from each package's format", () => {
    const component = 'e.createElement("path",{d:"M20 6 9 17l-5-5"}),e.createElement("path",{fillRule:"evenodd",d:"M1 1h2"})';
    expect(untitledIcon(component, "Check")).toBe('<path d="M20 6 9 17l-5-5"/><path fill-rule="evenodd" d="M1 1h2"/>');
    expect(() => untitledIcon(undefined, "Missing")).toThrow();
    const set = { icons: { check: { body: '<path stroke="currentColor" d="m5 13.261 2.5 2.5"/>' } }, aliases: { tick: { parent: "check" } } };
    expect(hugeicon(set, "tick")).toBe('<path d="m5 13.26 2.5 2.5"/>');
    expect(() => hugeicon(set, "missing")).toThrow();
  });

  it("both sets map the same Lucide names", () => {
    expect(Object.keys(UNTITLED).sort()).toEqual(Object.keys(HUGEICONS).sort());
  });
});
