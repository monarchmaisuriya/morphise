// The helpers every page gets beside the kit's CSS (shared/polish/page.ts htmlPage), so common visuals come out right
// without the agent placing anything by hand: Morphise.chart (bar, line, area, donut, sparkline), sortable and filterable
// tables, picture galleries, Morphise.ask (a follow-up into the chat's message box, decided by the chat) and the SVG
// export the chat asks for. Plain ES5 in strings, as the page runs it; the layout maths is a block of its own so tests
// can run it without a DOM. A lasting contract for pages already in chats: later versions only add to the API (Morphise.version); how
// things look may improve.

export const KIT_VERSION = 2;

export const KIT_CSS = [
  // Numbers line up by digit everywhere; only table cells right-align them.
  ".num{font-variant-numeric:tabular-nums}td.num,th.num{text-align:right}",
  ".scroll{overflow:auto}",
  "table.sortable th{cursor:pointer;user-select:none;white-space:nowrap}table.sortable th[aria-sort]::after{content:'';display:inline-block;margin-left:4px;border:4px solid transparent;vertical-align:middle}",
  "table.sortable th[aria-sort=ascending]::after{border-bottom-color:var(--muted);margin-top:-4px}table.sortable th[aria-sort=descending]::after{border-top-color:var(--muted);margin-top:4px}",
  ".mk-filter{width:100%;max-width:280px;margin-bottom:8px}",
  ".gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}.gallery figure{margin:0;display:flex;flex-direction:column;gap:6px}",
  ".gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface)}.gallery figcaption{font-size:12px;color:var(--muted)}",
  ".mk-chart{position:relative;width:100%}.mk-chart svg{display:block;overflow:visible}.mk-chart text{font:11px var(--font);fill:var(--muted)}",
  ".mk-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:8px;font-size:12px;color:var(--muted)}.mk-legend span{display:inline-flex;align-items:center;gap:5px}",
  ".mk-legend i{display:inline-block;width:8px;height:8px;border-radius:2px}.mk-legend .mk-on{color:var(--fg)}",
  // Legend items are buttons that hide and show a series; reset so neither the kit's nor a page's own button style changes them.
  ".mk-legend button{all:unset;display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:var(--muted);border-radius:4px;padding:1px 3px;font-size:12px}",
  ".mk-legend button:hover{color:var(--fg)}.mk-legend button[aria-pressed=false]{opacity:.45}.mk-legend button:focus-visible{outline:2px solid var(--accent)}",
  ".mk-chart svg:focus{outline:none}.mk-chart svg:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}",
  ".mk-chart rect,.mk-chart path,.mk-chart circle{transition:opacity .12s ease-out}.mk-chart .mk-dim{opacity:.4}.mk-chart text.mk-value{fill:var(--fg)}",
  ".mk-tip{position:absolute;z-index:10;display:none;pointer-events:none;max-width:260px;padding:6px 9px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--fg);font:12px/1.45 var(--font);box-shadow:0 4px 14px rgba(0,0,0,.28)}",
  ".mk-tip-title{font-weight:600;overflow-wrap:anywhere}.mk-tip-row{display:flex;align-items:center;gap:6px}.mk-tip-row i{width:8px;height:8px;border-radius:2px;flex:none}",
  ".mk-tip-row span{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mk-tip-row b{margin-left:auto;padding-left:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}",
  ".mk-table{overflow-x:auto;max-width:100%}tbody tr:hover>td{background:color-mix(in srgb,var(--fg) 4%,transparent)}",
  "table.sortable th:hover,table.sortable th:focus-visible{color:var(--fg)}",
  ".gallery{position:relative}.gallery img{cursor:zoom-in}.gallery img:focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
  ".mk-zoom{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px;background:var(--bg);border-radius:var(--radius);cursor:zoom-out;outline:none}",
  ".mk-zoom img{width:auto;max-width:100%;max-height:calc(100% - 28px);aspect-ratio:auto;object-fit:contain;border:0;background:none}",
  "@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}",
].join("");

