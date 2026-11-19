import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
const { onPressOutside } = await import("../web");

afterEach(() => vi.unstubAllGlobals());

describe("inline panel outside presses", () => {
  it("dismisses on an outside press, not on its trigger or content", () => {
    let press!: (event: { target: unknown }) => void;
    const removeEventListener = vi.fn();
    vi.stubGlobal("document", { addEventListener: (_name: string, listener: typeof press) => { press = listener; }, removeEventListener });
    const trigger = {}, content = {}, elsewhere = {};
    const dismiss = vi.fn();
    const stop = onPressOutside({ contains: (target: unknown) => target === trigger || target === content }, dismiss);
    press({ target: trigger });
    press({ target: content });
    expect(dismiss).not.toHaveBeenCalled();
    press({ target: elsewhere });
    expect(dismiss).toHaveBeenCalledTimes(1);
    stop();
    expect(removeEventListener).toHaveBeenCalledWith("pointerdown", press, true);
  });
});
