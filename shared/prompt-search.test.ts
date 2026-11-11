import { describe, expect, it } from "vitest";
import { searchPrompts } from "./prompt-search";

const prompts = [
  { id: "summary", title: "Summarise progress", text: "Summarise what is done.", starred: false },
  { id: "review", title: "Review the change", text: "Look for bugs and missing tests.", starred: true },
  { id: "bugs", title: "Bug hunt", text: "Find the root cause.", starred: false },
];

describe("searchPrompts", () => {
  it("lists starred prompts first, then the rest by title, when nothing is typed", () => {
    expect(searchPrompts(prompts, "  ").map((prompt) => prompt.id)).toEqual(["review", "bugs", "summary"]);
  });

  it("matches the title or the text, ignoring case, keeping starred first", () => {
    expect(searchPrompts(prompts, "BUG").map((prompt) => prompt.id)).toEqual(["review", "bugs"]);
    expect(searchPrompts(prompts, "root cause").map((prompt) => prompt.id)).toEqual(["bugs"]);
    expect(searchPrompts(prompts, "nothing like this")).toEqual([]);
  });
});
