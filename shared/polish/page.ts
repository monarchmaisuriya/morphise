// Ported from Chat Polish (lthieu96/paseo-chat-polish, MIT, see NOTICE.md): shared/page.ts
import { heading, headingLineHeight, lineHeight, textSize } from "../design/tokens";
import { KIT_CSS_BASE, KIT_CSS_LOOK, KIT_SCRIPT, KIT_WIDGETS } from "./page-kit";
// The page an html_render call published, as the chat frames it: the app's theme, the built-in styles and the boot script. Shared so the
// daemon can lay a page out the same way when it checks it (server/page-check.ts).

export interface HtmlColors {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
  accentForeground: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
}

export const isLight = (hex: string) => {
  const m = /^#([0-9a-f]{6})/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 140;
};

/**
 * The variables a page styles itself with; posted again when the app's theme changes. `series` are the chart colors mermaid and Pele use.
 * `compact` is Paseo's layout flag, which sets a reply's text size, so a page's text matches the replies around it.
 */
export function themeCss(c: HtmlColors, fonts: { sans: string; mono: string }, series: readonly string[], compact = false) {
  const scheme = isLight(c.surface0) ? "light" : "dark";
  const text = textSize(compact);
  const vars: Record<string, string> = {
    "--fg": c.foreground,
    "--muted": c.foregroundMuted,
    "--bg": c.surface0,
    "--surface": c.surface1,
    "--surface-2": c.surface2,
    "--border": c.border,
    "--accent": c.accent,
    "--accent-fg": c.accentForeground,
    "--success": c.statusSuccess,
    "--warning": c.statusWarning,
    "--danger": c.statusDanger,
    ...Object.fromEntries(series.slice(0, 6).map((color, i) => [`--chart-${i + 1}`, color])),
    "--radius": "8px",
    "--text": `${text}px`,
    "--leading": `${lineHeight(text)}px`,
    ...Object.fromEntries(
      Object.entries(heading).flatMap(([h, scale]) => {
        const size = Math.round(text * scale);
        return [[`--${h}`, `${size}px`], [`--${h}-leading`, `${headingLineHeight(size)}px`]];
      }),
    ),
    "--font": fonts.sans,
    "--mono": fonts.mono,
  };
  return `:root{color-scheme:${scheme};${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("")}}`;
}

// The kit the tool's description promises (server/html.ts), drawn to Paseo's own scale (shared/design/tokens.ts) so a page looks like the
// replies around it. Two parts, so a page's own CSS can arrange things but never restyle them:
// - KIT_BASE, in the `kit-base` layer: resets and layout (display, sizes, margins, alignment), which the page's own styles, in the later
//   `page` layer, override;
// - KIT_LOOK, unlayered: the look of every element the kit draws (type, colour, borders, padding), which outranks anything in a layer.
const KIT_BASE = [
  "*,*::before,*::after{box-sizing:border-box}",
  // An important declaration in the first layer outranks every other rule but inline styles, so hidden always hides.
  "[hidden]{display:none!important}",
  "html{background:transparent;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;scrollbar-width:none}html::-webkit-scrollbar{display:none}body{margin:0}",
  "h1,h2,h3,h4,h5,h6{margin:0;text-wrap:balance}p{margin:0;text-wrap:pretty}ul,ol{margin:0;padding-left:20px}blockquote,figure{margin:0}hr{margin:12px 0}",
  // Readable at any width: long words and links wrap, lines stay under about 75 characters, pictures and a page's own drawings shrink to fit.
  // Table cells only break a word that can't fit, and numbers and headings never wrap, so a wide table keeps its columns and scrolls in its box.
  "p,li,dd,figcaption,blockquote{overflow-wrap:anywhere}td,th{overflow-wrap:break-word}th,td.num{white-space:nowrap}p,li{max-width:75ch}img{max-width:100%;height:auto}svg:not(.mk-svg){max-width:100%;height:auto}",
  "details>:not(summary){margin:0 12px 12px}summary{list-style:none;display:flex;align-items:center;gap:8px}summary::-webkit-details-marker{display:none}",
  "summary::before{content:'';width:6px;height:6px;flex:none;transform:rotate(-45deg);transition:transform .15s ease-out}details[open]>summary::before{transform:rotate(45deg)}",
  "pre{margin:0;overflow:auto}",
  ".stack{display:flex;flex-direction:column;gap:12px}.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}",
  ".stat{display:flex;flex-direction:column;gap:4px;min-width:0}.stat .value{text-align:left}",
  ".chip{display:inline-flex;align-items:center;gap:6px;vertical-align:middle;white-space:nowrap}",
  ".chip.good::before,.chip.warn::before,.chip.bad::before,.chip.info::before{content:'';width:7px;height:7px;flex:none}",
  "button,input,select,textarea{margin:0}",
  // Full width, as Paseo draws a table in a reply.
  "table{border-collapse:collapse;width:100%}th,td{text-align:left}",
].join("");

