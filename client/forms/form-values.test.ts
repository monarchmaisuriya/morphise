import { describe, expect, it } from "vitest";
import { parseMetadataText, uniqueId } from "./form-values";

describe("uniqueId", () => {
  it("gives a new list item an id that is not taken", () => {
    expect(uniqueId("row", [])).toBe("row");
    expect(uniqueId("row", ["row", "row-2"])).toBe("row-3");
  });
});

describe("parseMetadataText", () => {
  it("reads one key=value per line, keeping JSON values as JSON and other text as text", () => {
    expect(parseMetadataText('morphise.kind=spike\nreview=true\nlimits={"cpu":2}\n\n')).toEqual({
      "morphise.kind": "spike",
      review: true,
      limits: { cpu: 2 },
    });
  });

  it("stores nothing for blank text", () => {
    expect(parseMetadataText("  \n ")).toBeUndefined();
  });
});
