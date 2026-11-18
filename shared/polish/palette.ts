import { isLight } from "./page";

// The colours of a page's chart series (--chart-1 to --chart-6): the dataviz skill's validated categorical palette, first six slots, in
// its fixed order (blue, orange, aqua, yellow, magenta, green). Each set passes the skill's colour-blind and normal-vision separation checks
// on its own surface. Dark: every colour is 3:1 or more on dark page and card backgrounds. Light: aqua, yellow and magenta sit below 3:1 on
// white, which the skill allows when values can be read another way; charts show value labels and tooltips.
export const CHART_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"] as const;
export const CHART_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"] as const;

/** The set for a page whose background is `background` (a #rrggbb colour); anything else counts as dark, as Paseo's default theme is. */
export const chartPalette = (background: string): readonly string[] => (isLight(background) ? CHART_LIGHT : CHART_DARK);
