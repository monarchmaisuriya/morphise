import { expect, it } from "vitest";
import { quickChatModelChoices } from "./quick-chat-models";

it("uses raw model labels and host icons without changing provider/model identities", () => {
  const choices = quickChatModelChoices([{ provider: "custom", label: "Team · Provider", status: "ready", iconSvg: "<svg/>", models: [{ id: "family/model", label: "Model · Pro", isDefault: true }] }]);
  expect(choices).toEqual([{ value: "custom/family/model", label: "Model · Pro", accessibleLabel: "Team · Provider · Model · Pro", iconSvg: "<svg/>" }]);
});
it("keeps duplicate model names distinct and permits a missing provider icon", () => {
  expect(quickChatModelChoices([{ provider: "one", label: "One", status: "ready", models: [{ id: "test", label: "Test" }] }, { provider: "two", label: "Two", status: "ready", models: [{ id: "test", label: "Test" }] }])).toEqual([{ value: "one/test", label: "Test", accessibleLabel: "One · Test", disambiguator: "one" }, { value: "two/test", label: "Test", accessibleLabel: "Two · Test", disambiguator: "two" }]);
});
