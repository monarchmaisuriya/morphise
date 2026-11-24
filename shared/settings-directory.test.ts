import { expect, it } from "vitest";
import { findSettings } from "./settings-directory";

it("finds appearance and device-memory topics without reading saved values", () => {
  expect(findSettings("status rotation").map((value) => value.title)).toEqual(["Look"]);
  expect(findSettings("remember model").map((value) => value.title)).toEqual(["Quick Chat"]);
  expect(findSettings("unlisted-secret-value")).toEqual([]);
});
