// A short two-note chime, built in code so the plugin ships no audio file. React Native has no
// guaranteed `btoa`, so the base64 encoding is done here too.

const RATE = 8000;
const NOTES = [
  { hz: 880, seconds: 0.12 },
  { hz: 1320, seconds: 0.18 },
];

function samples(): number[] {
  const out: number[] = [];
  for (const { hz, seconds } of NOTES) {
    const count = Math.round(RATE * seconds);
    for (let index = 0; index < count; index++) {
      const fade = Math.min(1, index / 80, (count - index) / 400); // no clicks at the edges
      out.push(Math.round(128 + 70 * fade * Math.sin((2 * Math.PI * hz * index) / RATE)));
    }
  }
  return out;
}

function wav(data: number[]): number[] {
  const bytes: number[] = [];
  const text = (value: string) => [...value].forEach((char) => bytes.push(char.charCodeAt(0)));
  const u32 = (value: number) => bytes.push(value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255);
  const u16 = (value: number) => bytes.push(value & 255, (value >> 8) & 255);
  text("RIFF");
  u32(36 + data.length);
  text("WAVEfmt ");
  u32(16);
  u16(1); // PCM
  u16(1); // mono
  u32(RATE);
  u32(RATE); // byte rate: 8-bit mono
  u16(1); // block align
  u16(8); // bits per sample
  text("data");
  u32(data.length);
  bytes.push(...data);
  return bytes;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: number[]): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const [a, b = 0, c = 0] = bytes.slice(index, index + 3);
    const chunk = (a << 16) | (b << 8) | c;
    out += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63];
    out += index + 1 < bytes.length ? ALPHABET[(chunk >> 6) & 63] : "=";
    out += index + 2 < bytes.length ? ALPHABET[chunk & 63] : "=";
  }
  return out;
}

let cached: string | null = null;

export function chimeWav(): string {
  cached ??= base64(wav(samples()));
  return cached;
}
