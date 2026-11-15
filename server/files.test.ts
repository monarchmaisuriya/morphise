import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readImage } from "../shared/files";
import { readImageFile, readTextFile } from "./files";

const folder = mkdtempSync(join(tmpdir(), "morphise-files-"));

describe("file handlers", () => {
  it("reads an image as a data URI of its tile-sized preview, by its extension and its bytes", async () => {
    // The tile is at most 520 × 260; the preview fits 960 × 600, so a large original is never sent.
    const path = join(folder, "wide.png");
    writeFileSync(path, await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "blue" } }).png().toBuffer());
    const result = await readImageFile({ path });
    if (!result.ok) throw new Error(result.reason);
    expect(result.dataUri).toMatch(/^data:image\/webp;base64,/);
    const preview = await sharp(Buffer.from(result.dataUri.split(",")[1]!, "base64")).metadata();
    expect([preview.width, preview.height]).toEqual([960, 480]);
    expect(await readImageFile({ path: join(folder, "notes.txt") })).toMatchObject({ ok: false });
  });

  it("refuses a file renamed to look like an image, and a bitmap the chat's image reader does not serve", async () => {
    const renamed = join(folder, "secret.png");
    writeFileSync(renamed, "not a picture");
    expect(await readImageFile({ path: renamed })).toMatchObject({ ok: false, reason: expect.stringContaining("Not an image") });
    const bitmap = join(folder, "old.bmp");
    writeFileSync(bitmap, Buffer.from("BM\0\0\0\0"));
    expect(await readImageFile({ path: bitmap })).toMatchObject({ ok: false });
  });

  it("refuses images over 12 MB", async () => {
    const path = join(folder, "big.jpg");
    writeFileSync(path, Buffer.alloc(12 * 1024 * 1024 + 1));
    expect(await readImageFile({ path })).toMatchObject({ ok: false, reason: expect.stringContaining("larger than 12 MB") });
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
