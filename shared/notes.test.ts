import { describe, expect, it } from "vitest";
import { MAX_NOTE_LENGTH, NOTE_KEY, notePatch, readNote } from "./notes";

describe("chat notes", () => {
  it("reads the note from chat metadata and treats anything else as no note", () => {
    expect(readNote({ [NOTE_KEY]: "check the flaky test" })).toBe("check the flaky test");
    expect(readNote({})).toBe("");
    expect(readNote(null)).toBe("");
    expect(readNote({ [NOTE_KEY]: 42 })).toBe("");
  });

  it("removes the key for a blank note instead of storing whitespace", () => {
    expect(notePatch("todo")).toEqual({ [NOTE_KEY]: "todo" });
    expect(notePatch("  \n ")).toEqual({ [NOTE_KEY]: null });
  });

  it("refuses a note over the limit rather than cutting it", () => {
    expect(() => notePatch("x".repeat(MAX_NOTE_LENGTH + 1))).toThrow(`A note can be at most ${MAX_NOTE_LENGTH} characters`);
    expect(notePatch("x".repeat(MAX_NOTE_LENGTH))[NOTE_KEY]).toHaveLength(MAX_NOTE_LENGTH);
  });
});
