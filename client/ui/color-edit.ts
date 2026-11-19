import { colorHex, colorValue, type ColorValue } from "../../shared/color-value";

export function changeColorChannel(text: string, channel: keyof ColorValue, value: number, allowAlpha: boolean): string {
  const current = colorValue(text) ?? { red: 128, green: 128, blue: 128, alpha: 255 };
  return colorHex({ ...current, [channel]: value }, allowAlpha && (text.trim().length === 9 || channel === "alpha" || current.alpha !== 255));
}

export function createColorCommit() {
  let pending = false;
  return async (apply: () => void | Promise<void>): Promise<boolean> => {
    if (pending) return false;
    pending = true;
    try {
      await apply();
      return true;
    } finally {
      pending = false;
    }
  };
}