// Pure layout maths, no DOM: nice axis ticks, compact numbers, label spacing and truncation.
export const KIT_MATH = `
function mkNiceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  if (max === min) max = min + 1;
  var span = max - min, raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), norm = raw / mag;
  var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (var v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}
function mkCompact(v) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  var a = Math.abs(v), s = v < 0 ? "-" : "";
  function f(n) { var t = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10; return String(t); }
  if (a >= 1e9) return s + f(a / 1e9) + "B";
  if (a >= 1e6) return s + f(a / 1e6) + "M";
  if (a >= 1e4) return s + f(a / 1e3) + "k";
  return s + (Math.round(a * 100) / 100);
}
function mkTruncate(text, max) { text = String(text); return text.length > max ? text.slice(0, Math.max(1, max - 1)) + "\\u2026" : text; }
function mkTextWidth(text) { return String(text).length * 6.6; }
function mkLabelStep(labels, band) {
  var widest = 0;
  for (var i = 0; i < labels.length; i++) widest = Math.max(widest, mkTextWidth(labels[i]));
  return Math.max(1, Math.ceil((widest + 8) / Math.max(1, band)));
}
// A label in at most two lines that fit maxWidth: words go on the first line while they fit (a word too long for a line is split), the
// rest on the second, shortened with an ellipsis only if it still doesn't fit. short: whether anything was cut.
function mkWrap(text, maxWidth) {
  var max = Math.max(1, Math.floor(maxWidth / 6.6)), words = String(text).split(/\\s+/).filter(Boolean), first = "", i = 0;
  if (!words.length) return { lines: [""], short: false };
  if (words[0].length > max) { first = words[0].slice(0, max); words[0] = words[0].slice(max); }
  else { first = words[0]; i = 1; while (i < words.length && (first + " " + words[i]).length <= max) first += " " + words[i++]; }
  var rest = words.slice(i).join(" ");
  if (!rest) return { lines: [first], short: false };
  return rest.length <= max ? { lines: [first, rest], short: false } : { lines: [first, rest.slice(0, Math.max(1, max - 1)) + "\u2026"], short: true };
}
// A bar's thickness in a band shared by groups bars: 72% of the band, at most cap (so two bars on a wide chart aren't slabs), at least 2px.
function mkBarSize(band, groups, cap) { return Math.max(2, Math.min(cap, band * 0.72 / Math.max(1, groups))); }
// The index of the centre nearest x, -1 for none.
function mkNearest(centres, x) { var best = -1, d = Infinity; for (var i = 0; i < centres.length; i++) { var e = Math.abs(centres[i] - x); if (e < d) { d = e; best = i; } } return best; }
// Where a tooltip goes: centred on the anchor, above it (8px gap), below when there is no room above, always inside room (so it never
// pushes the page taller, which would grow the chat's frame).
function mkTipPlace(anchor, tip, room) {
  var left = Math.max(0, Math.min(anchor.x - tip.width / 2, room.width - tip.width));
  var top = anchor.top - tip.height - 8 >= 0 ? anchor.top - tip.height - 8 : anchor.bottom + 8;
  return { left: Math.round(left), top: Math.round(Math.max(0, Math.min(top, room.height - tip.height))) };
}
function mkParseNumber(text) {
  var t = String(text).replace(/[,\\s$€£¥%]/g, "");
  var m = /^(-?\\d*\\.?\\d+)([kKmMbB])?$/.exec(t);
  if (!m) return null;
  var n = parseFloat(m[1]), u = (m[2] || "").toLowerCase();
  return u === "k" ? n * 1e3 : u === "m" ? n * 1e6 : u === "b" ? n * 1e9 : n;
}
`;