export const KIT_LOOK = [
  "html,body{font:var(--text)/var(--leading) var(--font);color:var(--fg)}",
  ":where(p,li,dd,dt,td,th,figcaption,blockquote,label,summary,legend){font-size:var(--text);line-height:var(--leading)}",
  "h1,h2,h3,h4,h5,h6{font-weight:700;color:var(--fg)}h6{color:var(--muted)}",
  "h1{font-size:var(--h1);line-height:var(--h1-leading)}h2{font-size:var(--h2);line-height:var(--h2-leading)}h3{font-size:var(--h3);line-height:var(--h3-leading)}",
  "h4{font-size:var(--h4);line-height:var(--h4-leading)}h5{font-size:var(--h5);line-height:var(--h5-leading)}h6{font-size:var(--h6);line-height:var(--h6-leading)}",
  ".muted{color:var(--muted)}.small,.small :where(p,li,dd,dt,td,th,figcaption,blockquote,label,summary,legend){font-size:12px;line-height:16px}",
  "a{color:var(--accent);text-decoration:none;text-underline-offset:2px}a:hover{text-decoration:underline}",
  "li::marker{color:var(--muted)}li+li{padding-top:4px}",
  "blockquote{padding:12px;background:var(--surface);border-left:3px solid var(--surface-2);color:color-mix(in srgb,var(--fg) 80%,transparent)}",
  "hr{border:0;border-top:1px solid var(--border)}",
  "code,kbd,pre,samp{font-family:var(--mono);font-size:12px}",
  ":not(pre)>code,kbd,samp{padding:1px 5px;border-radius:4px;background:var(--surface-2);border:0}kbd{border:1px solid var(--border)}",
  "pre{padding:12px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border);line-height:1.5}",
  "mark{background:color-mix(in srgb,var(--warning) 33%,transparent);color:inherit;padding:0 4px;border-radius:4px}",
  "::selection{background:color-mix(in srgb,var(--accent) 30%,transparent)}body *{scrollbar-width:thin;scrollbar-color:var(--border) transparent}",
  ":focus-visible{outline:2px solid var(--accent);outline-offset:-2px}",
  "details{border:1px solid var(--border);border-radius:8px;background:var(--surface)}",
  "summary{cursor:pointer;padding:8px 12px;border-radius:8px;font-weight:500}summary:hover{background:color-mix(in srgb,var(--fg) 5%,transparent)}",
  "summary::before{border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted)}",
  ".card{padding:16px;border-radius:12px;background:var(--surface);border:1px solid var(--border)}",
  // A stat is a tile of its own (label, then value, both from the left); inside a card it is just its text, so cards never nest.
  ".stat{padding:12px 14px;border-radius:8px;background:var(--surface);border:1px solid var(--border)}.card.stat{padding:16px}.card .stat{padding:0;background:none;border:0}",
  ".stat .label{color:var(--muted);font-size:12px;line-height:16px}.stat .value{font-size:22px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}",
  // A chip is Paseo's tag: a 22px pill (20px line and its border); a tone adds a coloured dot, and the word carries the meaning.
  ".chip{padding:0 8px;border-radius:9999px;font-size:12px;line-height:20px;background:var(--surface);border:1px solid var(--border);color:var(--fg)}",
  ".chip.good::before{border-radius:9999px;background:var(--success)}.chip.warn::before{border-radius:9999px;background:var(--warning)}",
  ".chip.bad::before{border-radius:9999px;background:var(--danger)}.chip.info::before{border-radius:9999px;background:var(--accent)}",
  "button{font:inherit;font-size:14px;line-height:20px;color:var(--fg);padding:5px 12px;min-height:32px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:border-color .15s ease-out,background-color .15s ease-out}",
  "button:hover{border-color:var(--muted)}button:disabled{opacity:.5;cursor:default}",
  "button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}button.primary:hover{filter:brightness(1.08)}",
  // A selected toggle or tab, which a mock-up marks with ARIA (or .active).
  "button[aria-pressed=true],button.active,button[aria-current],[role=tab][aria-selected=true],[role=tab].active{background:var(--surface-2);border-color:var(--muted);color:var(--fg)}",
  "input,select,textarea{font:inherit;font-size:14px;line-height:20px;color:var(--fg);background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 8px;min-height:32px}::placeholder{color:var(--muted)}",
  "input[type=range],input[type=checkbox],input[type=radio]{accent-color:var(--accent);padding:0;min-height:0;border:0;background:none}",
  // Tables as Paseo draws them in a reply: a line round the table and every cell, a bold header on the third surface, rows shaded from
  // the page background; hover lays a tint over the shade, and an inline cell background (a heatmap) still wins.
  "table{border:1px solid var(--border);font-variant-numeric:tabular-nums}",
  "th,td{padding:8px 12px;border:1px solid var(--border)}",
  "th{font-weight:700;color:var(--fg);background:var(--surface-2)}",
  "tbody tr:nth-child(odd)>td{background:var(--bg)}tbody tr:nth-child(even)>td{background:var(--surface)}",
  "tbody tr:hover>td{background-image:linear-gradient(color-mix(in srgb,var(--fg) 4%,transparent),color-mix(in srgb,var(--fg) 4%,transparent))}",
  // Plain text in cells: a page's own badges and colours are dropped (kit classes, more specific, keep theirs), and the kit's chips too.
  ":where(td,th) :where(span,b,strong,em,i,small,abbr,div,p){background:none;border:0;border-radius:0;padding:0;box-shadow:none;color:inherit;font-size:inherit}",
  "td .chip,th .chip{background:none;border:0;border-radius:0;padding:0;color:inherit;font-size:inherit;line-height:inherit}td .chip::before,th .chip::before{content:none}",
].join("");

