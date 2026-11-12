// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): test/model.test.mjs ("css guard")
import { describe, expect, it } from "vitest";
import { guardPositional } from "./css-guard";

describe("css guard", () => {
  it("gives positional selectors a :where() precheck on their subject and leaves others alone", () => {
    expect(guardPositional("[data-x] > div")).toBe("[data-x] > div");
    expect(guardPositional("[data-x] > div > div:first-child")).toBe("[data-x] > div > div:where([data-x] > div > div):first-child");
    expect(guardPositional("[data-x] > :last-child *")).toBe("[data-x] > :last-child *:where([data-x] >  *)");
    expect(guardPositional("[data-x] div:nth-child(2)::before")).toBe("[data-x] div:where([data-x] div):nth-child(2)::before");
    expect(guardPositional("[data-x] > :first-child")).toBe("[data-x] > :where([data-x] > *):first-child");
    expect(guardPositional("[data-x] :last-child")).toBe("[data-x] :where([data-x] *):last-child");
    expect(guardPositional('[a="b c"] > p:not(:last-child)')).toBe('[a="b c"] > p:where([a="b c"] > p):not(:last-child)');
  });
});