const DOM = `
var NS = "http://www.w3.org/2000/svg";
function mkColor(i) { var c = getComputedStyle(document.documentElement).getPropertyValue("--chart-" + (i % 6 + 1)).trim(); return c || "var(--accent)"; }
function mkEl(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function mkFmt(v, unit) { return v === null || v === undefined ? "" : v === 0 ? "0" : mkCompact(v) + (unit || ""); }

// One tooltip for the whole page (charts and data-tip), in page coordinates and always inside the page, so it never makes the page taller.
var mkTipEl = null, mkTipOwner = null;
function mkTipRows(title, rows) {
  var f = document.createDocumentFragment();
  if (title) { var t = document.createElement("div"); t.className = "mk-tip-title"; t.textContent = title; f.appendChild(t); }
  (rows || []).forEach(function (r) {
    var line = document.createElement("div"); line.className = "mk-tip-row";
    if (r.color) { var sw = document.createElement("i"); sw.style.background = r.color; line.appendChild(sw); }
    if (r.name) { var n = document.createElement("span"); n.textContent = r.name; line.appendChild(n); }
    var v = document.createElement("b"); v.textContent = r.value; line.appendChild(v); f.appendChild(line);
  });
  return f;
}
function mkShowTip(owner, rect, title, rows) {
  if (!mkTipEl) { mkTipEl = document.createElement("div"); mkTipEl.className = "mk-tip"; mkTipEl.setAttribute("role", "tooltip"); }
  var tip = mkTipEl; tip.style.display = "none"; if (!tip.parentNode) document.body.appendChild(tip);
  var root = document.documentElement, room = { width: root.clientWidth, height: root.scrollHeight };
  tip.textContent = ""; tip.appendChild(mkTipRows(title, rows)); tip.style.left = "0px"; tip.style.top = "0px"; tip.style.display = "block";
  var size = tip.getBoundingClientRect(), sx = window.scrollX || 0, sy = window.scrollY || 0;
  var at = mkTipPlace({ x: rect.left + rect.width / 2 + sx, top: rect.top + sy, bottom: rect.bottom + sy }, { width: size.width, height: size.height }, room);
  tip.style.left = at.left + "px"; tip.style.top = at.top + "px"; mkTipOwner = owner;
}
function mkHideTip(owner) { if (mkTipEl && (!owner || mkTipOwner === owner)) { mkTipEl.style.display = "none"; mkTipOwner = null; } }
function mkTipShown(owner) { return !!mkTipEl && mkTipOwner === owner && mkTipEl.style.display !== "none"; }

// A label of up to two lines at x, starting at y (anchor: start, middle or end); marks it when it had to be shortened.
function mkLabel(svg, wrap, x, y, anchor, full) {
  var tx = mkEl("text", { x: x, y: y, "text-anchor": anchor }, svg);
  wrap.lines.forEach(function (line, k) { var ts = mkEl("tspan", { x: x, dy: k ? 13 : 0 }, tx); ts.textContent = line; });
  if (wrap.short) tx.setAttribute("data-mk-short", String(full));
  return tx;
}

// Hover, tap and keys over a chart's points (hits: { x, top, bottom, title, rows, marks, dots }): the nearest point (or the slice under the
// pointer) is lit, the others dim, and the shared tooltip shows its values. Left and Right move along; Escape hides it without leaving full screen.
function mkInteract(box, svg, hits, pick, guide) {
  var current = -1;
  function anchor(h) { var r = svg.getBoundingClientRect(); return { left: r.left + h.x - 1, width: 2, top: r.top + h.top, bottom: r.top + h.bottom }; }
  function on(i) {
    if (i < 0 || i >= hits.length) return off();
    current = i;
    hits.forEach(function (h, j) { h.marks.forEach(function (m) { if (j === i) m.classList.remove("mk-dim"); else m.classList.add("mk-dim"); }); (h.dots || []).forEach(function (d) { d.setAttribute("r", j === i ? d.getAttribute("data-r") * 1 + 2 : d.getAttribute("data-r")); }); });
    if (guide) { guide.setAttribute("x1", hits[i].x); guide.setAttribute("x2", hits[i].x); guide.style.display = ""; }
    if (hits[i].legend) hits.forEach(function (h, j) { if (h.legend) h.legend.classList.toggle("mk-on", j === i); });
    mkShowTip(box, anchor(hits[i]), hits[i].title, hits[i].rows);
  }
  function off() {
    current = -1;
    hits.forEach(function (h) { h.marks.forEach(function (m) { m.classList.remove("mk-dim"); }); (h.dots || []).forEach(function (d) { d.setAttribute("r", d.getAttribute("data-r")); }); if (h.legend) h.legend.classList.remove("mk-on"); });
    if (guide) guide.style.display = "none";
    mkHideTip(box);
  }
  svg.addEventListener("pointermove", function (e) { var i = pick(e); if (i !== current) { if (i < 0) off(); else on(i); } });
  svg.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") on(pick(e)); });
  svg.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") off(); });
  svg.addEventListener("focus", function () { on(current >= 0 ? current : 0); });
  svg.addEventListener("blur", off);
  svg.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown") { on(Math.min(hits.length - 1, current + 1)); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === "ArrowUp") { on(Math.max(0, current - 1)); e.preventDefault(); }
    else if (k === "Home") { on(0); e.preventDefault(); }
    else if (k === "End") { on(hits.length - 1); e.preventDefault(); }
    else if (k === "Escape" && mkTipShown(box)) { off(); e.preventDefault(); }
  });
}
function mkNearestPick(svg, centres, axis) {
  return function (e) { var r = svg.getBoundingClientRect(); return mkNearest(centres, axis === "x" ? e.clientX - r.left : e.clientY - r.top); };
}

function mkDraw(box, spec) {
  mkHideTip(box);
  box.innerHTML = "";
  var type = spec.type || "bar", unit = spec.unit || "", hidden = box._mkHidden || (box._mkHidden = {});
  // Each series keeps its colour (its place in the spec) when another is hidden: colour follows the series, not its rank.
  var every = (spec.series || []).slice(0, 6).map(function (s, i) { return { name: s.name, values: s.values || [], color: mkColor(i), index: i }; });
  var series = every.filter(function (s) { return !hidden[s.index]; });
  if (!series.length) { hidden = box._mkHidden = {}; series = every; }
  // Without labels, values are numbered, so a chart with data never draws empty.
  var labels = spec.labels && spec.labels.length ? spec.labels : ((every[0] && every[0].values) || []).map(function (_, i) { return String(i + 1); });
  var height = spec.height || (type === "sparkline" ? 48 : 240), width = Math.max(120, box.clientWidth || 600);
  if (every.length > 1 && type !== "sparkline" && type !== "donut") {
    var legend = document.createElement("div"); legend.className = "mk-legend";
    every.forEach(function (s) {
      var item = document.createElement("button"); item.type = "button"; item.setAttribute("aria-pressed", hidden[s.index] ? "false" : "true");
      item.setAttribute("aria-label", (hidden[s.index] ? "Show " : "Hide ") + (s.name || "Series " + (s.index + 1)));
      var dot = document.createElement("i"); dot.style.background = s.color; item.appendChild(dot); item.appendChild(document.createTextNode(s.name || "Series " + (s.index + 1)));
      item.addEventListener("click", function () { var shown = every.filter(function (x) { return !hidden[x.index]; }).length; if (!hidden[s.index] && shown <= 1) return; hidden[s.index] = !hidden[s.index]; if (box._mkRedraw) box._mkRedraw(); });
      legend.appendChild(item);
    });
    box.appendChild(legend);
  }
  var svg = mkEl("svg", { width: width, height: height, viewBox: "0 0 " + width + " " + height, role: "img", "class": "mk-svg" }, box);
  svg.setAttribute("aria-label", spec.title || (type + " chart, " + labels.length + " items; use the arrow keys to read the values"));
  if (type === "sparkline") return mkSpark(svg, series[0] || every[0] || { values: [], color: mkColor(0) }, width, height);
  svg.setAttribute("tabindex", "0");
  if (type === "donut") return mkDonut(box, svg, every[0] || { values: [], color: mkColor(0) }, labels, width, height, unit);
  var all = [];
  series.forEach(function (s) { s.values.forEach(function (v) { if (typeof v === "number") all.push(spec.stacked && type === "bar" ? 0 : v); }); });
  if (spec.stacked && type === "bar") labels.forEach(function (_, i) { var sum = 0; series.forEach(function (s) { var v = s.values[i]; if (typeof v === "number") sum += v; }); all.push(sum); });
  var ticks = mkNiceTicks(Math.min.apply(null, all.concat([0])), Math.max.apply(null, all.concat([0])), 4);
  var lo = ticks[0], hi = ticks[ticks.length - 1];
  if (type === "bar" && spec.horizontal) return mkHBar(box, svg, series, labels, ticks, lo, hi, width, height, unit, spec.stacked);
  var tickWidest = 0; ticks.forEach(function (t) { tickWidest = Math.max(tickWidest, mkTextWidth(mkFmt(t, unit))); });
  var left = Math.ceil(tickWidest) + 10, right = 8, n = Math.max(1, labels.length), band0 = (width - left - right) / n;
  // Labels wrap to two lines in their band; when even that is too tight, every other one (or fewer) shows, with the room of its skipped neighbours.
  var wraps = labels.map(function (l) { return mkWrap(l, Math.max(20, band0 - 6)); }), step = mkLabelStep(wraps.map(function (w) { return w.lines.reduce(function (a, b) { return a.length >= b.length ? a : b; }, ""); }), band0);
  if (step > 1) wraps = labels.map(function (l) { return mkWrap(l, Math.max(20, band0 * step - 6)); });
  var twoLines = wraps.some(function (w, i) { return !(i % step) && w.lines.length > 1; });
  var valued = type === "bar" && !spec.stacked && series.length === 1 && labels.length <= 12;
  var top = valued ? 20 : 8, bottom = twoLines ? 36 : 22, plotW = width - left - right, plotH = height - top - bottom, band = plotW / n;
  function y(v) { return top + plotH - (v - lo) / (hi - lo) * plotH; }
  ticks.forEach(function (t) {
    mkEl("line", { x1: left, x2: width - right, y1: y(t), y2: y(t), stroke: "var(--border)", "stroke-width": 1 }, svg);
    var tx = mkEl("text", { x: left - 6, y: y(t) + 4, "text-anchor": "end" }, svg); tx.textContent = mkFmt(t, unit);
  });
  labels.forEach(function (l, i) { if (i % step) return; mkLabel(svg, wraps[i], left + band * (i + 0.5), top + plotH + 15, "middle", l); });
  var hits = labels.map(function (l, i) { return { x: left + band * (i + 0.5), top: top + plotH, bottom: top + plotH, title: String(l), rows: [], marks: [], dots: [] }; });
  if (type === "bar") {
    var groups = spec.stacked ? 1 : series.length, barW = mkBarSize(band, groups, 48), gap = groups > 1 ? 2 : 0;
    labels.forEach(function (l, i) {
      var base = 0, total = 0, x0 = left + band * i + (band - barW * groups) / 2, h = hits[i];
      series.forEach(function (s, si) {
        var v = s.values[i]; if (typeof v !== "number") return;
        var x = x0 + (spec.stacked ? 0 : barW * si), y0 = spec.stacked ? base : 0, y1 = y0 + v;
        var r = mkEl("rect", { x: x, y: Math.min(y(y0), y(y1)), width: Math.max(1, barW - gap), height: Math.max(1, Math.abs(y(y1) - y(y0))), rx: 3, fill: s.color }, svg);
        h.marks.push(r); h.rows.push({ color: s.color, name: s.name || "", value: mkFmt(v, unit) }); h.top = Math.min(h.top, Math.min(y(y0), y(y1)));
        if (spec.stacked) base = y1; total += v;
        // The value sits on the bar; the tooltip goes above it, never over it.
        if (valued) { var vt = mkEl("text", { x: x + barW / 2, y: v >= 0 ? y(y1) - 5 : y(y1) + 13, "text-anchor": "middle", "class": "mk-value" }, svg); vt.textContent = mkFmt(v, unit); if (v >= 0) h.top = Math.min(h.top, y(y1) - 17); }
      });
      if (spec.stacked && h.rows.length > 1) h.rows.push({ name: "Total", value: mkFmt(total, unit) });
    });
    mkInteract(box, svg, hits, mkNearestPick(svg, hits.map(function (h) { return h.x; }), "x"), null);
  } else {
    var guide = mkEl("line", { y1: top, y2: top + plotH, stroke: "var(--muted)", "stroke-width": 1, "stroke-dasharray": "3 3" }, svg); guide.style.display = "none";
    series.forEach(function (s) {
      var segs = [], cur = [];
      labels.forEach(function (l, i) { var v = s.values[i]; if (typeof v === "number") cur.push([left + band * (i + 0.5), y(v), i, v]); else if (cur.length) { segs.push(cur); cur = []; } });
      if (cur.length) segs.push(cur);
      segs.forEach(function (pts) {
        var d = pts.map(function (p, k) { return (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
        if (type === "area") mkEl("path", { d: d + " L" + pts[pts.length - 1][0].toFixed(1) + " " + y(Math.max(lo, 0)) + " L" + pts[0][0].toFixed(1) + " " + y(Math.max(lo, 0)) + " Z", fill: s.color, "fill-opacity": 0.18, stroke: "none" }, svg);
        mkEl("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
        var r = pts.length > 40 ? 1.5 : 3;
        pts.forEach(function (p) { var c = mkEl("circle", { cx: p[0], cy: p[1], r: r, "data-r": r, fill: s.color, stroke: "var(--bg)", "stroke-width": 1 }, svg); var h = hits[p[2]]; h.dots.push(c); h.rows.push({ color: s.color, name: s.name || "", value: mkFmt(p[3], unit) }); h.top = Math.min(h.top, p[1]); });
      });
    });
    mkInteract(box, svg, hits, mkNearestPick(svg, hits.map(function (h) { return h.x; }), "x"), guide);
  }
}

function mkHBar(box, svg, series, labels, ticks, lo, hi, width, height, unit, stacked) {
  // The label column takes at most 40% of the width; labels wrap to two lines in it, and shorten only past that, so they never run into the bars.
  var colW = Math.max(40, width * 0.4 - 10), wraps = labels.map(function (l) { return mkWrap(l, colW); }), leftW = 0;
  wraps.forEach(function (w) { w.lines.forEach(function (line) { leftW = Math.max(leftW, mkTextWidth(line)); }); });
  var left = Math.ceil(leftW) + 10, right = 44, top = 4, bottom = 18, plotW = width - left - right, n = Math.max(1, labels.length), band = (height - top - bottom) / n;
  function x(v) { return left + (v - lo) / (hi - lo) * plotW; }
  // Tick labels that would touch are skipped, as on the vertical charts' label axis.
  var tickStep = mkLabelStep(ticks.map(function (t) { return mkFmt(t, unit); }), ticks.length > 1 ? x(ticks[1]) - x(ticks[0]) : plotW);
  ticks.forEach(function (t, k) { mkEl("line", { x1: x(t), x2: x(t), y1: top, y2: height - bottom, stroke: "var(--border)" }, svg); if (k % tickStep) return; var tx = mkEl("text", { x: x(t), y: height - 4, "text-anchor": "middle" }, svg); tx.textContent = mkFmt(t, unit); });
  var groups = stacked ? 1 : series.length, barH = mkBarSize(band, groups, 28), hits = [];
  labels.forEach(function (l, i) {
    var mid = top + band * (i + 0.5), yb = mid - barH * groups / 2, w = wraps[i];
    mkLabel(svg, w, left - 6, mid + 4 - (w.lines.length - 1) * 6.5, "end", l);
    var base = 0, total = 0, h = { x: x(0), top: yb, bottom: yb + barH * groups, title: String(l), rows: [], marks: [] };
    series.forEach(function (s, si) {
      var v = s.values[i]; if (typeof v !== "number") return;
      var x0 = stacked ? base : 0, x1 = x0 + v, yy = yb + (stacked ? 0 : barH * si);
      var r = mkEl("rect", { x: Math.min(x(x0), x(x1)), y: yy, width: Math.max(1, Math.abs(x(x1) - x(x0))), height: Math.max(1, barH - (stacked || groups === 1 ? 0 : 2)), rx: 3, fill: s.color }, svg);
      h.marks.push(r); h.rows.push({ color: s.color, name: s.name || "", value: mkFmt(v, unit) }); h.x = Math.max(h.x, (x(x0) + x(x1)) / 2);
      if (stacked) base = x1; total = stacked ? base : Math.max(total, v);
    });
    if (stacked && h.rows.length > 1) h.rows.push({ name: "Total", value: mkFmt(total, unit) });
    if (series.length === 1 || stacked) { var vt = mkEl("text", { x: x(total) + 4, y: mid + 4, "class": "mk-value" }, svg); vt.textContent = mkFmt(total, unit); }
    hits.push(h);
  });
  mkInteract(box, svg, hits, mkNearestPick(svg, labels.map(function (_, i) { return top + band * (i + 0.5); }), "y"), null);
}

function mkDonut(box, svg, s, labels, width, height, unit) {
  var values = s.values.map(function (v) { return typeof v === "number" && v > 0 ? v : 0; }), total = values.reduce(function (a, b) { return a + b; }, 0);
  var size = Math.min(height, width < 360 ? width : height), r = size / 2 - 4, cx = size / 2, cy = height / 2, inner = r * 0.62, a0 = -Math.PI / 2, hits = [];
  svg.setAttribute("width", size); svg.setAttribute("viewBox", "0 0 " + size + " " + height);
  box.style.display = "flex"; box.style.flexWrap = "wrap"; box.style.alignItems = "center"; box.style.gap = "16px";
  var legend = document.createElement("div"); legend.className = "mk-legend"; legend.style.flexDirection = "column"; legend.style.margin = "0";
  values.forEach(function (v, i) {
    // A share is added after the value, unless the values already are percentages.
    var l = labels[i] === undefined ? "Item " + (i + 1) : labels[i], pct = total ? Math.round(v / total * 100) : 0, share = unit === "%" ? "" : " (" + pct + "%)";
    var item = document.createElement("span"); var dot = document.createElement("i"); dot.style.background = mkColor(i); item.appendChild(dot); item.appendChild(document.createTextNode(mkTruncate(l, 28) + "  " + mkFmt(v, unit) + share)); legend.appendChild(item);
    if (!v) return;
    var a1 = a0 + v / total * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0, mid = (a0 + a1) / 2;
    var p = function (a, rr) { return (cx + rr * Math.cos(a)).toFixed(2) + " " + (cy + rr * Math.sin(a)).toFixed(2); };
    var d = v === total ? "M" + p(0, r) + " A" + r + " " + r + " 0 1 1 " + p(Math.PI, r) + " A" + r + " " + r + " 0 1 1 " + p(0, r) + " M" + p(0, inner) + " A" + inner + " " + inner + " 0 1 0 " + p(Math.PI, inner) + " A" + inner + " " + inner + " 0 1 0 " + p(0, inner) : "M" + p(a0, r) + " A" + r + " " + r + " 0 " + large + " 1 " + p(a1, r) + " L" + p(a1, inner) + " A" + inner + " " + inner + " 0 " + large + " 0 " + p(a0, inner) + " Z";
    var path = mkEl("path", { d: d, fill: mkColor(i), "fill-rule": "evenodd", stroke: "var(--bg)", "stroke-width": 2, "data-i": hits.length }, svg);
    var ry = cy + (r + inner) / 2 * Math.sin(mid);
    hits.push({ x: cx + (r + inner) / 2 * Math.cos(mid), top: ry, bottom: ry, title: String(l), rows: [{ color: mkColor(i), value: mkFmt(v, unit) + share }], marks: [path], legend: item });
    a0 = a1;
  });
  var mid = mkEl("text", { x: cx, y: cy + 5, "text-anchor": "middle", style: "font-size:15px;font-weight:600;fill:var(--fg)" }, svg); mid.textContent = mkFmt(total, unit);
  box.appendChild(legend);
  mkInteract(box, svg, hits, function (e) { var t = e.target, i = t && t.getAttribute ? t.getAttribute("data-i") : null; return i === null ? -1 : i * 1; }, null);
}

function mkSpark(svg, s, width, height) {
  var vals = s.values.filter(function (v) { return typeof v === "number"; }); if (!vals.length) return;
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi === lo) hi = lo + 1;
  var pts = vals.map(function (v, i) { return [2 + i / Math.max(1, vals.length - 1) * (width - 4), 2 + (1 - (v - lo) / (hi - lo)) * (height - 4)]; });
  var d = pts.map(function (p, k) { return (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
  mkEl("path", { d: d + " L" + pts[pts.length - 1][0].toFixed(1) + " " + height + " L2 " + height + " Z", fill: s.color, "fill-opacity": 0.15 }, svg);
  mkEl("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 1.5 }, svg);
}

function mkChart(target, spec) {
  var box = typeof target === "string" ? document.querySelector(target) : target;
  if (!box) throw new Error("Morphise.chart: no element " + target);
  box.classList.add("mk-chart");
  var current = spec, lastW = -1;
  function draw() { lastW = box.clientWidth; try { mkDraw(box, current); } catch (e) { box.textContent = "Chart error: " + e.message; throw e; } }
  box._mkRedraw = draw;
  draw();
  if (window.ResizeObserver) new ResizeObserver(function () { if (box.clientWidth !== lastW) draw(); }).observe(box);
  return { update: function (next) { current = next; draw(); } };
}

// A table scrolls sideways inside its own box, so a wide one never makes the page wider than the chat.
function mkFitTable(table) {
  for (var p = table.parentNode; p && p !== document.body; p = p.parentNode) if (p.classList && (p.classList.contains("scroll") || p.classList.contains("mk-table"))) return;
  var wrap = document.createElement("div"); wrap.className = "mk-table"; table.parentNode.insertBefore(wrap, table); wrap.appendChild(table);
}

function mkSortable(table) {
  var head = table.tHead && table.tHead.rows[0]; if (!head || table._mkSortable) return;
  table._mkSortable = true; mkFitTable(table);
  var filter = table.getAttribute("data-filter");
  if (filter !== null) {
    var input = document.createElement("input"); input.className = "mk-filter"; input.type = "search"; input.placeholder = filter || "Filter"; input.setAttribute("aria-label", filter || "Filter rows");
    input.addEventListener("input", function () { var q = input.value.toLowerCase(); Array.prototype.forEach.call(table.tBodies[0] ? table.tBodies[0].rows : [], function (row) { row.style.display = row.textContent.toLowerCase().indexOf(q) >= 0 ? "" : "none"; }); });
    var box = table.parentNode.classList.contains("mk-table") ? table.parentNode : table; box.parentNode.insertBefore(input, box);
  }
  Array.prototype.forEach.call(head.cells, function (th, col) {
    th.tabIndex = 0;
    th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); th.click(); } });
    th.addEventListener("click", function () {
      var body = table.tBodies[0]; if (!body) return;
      var dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
      Array.prototype.forEach.call(head.cells, function (c) { c.removeAttribute("aria-sort"); });
      th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
      var rows = Array.prototype.slice.call(body.rows);
      rows.sort(function (a, b) {
        var x = a.cells[col] ? a.cells[col].textContent.trim() : "", y = b.cells[col] ? b.cells[col].textContent.trim() : "", nx = mkParseNumber(x), ny = mkParseNumber(y);
        return (nx !== null && ny !== null ? nx - ny : x.localeCompare(y)) * dir;
      });
      rows.forEach(function (r) { body.appendChild(r); });
    });
  });
}

// A gallery picture opens larger over its gallery (never making the page taller), with its caption; a click or Escape closes it.
function mkZoom(img) {
  var gallery = img.closest(".gallery"); if (!gallery) return;
  var old = gallery.querySelector(".mk-zoom"); if (old) old.remove();
  var zoom = document.createElement("div"); zoom.className = "mk-zoom"; zoom.setAttribute("role", "dialog"); zoom.setAttribute("aria-label", img.alt || "Picture"); zoom.tabIndex = -1;
  var big = document.createElement("img"); big.src = img.currentSrc || img.src; big.alt = img.alt || ""; zoom.appendChild(big);
  var cap = img.closest("figure") && img.closest("figure").querySelector("figcaption");
  if (cap) { var c = document.createElement("div"); c.className = "small muted"; c.textContent = cap.textContent; zoom.appendChild(c); }
  function close() { zoom.remove(); try { img.focus(); } catch (e) {} }
  zoom.addEventListener("click", close);
  zoom.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
  gallery.appendChild(zoom); zoom.focus();
}

// The page's own hints: any element with data-tip shows it in the shared tooltip on hover, keyboard focus or tap.
function mkTipFor(el) { return el && el.closest ? el.closest("[data-tip]") : null; }
document.addEventListener("pointerover", function (e) { var el = mkTipFor(e.target); if (el && e.pointerType === "mouse") mkShowTip(el, el.getBoundingClientRect(), "", [{ value: el.getAttribute("data-tip") }]); });
document.addEventListener("pointerout", function (e) { var el = mkTipFor(e.target); if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) mkHideTip(el); });
document.addEventListener("pointerdown", function (e) { var el = mkTipFor(e.target); if (el && e.pointerType !== "mouse") mkShowTip(el, el.getBoundingClientRect(), "", [{ value: el.getAttribute("data-tip") }]); else if (!el && mkTipOwner && mkTipOwner.getAttribute && mkTipOwner.hasAttribute("data-tip")) mkHideTip(); });
document.addEventListener("focusin", function (e) { var el = mkTipFor(e.target); if (el) mkShowTip(el, el.getBoundingClientRect(), "", [{ value: el.getAttribute("data-tip") }]); });
document.addEventListener("focusout", function (e) { var el = mkTipFor(e.target); if (el) mkHideTip(el); });
document.addEventListener("click", function (e) { var img = e.target && e.target.closest && e.target.closest(".gallery img"); if (img && !img.closest(".mk-zoom")) mkZoom(img); });
document.addEventListener("keydown", function (e) { var img = e.target && e.target.closest && e.target.closest(".gallery img"); if (img && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); mkZoom(img); } });

// The page's largest SVG (the chart, not an icon), with its computed colours and fonts inlined.
function mkExportSvg() {
  var svg = null, best = 0;
  Array.prototype.forEach.call(document.querySelectorAll("svg"), function (candidate) { var r = candidate.getBoundingClientRect(), area = r.width * r.height; if (area > best) { best = area; svg = candidate; } });
  if (!svg) return null;
  var copy = svg.cloneNode(true), live = svg.querySelectorAll("*"), cloned = copy.querySelectorAll("*");
  function inline(src, dst) { var cs = getComputedStyle(src); ["fill", "stroke", "color", "stop-color", "font-family", "font-size", "font-weight", "opacity", "fill-opacity", "stroke-width"].forEach(function (p) { var v = cs.getPropertyValue(p); if (v) dst.style.setProperty(p, v); }); }
  inline(svg, copy); for (var i = 0; i < live.length; i++) inline(live[i], cloned[i]);
  copy.setAttribute("xmlns", NS);
  return new XMLSerializer().serializeToString(copy);
}

window.Morphise = {
  version: ${KIT_VERSION},
  chart: mkChart,
  sortable: mkSortable,
  tip: function (el, text) { if (el && el.setAttribute) el.setAttribute("data-tip", String(text)); },
  ask: function (text) { if (parent === window) return; parent.postMessage({ type: "cp-html-ask", text: String(text).slice(0, 2000) }, "*"); }
};
addEventListener("message", function (e) { var d = e.data; if (e.source === parent && d && d.type === "cp-html-export-svg") parent.postMessage({ type: "cp-html-svg", id: d.id, svg: mkExportSvg() }, "*"); });
document.addEventListener("DOMContentLoaded", function () {
  Array.prototype.forEach.call(document.querySelectorAll("table.sortable"), mkSortable);
  Array.prototype.forEach.call(document.querySelectorAll("table"), mkFitTable);
  Array.prototype.forEach.call(document.querySelectorAll(".gallery img"), function (img) { img.tabIndex = 0; img.setAttribute("role", "button"); });
});
`;

/** The script every page runs before its own: the maths, then the helpers and listeners. */
export const KIT_SCRIPT = `(function(){${KIT_MATH}${DOM}})();`;
