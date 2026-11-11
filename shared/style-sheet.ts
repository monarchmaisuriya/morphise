import type { Profile } from "./profile";

// Test ids are already limited to selector-safe characters by the profile schema.
export function buildStyleSheet(style: Profile["style"]): string {
  if (!style.enabled) return "";
  const hidden = style.hideTestIds.map((id) => `[data-testid="${id}"] { display: none !important; }`);
  return [...hidden, style.css].filter((part) => part.trim() !== "").join("\n");
}
