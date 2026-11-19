export interface ColorValue { red: number; green: number; blue: number; alpha: number }

export function colorValue(text: string): ColorValue | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  return { red: parseInt(full.slice(0, 2), 16), green: parseInt(full.slice(2, 4), 16), blue: parseInt(full.slice(4, 6), 16), alpha: full.length === 8 ? parseInt(full.slice(6), 16) : 255 };
}

export function colorHex(value: ColorValue, alpha = false): string {
  const byte = (channel: number) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0").toUpperCase();
  return `#${byte(value.red)}${byte(value.green)}${byte(value.blue)}${alpha ? byte(value.alpha) : ""}`;
}

export function channelAt(position: number, width: number): number | null {
  return width > 0 && Number.isFinite(position) ? Math.max(0, Math.min(255, Math.round(position / width * 255))) : null;
}

export function colorProblem(text: string, lengths: readonly number[], optional: boolean): string | null {
  if (!text.trim() && optional) return null;
  const hex = text.trim();
  return colorValue(hex) && lengths.includes(hex.length - 1) ? null : `Use a hex color with ${lengths.join(" or ")} digits, such as #8E4EC6.`;
}
