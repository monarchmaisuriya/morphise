export function taskFieldProblems(title: string, description: string, url: string): { title: string | null; description: string | null; url: string | null } {
  return {
    title: title.trim().length > 200 ? "Use at most 200 characters for the title." : null,
    description: description.length > 10_000 ? "Use at most 10,000 characters for the description." : null,
    url: url.trim() && (url.trim().length > 2048 || !/^https?:\/\/\S+$/i.test(url.trim())) ? "Use an http or https address, at most 2,048 characters." : null,
  };
}

export function hasTaskEdits(original: object, current: object): boolean {
  return JSON.stringify(original) !== JSON.stringify(current);
}
