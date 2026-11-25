import { expect, it } from "vitest";
import { lastMessagePreview, messagePreview } from "./sidebar-message";

it("cleans message formatting before making a one-line preview", () => {
  expect(messagePreview({ type: "assistant_message", text: "## Bottom line\n**The deploy succeeded.** Read [the report](https://example.test/report)." })).toBe("Bottom line The deploy succeeded. Read the report.");
  expect(messagePreview({ type: "assistant_message", text: "> - [x] _Verified_ `build`\n```ts\nconst ready = true;\n```\n![Chart](https://example.test/chart.png)" })).toBe("Verified build const ready = true; Chart");
  expect(messagePreview({ type: "assistant_message", text: "<strong>Done</strong> &amp; checked\n---" })).toBe("Done & checked");
  expect(messagePreview({ type: "assistant_message", text: "Keep snake_case and a_b_c, 2 * 3 and #185" })).toBe("Keep snake_case and a_b_c, 2 * 3 and #185");
});

it("uses only the last assistant message, ignoring newer user messages and tools", () => {
  expect(lastMessagePreview([{ item: { type: "assistant_message", text: "Old answer" } }, { item: { type: "user_message", text: " Latest\n request " } }, { item: { type: "tool_call", text: "Do not show" } }])).toBe("Old answer");
  expect(lastMessagePreview([{ item: { type: "user_message", text: "Question" } }, { item: { type: "assistant_message", text: "Latest answer" } }])).toBe("Latest answer");
  expect(lastMessagePreview([{ item: { type: "reasoning", text: "Private reasoning" } }])).toBeNull();
});

it("bounds previews and accepts only nonempty message text", () => {
  expect(messagePreview({ type: "assistant_message", text: "a".repeat(300) })?.length).toBe(240);
  expect(messagePreview({ type: "user_message", text: " \n " })).toBeNull();
  expect(messagePreview({ type: "tool_call", text: "output" })).toBeNull();
});

it("assembles the response beginning before plain-text cleanup and word-boundary truncation", () => {
  expect(lastMessagePreview([{ item: { type: "assistant_message", messageId: "a", text: "**Bottom line:** There ar" } }, { item: { type: "assistant_message", messageId: "a", text: "e no code changes." } }, { item: { type: "user_message", text: "?" } }])).toBe("Bottom line: There are no code changes.");
  const text = "Beginning of the response. " + "complete words ".repeat(30);
  expect(messagePreview({ type: "assistant_message", text })?.startsWith("Beginning of the response.")).toBe(true);
  expect(messagePreview({ type: "assistant_message", text })?.endsWith("words…")).toBe(true);
});
