import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { TEXT_MAX_BYTES } from "../shared/files";
import { readImageFile as readCheckedImage } from "./polish/media/image";

// The daemon's side of chat rows' file actions. Only absolute paths reach here (the contracts
// check); files are read, never written, and size limits keep a huge file from being sent.

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// A picture an agent read with its own Read tool, which may be outside its folder, so no folder
// limit here; the checks (image name and bytes, size) are the chat image reader's own. Its tile is
// at most 520 × 260, so the reader's preview (fits 960 × 600) is sent, never a 12 MB original.
export async function readImageFile({ path }: { path: string }) {
  try {
    const { dataUrl } = await readCheckedImage({ path, variant: "thumbnail" });
    return { ok: true as const, dataUri: dataUrl };
  } catch (error) {
    return { ok: false as const, reason: reasonOf(error) };
  }
}

export async function readTextFile({ path }: { path: string }) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { ok: false as const, reason: "Not a file" };
    // Only the first 1 MB is read, however big the file is.
    const file = await open(path, "r");
    let slice: Buffer;
    try {
      const buffer = Buffer.alloc(Math.min(info.size, TEXT_MAX_BYTES));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      slice = buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
    const truncated = info.size > TEXT_MAX_BYTES;
    // A NUL byte in the start means a binary file, which has no text to show.
    if (slice.subarray(0, 8000).includes(0)) return { ok: false as const, reason: "A binary file has no text to show" };
    return { ok: true as const, text: slice.toString("utf8"), truncated };
  } catch (error) {
    return { ok: false as const, reason: reasonOf(error) };
  }
}

// Opens the system file manager with the file selected (its folder on Linux), on the daemon's
// machine. Arguments go to the program directly, never through a shell.
export async function revealPath({ path }: { path: string }) {
  try {
    await stat(path);
  } catch (error) {
    return { ok: false as const, reason: reasonOf(error) };
  }
  const windows = process.platform === "win32";
  // Explorer reads `/select,"C:\a b\c.txt"` only when it gets the quotes as written, so its
  // arguments go verbatim (the path cannot hold a quote: Windows forbids it in file names).
  const [program, args] = process.platform === "darwin" ? ["open", ["-R", path]] : windows ? ["explorer.exe", [`/select,"${path}"`]] : ["xdg-open", [dirname(path)]];
  return new Promise<{ ok: true } | { ok: false; reason: string }>((resolve) => {
    execFile(program, args, { timeout: 10000, windowsVerbatimArguments: windows }, (error) => {
      // Explorer exits with 1 even when it opened the window.
      if (error && !(process.platform === "win32" && (error as { code?: number }).code === 1)) resolve({ ok: false, reason: reasonOf(error) });
      else resolve({ ok: true });
    });
  });
}
