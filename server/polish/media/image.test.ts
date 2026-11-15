// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/images.test.mjs (server half)
import { execFileSync } from "node:child_process";
import { link, mkdir, mkdtemp, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openInFolder, readImageFile, readImageInFolder } from "./image";

// Steps a test runs around the real-path lookups of a given path, one per lookup in order: where
// another process could swap a link in.
type Lookup = () => Promise<string>;
const realpathSteps = vi.hoisted(() => new Map<string, Array<(lookup: Lookup) => Promise<string>>>());
// Every path the code under test asked the file system about, in order.
const touched = vi.hoisted(() => [] as string[]);
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const recorded =
    <A extends unknown[], R>(call: (path: string, ...rest: A) => R) =>
    (path: string, ...rest: A) => {
      touched.push(String(path));
      return call(path, ...rest);
    };
  return {
    ...actual,
    stat: recorded(actual.stat),
    lstat: recorded(actual.lstat),
    open: recorded(actual.open),
    readFile: recorded(actual.readFile),
    realpath: async (path: string) => {
      touched.push(path);
      const lookup = () => actual.realpath(path);
      const step = realpathSteps.get(path)?.shift();
      return step ? step(lookup) : lookup();
    },
  };
});

let temp: string;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "morphise-image-test-"));
});
afterAll(() => rm(temp, { recursive: true, force: true }));

