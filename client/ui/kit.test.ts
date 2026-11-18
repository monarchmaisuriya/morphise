import { describe, expect, it, vi } from "vitest";
import { fontSize, radius } from "../../shared/design/tokens";

vi.mock("@getpaseo/plugin/client/ui", () => ({ Icon: () => null, TextInput: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("../profile-store", () => ({ createValueStore: () => ({}), useValue: () => undefined }));
vi.mock("../web", () => ({ onPressOutside: () => () => {}, useTooltip: () => ({}) }));

const { tokens } = await import("./kit");
const theme = { colors: {} } as Parameters<typeof tokens>[0];

// Morphise's native screens take their sizes from Paseo's own scale (shared/design/tokens.ts), as its pages do.
describe("the native kit's sizes", () => {
  it("rounds corners on Paseo's scale", () => {
    expect(tokens(theme, false).radius).toEqual({ control: radius.md, row: radius.lg, card: radius.lg, panel: radius.xl });
  });
  it("sizes text on Paseo's scale: 14px body (15px compact, as a reply), 12px small print, 20px titles", () => {
    const t = tokens(theme, false), c = tokens(theme, true);
    expect([t.text.title.fontSize, t.text.heading.fontSize, t.text.row.fontSize, t.text.label.fontSize, t.text.meta.fontSize, t.text.small.fontSize, t.text.danger.fontSize]).toEqual([fontSize["2xl"], fontSize.base, fontSize.base, fontSize.sm, fontSize.sm, fontSize.sm, fontSize.sm]);
    expect([t.text.body.fontSize, t.text.body.lineHeight]).toEqual([fontSize.base, 20]);
    expect([c.text.body.fontSize, c.text.body.lineHeight]).toEqual([fontSize.content, 21]);
  });
});
