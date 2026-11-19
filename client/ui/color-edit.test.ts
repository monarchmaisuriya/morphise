import { describe, expect, it } from "vitest";
import { changeColorChannel, createColorCommit } from "./color-edit";

describe("color edits", () => {
  it("keeps transparency while changing red", () => {
    expect(changeColorChannel("#11223380", "red", 255, true)).toBe("#FF223380");
  });
  it("does not emit alpha for opaque-only fields", () => {
    expect(changeColorChannel("#abc", "blue", 0, false)).toBe("#AABB00");
  });
  it("blocks a second application while the first is pending", async () => {
    const apply = createColorCommit();
    let finish!: () => void;
    let writes = 0;
    const first = apply(() => new Promise<void>((resolve) => { writes++; finish = resolve; }));
    expect(await apply(() => { writes++; })).toBe(false);
    expect(writes).toBe(1);
    finish();
    expect(await first).toBe(true);
  });
  it("releases a failed application for manual retry", async () => {
    const apply = createColorCommit();
    await expect(apply(() => Promise.reject(new Error("Not saved")))).rejects.toThrow("Not saved");
    expect(await apply(() => {})).toBe(true);
  });
});