const decode = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1]!, "base64");
// The one answer for every image a page may not read, whatever the reason.
const refusal = (path: string) => `Image could not be read inside your working folder: ${path}`;
const refused = async (read: Promise<unknown>) => {
  const error = await read.then(() => undefined, (failure: unknown) => failure as Error);
  return error?.message;
};
const pngBytes = (background: string) => sharp({ create: { width: 4, height: 4, channels: 3, background } }).png().toBuffer();

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

  it("reads an image for a page only from inside the folder of the agent that made it", async () => {
    const folder = join(temp, "project");
    await mkdir(join(folder, "shots"), { recursive: true });
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } }).png().toBuffer();
    await writeFile(join(folder, "shots", "inside.png"), png);
    await writeFile(join(temp, "outside.png"), png);
    expect((await readImageInFolder({ path: join(folder, "shots", "inside.png") }, folder)).dataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await readImageInFolder({ path: pathToFileURL(join(folder, "shots", "inside.png")).href }, folder)).dataUrl).toMatch(/^data:image\/png;base64,/);
    for (const path of [join(temp, "outside.png"), join(folder, "..", "outside.png"), `${folder}/shots/../../outside.png`]) {
      await expect(readImageInFolder({ path }, folder)).rejects.toThrow(refusal(path));
    }
    // A link inside the folder that points out of it is judged by where it points.
    await symlink(join(temp, "outside.png"), join(folder, "shots", "link.png"));
    await expect(readImageInFolder({ path: join(folder, "shots", "link.png") }, folder)).rejects.toThrow(refusal(join(folder, "shots", "link.png")));
    // A sibling folder whose name starts with the agent's is still outside.
    await mkdir(join(temp, "project-other"));
    await writeFile(join(temp, "project-other", "x.png"), png);
    await expect(readImageInFolder({ path: join(temp, "project-other", "x.png") }, folder)).rejects.toThrow(refusal(join(temp, "project-other", "x.png")));
    await expect(readImageInFolder({ path: "shots/inside.png" }, folder)).rejects.toThrow(refusal("shots/inside.png"));
  });

  it("refuses a path outside the folder by its text alone, asking the file system nothing about it", async () => {
    const folder = join(temp, "text-check");
    await mkdir(folder);
    const elsewhere = join(temp, "text-check-elsewhere");
    for (const path of [join(elsewhere, "x.png"), `${folder}/../text-check-elsewhere/x.png`, pathToFileURL(join(elsewhere, "x.png")).href, "/etc/x.png"]) {
      touched.length = 0;
      await expect(openInFolder(path, folder)).rejects.toThrow(refusal(path));
      // Only the agent's own folder was looked up.
      expect(touched.filter((asked) => asked !== folder)).toEqual([]);
    }
  });

  it("gives the same refusal whether an outside path exists or not", async () => {
    const folder = join(temp, "same-answer");
    await mkdir(folder);
    const outside = join(temp, "same-answer-secret.png");
    for (const path of [outside, `${folder}/../same-answer-secret.png`]) {
      await writeFile(outside, await pngBytes("red"));
      const existing = await refused(openInFolder(path, folder));
      await rm(outside);
      expect(await refused(openInFolder(path, folder))).toBe(existing);
      expect(existing).toBe(refusal(path));
    }
  });

  it("returns an in-folder image's bytes, size and type", async () => {
    const folder = join(temp, "opened");
    await mkdir(folder);
    const png = await pngBytes("blue");
    await writeFile(join(folder, "a.png"), png);
    const opened = await openInFolder(join(folder, "a.png"), folder);
    expect(opened.type).toBe("image/png");
    expect(opened.size).toBe(png.length);
    expect(Buffer.from(opened.bytes).equals(png)).toBe(true);
  });

  it("refuses, with the one answer and without blocking, a pipe named like an image and a file with a second hard link", async () => {
    const folder = join(temp, "special");
    await mkdir(folder);
    execFileSync("mkfifo", [join(folder, "x.png")]);
    await expect(openInFolder(join(folder, "x.png"), folder)).rejects.toThrow(refusal(join(folder, "x.png")));
    // A hard link inside the folder can name a file outside it: its real path is inside and the inode matches.
    await writeFile(join(temp, "special-secret.png"), await pngBytes("red"));
    await link(join(temp, "special-secret.png"), join(folder, "linked.png"));
    await expect(openInFolder(join(folder, "linked.png"), folder)).rejects.toThrow(refusal(join(folder, "linked.png")));
  });

  it("gives the same refusal for a link to a missing outside file as for one to an existing outside file", async () => {
    const folder = join(temp, "links-out");
    await mkdir(folder);
    const name = join(folder, "out.png");
    await writeFile(join(temp, "links-out-secret.png"), await pngBytes("red"));
    await symlink(join(temp, "links-out-secret.png"), name);
    const toExisting = await refused(openInFolder(name, folder));
    await rm(name);
    await symlink(join(temp, "links-out-missing.png"), name);
    expect(await refused(openInFolder(name, folder))).toBe(toExisting);
    expect(toExisting).toBe(refusal(name));
  });

  it("accepts an image named by either spelling of a linked folder (/tmp/proj and /private/tmp/proj)", async () => {
    const real = join(await realpath(temp), "spelled");
    await mkdir(real);
    await writeFile(join(real, "a.png"), await pngBytes("blue"));
    const alias = join(temp, "spelled-alias");
    await symlink(real, alias);
    expect((await openInFolder(join(alias, "a.png"), alias)).type).toBe("image/png");
    expect((await openInFolder(join(real, "a.png"), alias)).type).toBe("image/png");
  });

  // Kept out of the default run, as timings vary with the machine: MORPHISE_TIMING=1 npx vitest run server/polish/media/image.test.ts
  it.runIf(process.env.MORPHISE_TIMING)("checks 20 in-folder images in at most twice the time of reading them unchecked", async () => {
    const folder = join(temp, "timing");
    await mkdir(folder);
    const noise = Buffer.from(Array.from({ length: 640 * 480 * 3 }, () => Math.floor(Math.random() * 256)));
    const png = await sharp(noise, { raw: { width: 640, height: 480, channels: 3 } }).png().toBuffer();
    const files = Array.from({ length: 20 }, (_, i) => join(folder, `shot-${i}.png`));
    await Promise.all(files.map((file) => writeFile(file, png)));
    const time = async (read: (path: string) => Promise<unknown>) => {
      const start = performance.now();
      await Promise.all(files.map(read));
      return performance.now() - start;
    };
    const median = (runs: number[]) => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)]!;
    const unchecked: number[] = [];
    const checked: number[] = [];
    for (let run = 0; run < 7; run++) {
      unchecked.push(await time((path) => readImageFile({ path })));
      checked.push(await time((path) => readImageInFolder({ path }, folder)));
    }
    console.info(`20 images of ${png.length} bytes: unchecked ${median(unchecked).toFixed(1)} ms, checked ${median(checked).toFixed(1)} ms`);
    expect(median(checked)).toBeLessThanOrEqual(2 * median(unchecked));
  });

  describe("a link swapped in after the folder check", () => {
    const setUp = async (name: string) => {
      const folder = join(await realpath(temp), name);
      await mkdir(folder);
      const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "green" } }).png().toBuffer();
      const secret = join(await realpath(temp), `${name}-secret.png`);
      await writeFile(secret, png);
      const file = join(folder, "picture.png");
      await writeFile(file, png);
      const swapToLink = async () => {
        await rm(file);
        await symlink(secret, file);
      };
      const swapBack = async () => {
        await rm(file);
        await writeFile(file, png);
      };
      return { folder, file, swapToLink, swapBack };
    };

    // The check sees the real file; the link replaces it as soon as the check's lookup returns.
    const checkThenSwap = (swapToLink: () => Promise<void>) => async (lookup: Lookup) => {
      const resolved = await lookup();
      await swapToLink();
      return resolved;
    };

    it("is refused when the link is still there as the file is read", async () => {
      const { folder, file, swapToLink } = await setUp("swap-stays");
      realpathSteps.set(file, [checkThenSwap(swapToLink)]);
      await expect(readImageInFolder({ path: file }, folder)).rejects.toThrow(refusal(file));
    });

    it("is refused when the link is swapped back once the file is open", async () => {
      const { folder, file, swapToLink, swapBack } = await setUp("swap-back");
      const swapBackThenLook = async (lookup: Lookup) => {
        await swapBack();
        return lookup();
      };
      realpathSteps.set(file, [checkThenSwap(swapToLink), swapBackThenLook]);
      await expect(readImageInFolder({ path: file }, folder)).rejects.toThrow(refusal(file));
    });
  });
});
