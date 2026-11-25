import { expect, it } from "vitest";
import { quickChatRowTitle } from "./quick-chat-title";

it("uses60characters on narrow layouts and120on wide layouts without changing the input", () => {
  const title = "x".repeat(140);
  expect(quickChatRowTitle(title, 360)).toBe("x".repeat(59) + "…");
  expect(quickChatRowTitle(title, 800)).toBe("x".repeat(119) + "…");
  expect(title.length).toBe(140);
  expect(quickChatRowTitle("Short title", 360)).toBe("Short title");
});

it("does not invent ellipses for complete60character saved titles", () => {
  expect(quickChatRowTitle("x".repeat(60), 360)).toBe("x".repeat(60));
  expect(quickChatRowTitle("x".repeat(120), 800)).toBe("x".repeat(120));
});
