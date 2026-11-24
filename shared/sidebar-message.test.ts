import { expect, it } from "vitest";
import { lastMessagePreview, messagePreview } from "./sidebar-message";

it("uses the last user or assistant message rather than tools or reasoning", () => {
  expect(lastMessagePreview([{ item: { type: "assistant_message", text: "Old answer" } }, { item: { type: "user_message", text: " Latest\n request " } }, { item: { type: "tool_call", text: "Do not show" } }])).toBe("Latest request");
  expect(lastMessagePreview([{ item: { type: "user_message", text: "Question" } }, { item: { type: "assistant_message", text: "Latest answer" } }])).toBe("Latest answer");
  expect(lastMessagePreview([{ item: { type: "reasoning", text: "Private reasoning" } }])).toBeNull();
});

it("bounds previews and accepts only nonempty message text", () => {
  expect(messagePreview({ type: "assistant_message", text: "a".repeat(300) })?.length).toBe(240);
  expect(messagePreview({ type: "user_message", text: " \n " })).toBeNull();
  expect(messagePreview({ type: "tool_call", text: "output" })).toBeNull();
});
