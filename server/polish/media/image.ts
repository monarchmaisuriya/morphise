// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): server/image.ts
import type { RpcInput } from "@getpaseo/plugin";
import { open, stat } from "node:fs/promises";
import { extname, isAbsolute } from "node:path";
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

// Loaded on first use, so an unloadable sharp only costs thumbnails. In the macOS app it may fail to
// load its native binary (signed by another team); thumbnails then send the original image.
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

async function readWhole(file: string, size: number) {
  const handle = await open(file, "r");
  try {
    const bytes = Buffer.alloc(size);
    const { bytesRead } = await handle.read(bytes, 0, size, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Only image files are served: this RPC must not become a general file reader for the client. The
// path must be absolute, name an image, be a regular file within the size limit, and start with
// that image type's bytes (a renamed or linked other file is refused).
export async function readImageFile({ path, variant = "original" }: RpcInput<typeof readImage>) {
  const file = path.startsWith("file://") ? fileURLToPath(path) : path;
  if (!isAbsolute(file)) throw new Error(`Not an absolute path: ${file}`);
  if (!MIME[extname(file).toLowerCase()]) throw new Error(`Not an image: ${file}`);
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`Not a file: ${file}`);
  if (info.size > MAX_BYTES) throw new Error(`Image larger than ${MAX_BYTES / 1024 / 1024} MB: ${file}`);
  const bytes = await readWhole(file, info.size);
  const mime = sniffImage(bytes);
  if (!mime) throw new Error(`Not an image: ${file}`);
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
