import { expect, it } from "vitest";
import { quickChatModelChoices } from "./quick-chat-models";

it("resolves native Claude artwork when the provider snapshot has no SVG", () => {
  const [choice] = quickChatModelChoices([{ provider: "claude", label: "Claude", status: "ready", models: [{ id: "opus", label: "Opus 5.5" }] }]);
  expect(choice.value).toBe("claude/opus");
  expect(choice.iconSvg, "built-in Claude must not fall through to the generic icon").toContain("M4.709 15.955");
});

it("uses raw model labels and host icons without changing provider/model identities", () => {
  const choices = quickChatModelChoices([{ provider: "custom", label: "Team · Provider", status: "ready", iconSvg: "<svg/>", models: [{ id: "family/model", label: "Model · Pro", isDefault: true }] }]);
  expect(choices).toEqual([{ value: "custom/family/model", label: "Model · Pro", accessibleLabel: "Team · Provider · Model · Pro", iconSvg: "<svg/>" }]);
});
it("keeps duplicate model names distinct and permits a missing provider icon", () => {
  expect(quickChatModelChoices([{ provider: "one", label: "One", status: "ready", models: [{ id: "test", label: "Test" }] }, { provider: "two", label: "Two", status: "ready", models: [{ id: "test", label: "Test" }] }])).toEqual([{ value: "one/test", label: "Test", accessibleLabel: "One · Test", disambiguator: "one" }, { value: "two/test", label: "Test", accessibleLabel: "Two · Test", disambiguator: "two" }]);
});
