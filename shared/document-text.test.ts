import { describe, expect, it } from "vitest";
import { EMPTY_DOCUMENT } from "./document";
import { formatDocument, parseDocumentText } from "./document-text";
import { STARTER_DOCUMENT } from "./starter-profile";

describe("parseDocumentText", () => {
  it("reports broken JSON instead of throwing", () => {
    const parsed = parseDocumentText("{ layouts: ");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]).toMatch(/^Not valid JSON: /);
  });

  it("names the path of each schema problem", () => {
    const text = JSON.stringify({ layouts: [{ id: "default", name: "Default", profile: { timeline: { hide: ["thinking"] } } }], extra: 1 });
    expect(parseDocumentText(text)).toEqual({
      ok: false,
      errors: [expect.stringMatching(/^layouts\.0\.profile\.timeline\.hide\.0: /), expect.stringMatching(/^\(root\): /)],
    });
  });

  it("round-trips a formatted document", () => {
    expect(parseDocumentText(formatDocument(EMPTY_DOCUMENT))).toEqual({ ok: true, document: EMPTY_DOCUMENT });
  });

  it("accepts the starter document", () => {
    expect(parseDocumentText(formatDocument(STARTER_DOCUMENT)).ok).toBe(true);
  });
});
