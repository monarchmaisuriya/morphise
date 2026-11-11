import type { Prompt } from "./document";

// Starred first, then by title; a query matches the title or the text, ignoring case.
export function searchPrompts(prompts: readonly Prompt[], query: string): Prompt[] {
  const needle = query.trim().toLowerCase();
  const matches = needle === "" ? [...prompts] : prompts.filter((prompt) => `${prompt.title}\n${prompt.text}`.toLowerCase().includes(needle));
  return matches.sort((left, right) => Number(right.starred) - Number(left.starred) || left.title.localeCompare(right.title));
}
