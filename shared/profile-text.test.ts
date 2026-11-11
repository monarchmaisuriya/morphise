import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE } from "./profile";
import { formatProfile, parseProfileText } from "./profile-text";
import { STARTER_PROFILE } from "./starter-profile";

describe("parseProfileText", () => {
  it("reports broken JSON instead of throwing", () => {
    const parsed = parseProfileText("{ theme: ");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]).toMatch(/^Not valid JSON: /);
  });

  it("names the path of each schema problem", () => {
    expect(parseProfileText('{"timeline": {"hide": ["thinking"]}, "extra": 1}')).toEqual({
      ok: false,
      errors: [expect.stringMatching(/^timeline\.hide\.0: /), expect.stringMatching(/^\(root\): /)],
    });
  });

  it("round-trips a formatted profile", () => {
    expect(parseProfileText(formatProfile(EMPTY_PROFILE))).toEqual({ ok: true, profile: EMPTY_PROFILE });
  });

  it("accepts the starter profile", () => {
    expect(parseProfileText(formatProfile(STARTER_PROFILE)).ok).toBe(true);
  });
});
