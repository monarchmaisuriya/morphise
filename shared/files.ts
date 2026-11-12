import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// What chat rows ask the daemon about files an agent touched: a picture for an image it read, a
// file's text for the Details panel, and showing a file in the system's file manager. Every
// answer says why it could not be given rather than failing silently.

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const TEXT_MAX_BYTES = 1024 * 1024;

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

// The image type of a path, by its extension; null when it is not a picture Morphise shows.
export function imageType(path: string): string | null {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
  return IMAGE_TYPES[extension] ?? null;
}

const path = z.string().min(1).max(4096).refine((value) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value), "Expected an absolute path");

export const readImage = defineRpc({
  name: "files.image",
  input: z.object({ path }),
  output: z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), dataUri: z.string() }), z.object({ ok: z.literal(false), reason: z.string() })]),
});

export const readText = defineRpc({
  name: "files.text",
  input: z.object({ path }),
  output: z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), text: z.string(), truncated: z.boolean() }), z.object({ ok: z.literal(false), reason: z.string() })]),
});

export const revealFile = defineRpc({
  name: "files.reveal",
  input: z.object({ path }),
  output: z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), reason: z.string() })]),
});
