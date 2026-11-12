import { afterEach, describe, expect, it } from "vitest";
import { polishPrefs } from "../../../shared/polish/prefs";
import { setPrefs } from "../prefs";
import { imageRowData, imagesOf } from "./image-rows";

afterEach(() => setPrefs(polishPrefs(undefined)));

describe("image-only reply rows", () => {
  it("take a reply that is only images, with a default alt text", () => {
    expect(imagesOf("![login](/tmp/a.png)\n\n![](file:///tmp/b.png)")).toEqual({ images: [{ alt: "login", url: "/tmp/a.png" }, { alt: "Image", url: "file:///tmp/b.png" }] });
    expect(imagesOf("![](/tmp/a.png)", "zh")).toEqual({ images: [{ alt: "图片", url: "/tmp/a.png" }] });
  });

  it("leave replies with text, or with no images, to Paseo", () => {
    expect(imagesOf("Here it is: ![a](/tmp/a.png)")).toBeUndefined();
    expect(imagesOf("   ")).toBeUndefined();
  });

  it("are off while Images is Paseo's own (the default)", () => {
    expect(imageRowData("![a](/tmp/a.png)")).toBeUndefined();
    setPrefs(polishPrefs({ polish: { images: "large" } }));
    expect(imageRowData("![a](/tmp/a.png)")).toEqual({ images: [{ alt: "a", url: "/tmp/a.png" }] });
  });
});
