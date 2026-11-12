// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/images.test.mjs (server half)
import { mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImageFile } from "./image";

let temp: string;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "morphise-image-test-"));
});
afterAll(() => rm(temp, { recursive: true, force: true }));

const decode = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1]!, "base64");

describe("image RPC", () => {
  it("sends a small preview and the untouched original for the viewer", async () => {
    const file = join(temp, "large.png");
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: "#2878e0" } }).png().toBuffer();
    await writeFile(file, original);
    const preview = await readImageFile({ path: pathToFileURL(file).href, variant: "thumbnail" });
    expect(preview.dataUrl).toMatch(/^data:image\/webp;base64,/);
    const metadata = await sharp(decode(preview.dataUrl)).metadata();
    expect([metadata.width, metadata.height]).toEqual([960, 480]);
    const full = await readImageFile({ path: file });
    expect(full.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(decode(full.dataUrl).equals(original)).toBe(true);
  });

  it("never enlarges a small image", async () => {
    const small = join(temp, "small.gif");
    await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).gif().toFile(small);
    const preview = await readImageFile({ path: small, variant: "thumbnail" });
    expect((await sharp(decode(preview.dataUrl)).metadata()).width).toBe(20);
  });

  it("serves only image files: by name, by content, regular and absolute", async () => {
    await writeFile(join(temp, "notes.txt"), "secret");
    await expect(readImageFile({ path: join(temp, "notes.txt") })).rejects.toThrow(/Not an image/);
    // A renamed or linked text file is refused by its bytes.
    await writeFile(join(temp, "renamed.png"), "secret");
    await expect(readImageFile({ path: join(temp, "renamed.png") })).rejects.toThrow(/Not an image/);
    await symlink(join(temp, "notes.txt"), join(temp, "linked.jpg"));
    await expect(readImageFile({ path: join(temp, "linked.jpg") })).rejects.toThrow(/Not an image/);
    await expect(readImageFile({ path: "large.png" })).rejects.toThrow(/Not an absolute path/);
    await expect(readImageFile({ path: join(temp, "folder.png") })).rejects.toThrow();
  });

  it("refuses images over 12 MB before reading them", async () => {
    const large = join(temp, "oversize.png");
    await writeFile(large, "");
    await truncate(large, 12 * 1024 * 1024 + 1);
    await expect(readImageFile({ path: large, variant: "thumbnail" })).rejects.toThrow(/larger than/);
  });
});
