import { describe, expect, it } from "vitest";
import { WORDS, say } from "./strings";

describe("selection bar words", () => {
  it("fills placeholders in the asked language", () => {
    expect(say("hintSendAdd", { mod: "⌘" }, "en")).toBe("Enter to send · ⌘+Enter to add");
    expect(say("hintSendAdd", { mod: "Ctrl" }, "zh")).toBe("Enter 发送 · Ctrl+Enter 添加");
  });

  it("has every word in Chinese and no long dashes in either language", () => {
    expect(Object.keys(WORDS.zh).sort()).toEqual(Object.keys(WORDS.en).sort());
    for (const words of Object.values(WORDS)) for (const text of Object.values(words)) expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});