// Applies the theme the chat posts and reports the content's height, so the frame fits the page instead of scrolling inside it.
// A link to another site opens in the system browser through the chat (or a new tab, on its own), never in place of the page. A framed srcdoc
// page resolves relative links against the chat's own address, so an "#anchor" sets the page's hash itself (it scrolls, hashchange fires)
// and other relative links do nothing. Esc and app shortcuts (⌘ or Ctrl chords, but not clipboard, undo or select-all, nor in a text field) reach the
// chat unless one of the page's own listeners handled them; the check waits a tick so they all run first.
const BOOT = `(function(){var t=document.getElementById("cp-theme"),r=document.documentElement,h=-1,w=-1;addEventListener("message",function(e){var d=e.data;if(e.source===parent&&d&&d.type==="cp-html-theme"&&typeof d.css==="string")t.textContent=d.css;});function post(){var v=Math.ceil(r.scrollHeight>r.clientHeight?r.scrollHeight:r.getBoundingClientRect().height),x=innerWidth;if(v!==h||x!==w){h=v;w=x;parent.postMessage({type:"cp-html-height",height:v,width:x},"*");}}if(window.ResizeObserver){var o=new ResizeObserver(post);o.observe(r);document.addEventListener("DOMContentLoaded",function(){o.observe(document.body);post();});}addEventListener("load",post);document.addEventListener("click",function(e){var l=e.isTrusted&&e.composedPath().find(function(n){return n&&n.matches&&n.matches("a[href]");}),h,u;if(!l)return;h=l.getAttribute("href").trim();if(h.charAt(0)==="#"){e.preventDefault();location.hash=h;return;}try{u=new URL(h);}catch(x){if(parent!==window)e.preventDefault();return;}if(!/^https?:$/.test(u.protocol))return;if(parent!==window){e.preventDefault();parent.postMessage({type:"cp-html-link",url:u.href},"*");}else{l.setAttribute("target","_blank");l.setAttribute("rel","noopener");}},true);if(parent!==window)addEventListener("keydown",function(e){var n=e.composedPath()[0],k=e.key==="Escape"||(e.metaKey||e.ctrlKey)&&!/^(?:[acvxyz]|Meta|Control|Shift|Alt)$/i.test(e.key)&&!(n&&(n.isContentEditable||/^(?:INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));if(!e.isTrusted||e.isComposing||!k)return;setTimeout(function(){if(!e.defaultPrevented)parent.postMessage({type:"cp-html-key",key:e.key,code:e.code,metaKey:e.metaKey,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey},"*");});});})();`;

// A page on its own (browser tab) has no chat around it: it takes the chat's background and a centered column.
const STANDALONE = "html{background:var(--bg)}body{max-width:1120px;margin:0 auto;padding:32px 24px}";

/**
 * What a page may reach, in every place it runs (chat frame, daemon's check, browser tab): nothing on the network but scripts, styles and
 * fonts over https, since the tool's description lets a page load a library from an https CDN (so a script or style address can still carry
 * data out), and workers from blob: URLs, which charting libraries make. Its local images arrive inlined as data URIs.
 */
