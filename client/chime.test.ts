import { describe, expect, it } from "vitest";
import { chimeWav } from "./chime";

describe("chimeWav", () => {
  it("builds a short mono 8-bit WAV file encoded as base64", () => {
    const bytes = Buffer.from(chimeWav(), "base64");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 16).toString("ascii")).toBe("WAVEfmt ");
    expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
    expect(bytes.readUInt16LE(22)).toBe(1); // mono
    expect(bytes.readUInt32LE(24)).toBe(8000); // sample rate
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44); // data size
    expect(bytes.length).toBeLessThan(6000);
  });
});
