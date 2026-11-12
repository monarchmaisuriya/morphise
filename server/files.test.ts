import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readImage } from "../shared/files";
import { readImageFile, readTextFile } from "./files";

const folder = mkdtempSync(join(tmpdir(), "morphise-files-"));

describe("file handlers", () => {
  it("reads a small image as a data URI, by its extension", async () => {
    const path = join(folder, "dot.png");
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(await readImageFile({ path })).toEqual({ ok: true, dataUri: "data:image/png;base64,iVBORw==" });
    expect(await readImageFile({ path: join(folder, "notes.txt") })).toMatchObject({ ok: false });
  });

  it("refuses images over 3 MB", async () => {
    const path = join(folder, "big.jpg");
    writeFileSync(path, Buffer.alloc(3 * 1024 * 1024 + 1));
    expect(await readImageFile({ path })).toMatchObject({ ok: false, reason: expect.stringContaining("up to 3 MB") });
  });

  it("reads text, refuses binary files, and says why when a file is missing", async () => {
    const text = join(folder, "a.ts");
    writeFileSync(text, "export const a = 1;\n");
    expect(await readTextFile({ path: text })).toEqual({ ok: true, text: "export const a = 1;\n", truncated: false });
    const binary = join(folder, "b.bin");
    writeFileSync(binary, Buffer.from([1, 0, 2]));
    expect(await readTextFile({ path: binary })).toMatchObject({ ok: false, reason: "A binary file has no text to show" });
    expect(await readTextFile({ path: join(folder, "missing.ts") })).toMatchObject({ ok: false });
  });

  it("reads only the first 1 MB of a big text file", async () => {
    const path = join(folder, "big.log");
    writeFileSync(path, "a".repeat(1024 * 1024 + 10));
    const result = await readTextFile({ path });
    expect(result.ok && result.truncated && result.text.length).toBe(1024 * 1024);
  });

  it("accepts only absolute paths at the contract", () => {
    expect(readImage.input.safeParse({ path: "relative/x.png" }).success).toBe(false);
    expect(readImage.input.safeParse({ path: "/abs/x.png" }).success).toBe(true);
  });
});
