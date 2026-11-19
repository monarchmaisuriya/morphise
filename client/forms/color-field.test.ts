import { describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("@getpaseo/plugin/client/ui", () => ({ SettingsInput: "SettingsInput", SettingsRow: "SettingsRow" }));
vi.mock("../ui/color-field", () => ({ ColorField: "ColorField" }));
vi.mock("../ui/kit", () => ({ tokens: () => ({}) }));

const { ColorSetting } = await import("./color-field");
const form = { inputKey: "original", theme: { colors: {} }, compact: false } as Parameters<typeof ColorSetting>[0]["form"];

describe("color settings platform boundary", () => {
  it("keeps the original host text input on iOS", () => {
    platform.OS = "ios";
    const onChange = vi.fn();
    const result = ColorSetting({ form, label: "Background", value: "#abc", onChange, error: null });
    expect(result.type).toBe("SettingsInput");
    expect(result.props.initialValue).toBe("#abc");
    expect(result.props.onChangeText).toBe(onChange);
  });
  it("keeps the original host text input on Android", () => {
    platform.OS = "android";
    const result = ColorSetting({ form, label: "Background", value: "#123456", onChange: () => {}, error: "Invalid color" });
    expect(result.type).toBe("SettingsInput");
    expect(result.props.error).toBe("Invalid color");
  });
  it("offers the graphical color field on desktop and browser web", () => {
    platform.OS = "web";
    const result = ColorSetting({ form, label: "Background", value: "#123456", onChange: () => {}, error: null });
    expect(result.type).toBe("SettingsRow");
    expect(result.props.children.type).toBe("ColorField");
  });
});
