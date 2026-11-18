// Paseo's own design scale, so every Morphise surface (HTML pages now, native UI next) matches the app around it. Copied from the
// Paseo 0.16.1 app bundle (_expo/static/js/web/index-*.js): the theme object `L={spacing,fontSize,…,borderRadius}` and
// `createMarkdownStyles`, which draws a chat reply. Plugins get Paseo's colours (PluginTheme) but not these sizes, hence the copy.

/** Corner radii (theme `borderRadius`). */
export const radius = { sm: 2, base: 4, md: 6, lg: 8, xl: 12, "2xl": 16, full: 9999 } as const;

/** Font sizes (theme `fontSize`); `content` is a reply's text, `base` the same in a compact layout, `code` inline and block code. */
export const fontSize = { code: 12, sm: 12, base: 14, content: 15, lg: 16, xl: 18, "2xl": 20, "3xl": 22 } as const;

/** A reply's text size: `fontSize.content`, or `fontSize.base` when Paseo lays the chat out compact. */
export const textSize = (compact: boolean) => (compact ? fontSize.base : fontSize.content);

/** A reply's line height: 1.4 times its text size. */
export const lineHeight = (size: number) => Math.round(size * 1.4);

/** Heading sizes as multiples of the text size; headings are bold, on a line 1.3 times their size (h6 is also muted). */
export const heading = { h1: 1.6, h2: 1.4, h3: 1.2, h4: 1.1, h5: 1, h6: 1 } as const;
export const headingLineHeight = (size: number) => Math.round(size * 1.3);

/** A markdown table: 1px lines on every cell and round the table, 8 by 12 cell padding, a frame with a 6 radius. */
export const table = { borderWidth: 1, radius: 6, padY: 8, padX: 12 } as const;
