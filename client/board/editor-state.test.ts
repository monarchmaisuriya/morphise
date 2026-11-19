import { describe, expect, it } from "vitest";
import { hasTaskEdits, taskFieldProblems } from "./editor-state";

describe("task editing", () => {
  it("reports a non-web link beside its field", () => {
    expect(taskFieldProblems("Title", "", "file:///private").url).toBe("Use an http or https address, at most 2,048 characters.");
  });
  it("accepts an optional empty link", () => {
    expect(taskFieldProblems("Title", "", "")).toEqual({ title: null, description: null, url: null });
  });
  it("reports over-limit fields without trimming the description", () => {
    expect(taskFieldProblems("x".repeat(201), "x".repeat(10001), "")).toEqual({ title: "Use at most 200 characters for the title.", description: "Use at most 10,000 characters for the description.", url: null });
  });
  it("distinguishes changed and unchanged drafts", () => {
    expect(hasTaskEdits({ title: "A" }, { title: "B" })).toBe(true);
    expect(hasTaskEdits({ title: "A" }, { title: "A" })).toBe(false);
  });
});
