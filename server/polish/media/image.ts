// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): server/image.ts
import type { RpcInput } from "@getpaseo/plugin";
import { open, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { readImage } from "../../../shared/polish/image";
import { optionalDependency } from "./plugin-require";

// The part of sharp's API used here (its types are not imported: Paseo builds without node_modules).
type Pipeline = {
  rotate(): Pipeline;
  resize(options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }): Pipeline;
  webp(options: { quality: number }): Pipeline;
  toBuffer(): Promise<Buffer>;
};
type Sharp = (input: Buffer, options: { limitInputPixels: number }) => Pipeline;

// Loaded on first use, so an unloadable sharp only costs thumbnails. Paseo's macOS app loads only code signed by its own
// team, so it refuses sharp's native binary; sharp then loads its WebAssembly build (`@img/sharp-wasm32`, a dependency
// for this reason, pinned to sharp's version). Only if that fails too do thumbnails send the original image.
const loadSharp = optionalDependency<Sharp>("sharp", "thumbnails send the original image");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
export const MAX_BYTES = 12 * 1024 * 1024;

/** The image type the bytes start with (PNG, JPEG, GIF, WebP), or undefined for anything else. */
export function sniffImage(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return undefined;
}

function absoluteFile(path: string) {
  const file = path.startsWith("file://") ? fileURLToPath(path) : path;
  if (!isAbsolute(file)) throw new Error(`Not an absolute path: ${file}`);
  return file;
}

type Variant = RpcInput<typeof readImage>["variant"];

// Only image files are served: this RPC must not become a general file reader for the client. The
// path must be absolute, name an image, be a regular file within the size limit, and start with
// that image type's bytes (a renamed or linked other file is refused).
export async function readImageFile({ path, variant }: RpcInput<typeof readImage>) {
  return readImageAt(absoluteFile(path), variant);
}

// The file is opened once and every check holds for the open file, whatever the path names by then.
async function readImageAt(file: string, variant: Variant = "original") {
  if (!MIME[extname(file).toLowerCase()]) throw new Error(`Not an image: ${file}`);
  // Checked before opening too, so a pipe or device is never opened.
  if (!(await stat(file)).isFile()) throw new Error(`Not a file: ${file}`);
  const handle = await open(file, "r");
  let bytes: Buffer;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error(`Not a file: ${file}`);
    if (info.size > MAX_BYTES) throw new Error(`Image larger than ${MAX_BYTES / 1024 / 1024} MB: ${file}`);
    const buffer = Buffer.alloc(info.size);
    const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
    bytes = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const mime = sniffImage(bytes);
  if (!mime) throw new Error(`Not an image: ${file}`);
  return dataUrlOf(bytes, mime, variant);
}

async function dataUrlOf(bytes: Buffer, mime: string, variant: Variant = "original") {
  const sharp = variant === "thumbnail" ? await loadSharp() : null;
  if (sharp) {
    // Twice the largest tile size (Extra large, 480 × 300), without decoding unbounded pixel counts or sending the original.
    const preview = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 960, height: 600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { dataUrl: `data:image/webp;base64,${preview.toString("base64")}` };
  }
  return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
}

export class ImageTooLarge extends Error {
  constructor(path: string) {
    super(`Image larger than ${MAX_BYTES / 1024 / 1024} MB: ${path}`);
  }
}

/** Every image a page names that is not read inside the agent's folder gets this one answer, whatever the reason, so the answer never tells whether a path outside the folder exists. */
export class OutsideOrUnreadable extends Error {
  constructor(path: string) {
    super(`Image could not be read inside your working folder: ${path}`);
  }
}

const isInside = (root: string, file: string) => {
  const inside = relative(root, file);
  return Boolean(inside) && inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
};

/**
 * An image an agent-written page names, opened only when it is inside `folder`, the working folder of the agent that made the page: a page
 * must not show anyone other pictures on this machine. The path is judged as text first, so nothing outside the folder is ever looked up; then
 * by its real path (`..` and links out are refused), as a regular image file with one link (a hard link could name a file outside), opened
 * once, and still the file at a real path inside the folder once open (a link swapped in after the checks is refused). Every refusal is an
 * OutsideOrUnreadable; ImageTooLarge comes only for a file that passed them.
 */
export async function openInFolder(path: string, folder: string): Promise<{ bytes: Buffer; size: number; type: string }> {
  try {
    return await openContained(path, folder);
  } catch (error) {
    if (error instanceof ImageTooLarge) throw error;
    throw new OutsideOrUnreadable(path);
  }
}

async function openContained(path: string, folder: string) {
  const requested = resolve(absoluteFile(path));
  const root = await realpath(folder);
  // `/tmp/proj` and `/private/tmp/proj` name the same folder: either spelling is inside.
  if (!isInside(resolve(folder), requested) && !isInside(root, requested)) throw new Error("outside by its text");
  const file = await realpath(requested);
  if (!isInside(root, file)) throw new Error("outside by its real path");
  // Checked before opening, so a pipe or device is never opened.
  const info = await stat(file);
  if (!info.isFile() || info.nlink !== 1 || !MIME[extname(file).toLowerCase()]) throw new Error("not a single-linked image file");
  const handle = await open(file, "r");
  try {
    const opened = await handle.stat();
    const now = await realpath(file);
    const current = await stat(now);
    if (!opened.isFile() || opened.nlink !== 1 || !isInside(root, now) || current.dev !== opened.dev || current.ino !== opened.ino) throw new Error("changed while opened");
    if (opened.size > MAX_BYTES) throw new ImageTooLarge(path);
    const buffer = Buffer.alloc(opened.size);
    const { bytesRead } = await handle.read(buffer, 0, opened.size, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const type = sniffImage(bytes);
    if (!type) throw new Error("not an image by its bytes");
    return { bytes, size: opened.size, type };
  } finally {
    await handle.close();
  }
}

/** An image a page names, as a data URL, read through openInFolder. */
export async function readImageInFolder({ path, variant }: RpcInput<typeof readImage>, folder: string) {
  const { bytes, type } = await openInFolder(path, folder);
  return dataUrlOf(bytes, type, variant);
}
