// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/images.test.mjs (client half)
import { describe, expect, it } from "vitest";
import { clearImageCache, loadImage } from "./images";

type Read = Parameters<typeof loadImage>[2];
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("image cache", () => {
  it("shares requests, separates previews, and limits concurrency even after failure", async () => {
    clearImageCache();
    let calls = 0;
    let active = 0;
    let peak = 0;
    const variants: unknown[] = [];
    const read: Read = async ({ path, variant }) => {
      calls++;
      variants.push(variant);
      peak = Math.max(peak, ++active);
      try {
        await tick();
        if (path === "bad") throw new Error("unavailable");
        return { dataUrl: `data:image/webp;base64,${path}-${variant}` };
      } finally {
        active--;
      }
    };
    const a = loadImage("same", "thumbnail", read);
    expect(loadImage("same", "thumbnail", read)).toBe(a);
    await a;
    expect(await loadImage("same", "thumbnail", read)).toBe(await a);
    expect(calls).toBe(1);
    await loadImage("same", "original", read);
    expect(variants).toEqual(["thumbnail", "original"]);
    const results = await Promise.allSettled([loadImage("bad", "thumbnail", read), ...Array.from({ length: 12 }, (_, i) => loadImage(`image-${i}`, "thumbnail", read))]);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(peak).toBe(3);
    const beforeRetry = calls;
    await expect(loadImage("bad", "thumbnail", read)).rejects.toThrow(/unavailable/);
    expect(calls).toBe(beforeRetry + 1);
    expect(await loadImage("https://example.test/image.png", "thumbnail", read)).toBe("https://example.test/image.png");
    expect(calls).toBe(beforeRetry + 1);
    clearImageCache();
  });

  it("evicts by bytes and recency, and skips oversized strings", async () => {
    clearImageCache();
    const calls = new Map<string, number>();
    const uri = "x".repeat(4 * 1024 * 1024); // 8 MiB under the conservative UTF-16 budget.
    const read: Read = async ({ path }) => {
      calls.set(path, (calls.get(path) ?? 0) + 1);
      return { dataUrl: path === "oversized" ? uri.repeat(4) : uri };
    };
    for (const path of ["a", "b", "c", "a", "d", "a"]) await loadImage(path, "original", read);
    expect(calls.get("a"), "a cache hit refreshes recency").toBe(1);
    await loadImage("b", "original", read);
    expect(calls.get("b"), "evict by bytes before reaching 24 entries").toBe(2);
    await loadImage("oversized", "original", read);
    await loadImage("oversized", "original", read);
    expect(calls.get("oversized")).toBe(2);
    clearImageCache();
  });

  it("reads file: URLs and paths through the daemon; http, data and blob URLs load directly", async () => {
    clearImageCache();
    const asked: string[] = [];
    const read: Read = async ({ path }) => (asked.push(path), { dataUrl: `data:image/png;base64,${Buffer.from(path).toString("base64")}` });
    // Agents link screenshots as file:// URLs; the renderer can't load those, so the daemon reads them.
    expect(await loadImage("file:///tmp/shot.png", "thumbnail", read)).toMatch(/^data:image\/png;base64,/);
    expect(await loadImage("/tmp/other.png", "thumbnail", read)).toMatch(/^data:image\/png;base64,/);
    expect(asked).toEqual(["file:///tmp/shot.png", "/tmp/other.png"]);
    for (const direct of ["https://example.com/a.png", "http://localhost:8080/b.png", "data:image/png;base64,AAAA", "blob:http://localhost/123"]) {
      expect(await loadImage(direct, "thumbnail", read)).toBe(direct);
    }
    expect(asked).toHaveLength(2);
    clearImageCache();
  });
});
