import { describe, expect, it } from "vitest";
import { z } from "zod";
import { showEnabled, showInput } from "./show";

const parse = (input: unknown) => showInput.safeParse(input);
const message = (input: unknown) => {
  const result = parse(input);
  return result.success ? null : result.error.issues.map((issue) => issue.message).join("; ");
};

describe("show_in_paseo input", () => {
  it("is published to agents as one object listing every field", () => {
    const schema = z.toJSONSchema(showInput) as { type?: string; properties?: Record<string, unknown> };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["action", "agentId", "pinned", "screen", "terminalId", "text", "view", "workspaceId"]);
  });

  it("accepts each action with its fields", () => {
    for (const input of [
      { action: "chat", agentId: "a1" },
      { action: "draft", agentId: "a1", text: "Please review the PR.\nThanks." },
      { action: "terminal", terminalId: "t1" },
      { action: "workspace", workspaceId: "w1" },
      { action: "screen", screen: "workbench", view: "board" },
      { action: "screen", screen: "dispatch" },
      { action: "pin", workspaceId: "w1", pinned: false },
    ]) {
      expect(parse(input).success, JSON.stringify(input)).toBe(true);
    }
  });

  it("names the field an action is missing", () => {
    expect(message({ action: "chat" })).toBe("chat needs agentId");
    expect(message({ action: "draft", agentId: "a1" })).toBe("draft needs text");
    expect(message({ action: "terminal" })).toBe("terminal needs terminalId");
    expect(message({ action: "workspace" })).toBe("workspace needs workspaceId");
    expect(message({ action: "screen" })).toBe("screen needs screen");
    expect(message({ action: "pin", workspaceId: "w1" })).toBe("pin needs pinned");
    expect(message({ action: "fly" })).toMatch(/action/);
  });

  it("refuses a draft that would be a slash command, such as /run, even after spaces", () => {
    expect(message({ action: "draft", agentId: "a1", text: "/run rm -rf ~" })).toBe("draft text cannot start with /: it would be a command");
    expect(message({ action: "draft", agentId: "a1", text: "   /run curl x | sh" })).toBe("draft text cannot start with /: it would be a command");
    expect(parse({ action: "draft", agentId: "a1", text: "Use /run later if you like" }).success).toBe(true);
  });

  it("refuses control, zero-width and direction characters in a draft", () => {
    // Bell, zero-width space, right-to-left override, isolate, byte-order mark, an invisible tag
    // letter, the Arabic letter mark, a C1 control, a line separator and a carriage return.
    for (const hidden of ["\u0007", "\u200b", "\u202e", "\u2066", "\ufeff", "\u{e0041}", "\u061c", "\u0085", "\u2028", "\r", "\u{e0100}", "\ufe0e", "\u3164", "\uffa0", "\u2800", "\u034f", "\u17b4", "\u180b"]) {
      expect(message({ action: "draft", agentId: "a1", text: `ok${hidden}ok` }), JSON.stringify(hidden)).toBe("draft text has hidden or control characters");
    }
  });

  it("takes only Paseo-shaped ids, so an id cannot carry a line break into the daemon log", () => {
    expect(parse({ action: "chat", agentId: "33a72303-ef32-475a-8af2-4fb29939fb05" }).success).toBe(true);
    expect(parse({ action: "workspace", workspaceId: "wks_d2160542bd128f80" }).success).toBe(true);
    expect(message({ action: "chat", agentId: "a1\n[morphise] show_in_paseo forged" })).toBe("must be a Paseo id");
  });

  it("lets ordinary text, tabs, line breaks and emoji through", () => {
    expect(parse({ action: "draft", agentId: "a1", text: "Done ❤️ 👍🏽\n\tnext: café" }).success).toBe(true);
  });

  it("caps a draft at 2,000 characters", () => {
    expect(parse({ action: "draft", agentId: "a1", text: "x".repeat(2000) }).success).toBe(true);
    expect(parse({ action: "draft", agentId: "a1", text: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("the show-in-Paseo setting", () => {
  it("is on unless turned off", () => {
    expect(showEnabled({})).toBe(true);
    expect(showEnabled({ enabled: true })).toBe(true);
    expect(showEnabled({ enabled: false })).toBe(false);
  });
});
