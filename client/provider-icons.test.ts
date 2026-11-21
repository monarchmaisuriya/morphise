import { expect, it } from "vitest";
import { findSvgIconProblem } from "@getpaseo/plugin";
import { providerIconSvg } from "./provider-icons";

it.each([
  ["antigravity", "M89.6992 93.695"],
  ["claude", "M4.709 15.955"],
  ["codex", "M21.55 10.004"],
  ["copilot", "M181.33 266.143"],
  ["kiro", "M7.97 16.376"],
  ["minimax", "M16.278 2"],
  ["omp", "M10 14h44v9"],
  ["opencode", "M384 416H128V96H384V416Z"],
  ["pi", "M165.29 165.29"],
])("resolves native %s geometry without snapshot artwork", (provider, path) => {
  const svg = providerIconSvg(provider);
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain(path);
  expect(svg).toContain('fill="currentColor"');
  expect(findSvgIconProblem(svg!)).toBeNull();
  expect(svg).not.toMatch(/\{|\}|<Svg|<Path|href=|<script/);
});

it("matches native built-in precedence rather than replacing Claude with supplied artwork", () => {
  expect(providerIconSvg("claude", "<svg/>" )).toContain("M4.709 15.955");
});

it("preserves custom provider artwork", () => {
  expect(providerIconSvg("deepseek-harness", '<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>')).toBe('<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>');
});

it.each(["unknown", "", "constructor", "__proto__"])("leaves unknown provider %s to the existing generic fallback", (provider) => {
  expect(providerIconSvg(provider)).toBeUndefined();
});