export const PAGE_POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; font-src https: data:; img-src data: blob:; worker-src blob:; connect-src 'none'; form-action 'none'";

/**
 * The agent's page after a head of ours: the policy, theme, kit, boot script and the helpers (./page-kit.ts). A meta policy covers only what follows it, so the page comes
 * after all of it. The parser still files the page's own <meta>, <style>, <title> and <link> into this head, folds its <html> attributes onto
 * the root and drops its doctype and <head> tag.
 */
export function htmlPage(html: string, theme: string, standalone = false) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${PAGE_POLICY}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style id="cp-theme">${theme}</style><style>@layer kit-base,page;@layer kit-base{${KIT_BASE}${KIT_CSS_BASE}}${KIT_LOOK}${KIT_CSS_LOOK}${KIT_WIDGETS}${standalone ? STANDALONE : ""}</style><script>${BOOT}</script><script>${KIT_SCRIPT}</script>`;
  return `<!doctype html><html><head>${head}</head>${layerPageStyles(html)}`;
}

// The page's own <style> elements (not those inside scripts, templates, text areas or comments, and not a closing tag that never comes).
const STYLE_SCAN = /<!--[\s\S]*?-->|<(script|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi;

/** Whether a style's braces pair up, outside strings and comments; one that closes early would leave its later rules outside the layer. */
function balanced(css: string) {
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) return false;
      i = end + 1;
    } else if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch; i++) if (css[i] === "\\") i++;
    } else if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

/** The end of an at-rule that runs to a semicolon, past strings and brackets. */
function statementEnd(css: string, from: number) {
  let depth = 0;
  for (let i = from; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch; i++) if (css[i] === "\\") i++;
    } else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth <= 0) return i + 1;
  }
  return css.length;
}

/** `@import url(a) screen;` as `@import url(a) layer(page) screen;`; an import that names its own layer keeps it. */
function layerImport(rule: string) {
  const m = /^@import\s+(url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*([\s\S]*?);?\s*$/i.exec(rule);
  if (!m) return rule;
  const rest = m[2]!.trim();
  if (/^layer\b/i.test(rest)) return rule.trim().endsWith(";") ? rule.trim() : `${rule.trim()};`;
  return `@import ${m[1]} layer(page)${rest ? ` ${rest}` : ""};`;
}

/** One style's CSS inside the `page` layer, or null when its braces don't balance (the html_render check reports those). */
function layerCss(css: string): string | null {
  const cdata = /^(\s*<!\[CDATA\[)([\s\S]*?)(\]\]>\s*)$/.exec(css);
  if (cdata) {
    const inner = layerCss(cdata[2]!);
    return inner === null ? null : `${cdata[1]}${inner}${cdata[3]}`;
  }
  let body = css.replace(/^\s*<!--/, "").replace(/-->\s*$/, "");
  const imports: string[] = [];
  for (;;) {
    const lead = /^\s*(\/\*[\s\S]*?\*\/\s*)*/.exec(body)![0].length;
    const rest = body.slice(lead);
    if (/^@charset\b/i.test(rest)) body = rest.slice(statementEnd(rest, 0));
    else if (/^@import\b/i.test(rest)) {
      const end = statementEnd(rest, 0);
      imports.push(layerImport(rest.slice(0, end)));
      body = rest.slice(end);
    } else break;
  }
  if (!balanced(body)) return null;
  return `${imports.join("")}@layer page{${body.trim()}}`;
}

const cssType = (attributes: string) => /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]?.toLowerCase();

/** The agent's page with each of its own CSS <style> blocks in the `page` layer; scripts' own style types (text/tailwindcss) stay as they are. */
export function layerPageStyles(html: string) {
  return html.replace(STYLE_SCAN, (match, raw: string | undefined, attributes: string | undefined, css: string | undefined) => {
    if (raw !== undefined || css === undefined) return match;
    const type = cssType(attributes ?? "");
    if (type && type !== "text/css") return match;
    const layered = layerCss(css);
    return layered === null ? match : `<style${attributes}>${layered}</style>`;
  });
}

/** The CSS of the page's own style blocks whose braces don't balance, which stay outside the layer. */
export function unbalancedStyles(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(STYLE_SCAN)) {
    const [, raw, attributes, css] = m;
    if (raw !== undefined || css === undefined) continue;
    const type = cssType(attributes ?? "");
    if (!(type && type !== "text/css") && layerCss(css) === null) out.push(css);
  }
  return out;
}
