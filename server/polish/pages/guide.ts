// The html_guide tool's answers: the detailed rules for one kind of page, read by the agent only when it draws one, so
// the instructions every chat carries stay short (as Claude's own visuals load a module per kind). The helpers they
// describe are in shared/polish/page-kit.ts.

export const GUIDE_TOPICS = ["charts", "tables", "diagrams", "images", "interactive", "mockups", "explainers"] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const CHARTS = `# Charts
Use the built-in helper instead of drawing axes yourself: it sizes to the page, uses the theme's series colours, spaces labels so they never overlap, and keeps a fixed height.

  <div id="sales"></div>
  <script>
    Morphise.chart("#sales", {
      type: "bar",                 // "bar" | "line" | "area" | "donut" | "sparkline"
      labels: ["Jan", "Feb", "Mar"],
      series: [{ name: "2025", values: [12, 18, 9] }, { name: "2026", values: [15, 21, 14] }],
      unit: "k",                   // optional: shown after values
      height: 240,                 // optional; default 240 (sparkline 48)
      stacked: false,              // bar only
      horizontal: false            // bar only: bars run left to right, for long labels
    });
  </script>

- One chart per element. Up to 6 series; a donut takes one series, one value per label.
- Built in, nothing to add: a tooltip with every series' value on hover, tap and the arrow keys; the hovered mark lit and the rest dimmed; legend items that hide and show a series; labels that wrap to two lines; values on single-series bars.
- Values are numbers; leave a gap with null. Keep labels under about 24 characters: longer ones wrap, and past two lines they are shortened (the tooltip still shows them whole).
- Put the title and a one-line takeaway in HTML above the chart (h2, p.muted), not inside it.
- Several charts: a .grid of .card elements, each with an h3 and its chart.
- A KPI row: a .grid of .stat tiles, each a .label then a .value (no .num on them; a .stat is already a tile, so don't wrap it in a .card), with a sparkline under each value if a trend matters. Give each value its context in the label ("Refund rate, last 30 days"), not a bare number.
- Morphise.chart(...) returns { update(spec) } to redraw with new data (a slider or a select), without changing the height.`;

const TABLES = `# Tables
Plain <table> is already styled (numbers right-aligned with td.num). Add class "sortable" to sort by any column with a click, and data-filter to add a filter box above it:

  <table class="sortable" data-filter="Filter rows">
    <thead><tr><th>Store</th><th class="num">Orders</th><th class="num">Revenue</th></tr></thead>
    <tbody><tr><td>North</td><td class="num">120</td><td class="num">$4,200</td></tr></tbody>
  </table>

- Numbers sort as numbers ($, %, commas and k/M suffixes are understood).
- A table wider than the chat scrolls sideways in its own box on its own; rows highlight on hover; sortable headers also sort with Enter or Space.
- Over about 15 rows, wrap the table in <div class="scroll" style="max-height:360px"> so the page height stays fixed.
- A table your script adds after the page loads: call Morphise.sortable(table) on it.
- For a small comparison (2 to 4 items), cards in a .grid read better than a table.`;

const DIAGRAMS = `# Diagrams
- Flowcharts, sequence, state, class and ER diagrams: write a \`\`\`mermaid block in your reply instead of a page. The chat draws and lays it out.
- Draw an SVG page only for what mermaid can't do (a custom layout, an annotated picture). Then compute every position in your script from the data, never hand-pick coordinates; give each item its own row (20px per text line plus 12px); keep 8px between labels; size the viewBox from the rows; split long labels with <tspan>.`;

const IMAGES = `# Images
- Local images (screenshots, generated images) inside your working folder: write their absolute paths, as in <img src="/abs/shot.png">. PNG, JPEG, GIF or WebP up to 12 MB. Nothing outside the folder shows.
- Several images: a gallery, each with a caption:

  <div class="gallery">
    <figure><img src="/abs/a.png" alt="Before"><figcaption>Before</figcaption></figure>
    <figure><img src="/abs/b.png" alt="After"><figcaption>After</figcaption></figure>
  </div>

- Before and after: two figures in a gallery, same size. Always set alt text.
- A gallery picture opens larger over its gallery on click or Enter (with its caption), and closes on click or Escape; nothing to add.`;

const INTERACTIVE = `# Interactive pages
- Controls (sliders, selects, buttons) go in a .row above or below the content, in HTML. Readouts are single lines with tabular numbers.
- Nothing may change the page's height: reserve space for every state (fixed or min-height areas).
- Hints: give any element data-tip="what it means" (an abbreviation, an icon button, a number's definition); it shows in the page's themed tooltip on hover, focus and tap. Don't use the title attribute for this.
- Secondary detail (method, sources, raw numbers) goes in <details><summary>…</summary>…</details>, which is styled and opens in place; open it by default only if the reader needs it first.
- Morphise.ask("text") puts a follow-up into the user's message box when they click something; it never sends. Call it only from a click handler, with a short question the user would ask next, e.g. a button "Drill into Q3" → Morphise.ask("Break Q3 down by week"). It does nothing in a downloaded page.
- Anything that plays (an explainer, a simulation, an algorithm in motion): use Morphise.player (html_guide "explainers"), which gives play, pause, step, scrub and speed controls, keeps the height fixed and pauses off screen. Don't build your own play buttons or animation loop.
- Charts that follow a control: keep the object Morphise.chart returns and call its update(spec).`;

const MOCKUPS = `# Mock-ups
- Build from the kit: .stack, .row, .grid, .card, .stat (.label, .value), .chip, .muted, .small; buttons (.primary for the main action), inputs, selects and tables are styled.
- Use the theme variables only (--fg, --muted, --bg, --surface, --border, --accent, --accent-fg, --success, --warning, --danger, --chart-1..6), so the mock-up follows light and dark themes.
- Keep it to what the question needs: one screen, real-looking but short text, no lorem ipsum.
- Readable at a glance: headings in order (h2 under h1, h3 under h2); numbered section labels only for real steps; related things close and groups apart; text kept off box edges (a .card or .stat already pads it); no one-word last lines in headings (the kit balances them).`;

const EXPLAINERS = `# Explainers (animations you can play)
Show how something works over time as scenes the reader plays, pauses, steps and scrubs. The built-in player gives the controls, captions, keyboard, a fixed height and pausing off screen; you only draw each scene.

  <div id="how"></div>
  <script>
    var boxes = {};
    Morphise.player("#how", {
      height: 280,                       // stage height in px (160 to 640); the page never grows
      setup: function (stage) {          // once: build what the scenes move
        ["Client", "Server"].forEach(function (name) {
          var b = document.createElement("div"); b.className = "chip"; b.textContent = name;
          b.style.position = "absolute"; b.style.top = "45%"; stage.el.appendChild(b); boxes[name] = b;
        });
      },
      scenes: [
        { caption: "The client and the server are idle.", draw: function (stage, p) {
            boxes.Client.style.left = stage.width * 0.1 + "px"; boxes.Server.style.left = stage.width * 0.7 + "px"; } },
        { caption: "The client sends a request.", duration: 2000, draw: function (stage, p) {
            var svg = stage.svg(), line = svg.querySelector("line") || svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "line"));
            var y = stage.height * 0.65, x0 = stage.width * 0.15, x1 = stage.width * 0.72;
            line.setAttribute("stroke", "var(--chart-1)"); line.setAttribute("stroke-width", 3);
            line.setAttribute("x1", x0); line.setAttribute("y1", y); line.setAttribute("y2", y);
            line.setAttribute("x2", stage.lerp(x0, x1, stage.ease(p)));
            line.style.display = p > 0 ? "" : "none"; } }
      ]
    });
  </script>

The drawing rule, which makes stepping and scrubbing work: every frame, each scene's draw(stage, p) is called in order, earlier scenes with p = 1, the current one with its progress, later ones with p = 0. So:
- p = 0 means your scene's change is not applied, p = 1 fully applied. Set the state for p (position, opacity, display), never add to what is there, and hide what your scene adds when p = 0.
- Build elements in setup, or once and reuse them (as the line above). stage.canvas() is cleared before every frame, so a canvas scene redraws all of its picture each time.
- Compute positions from stage.width and stage.height; they change with the chat's width.

stage gives: el (the stage box; add your own elements), width, height, svg() (one SVG over the stage), canvas() (a 2D context, sharp on any screen), ease(p) and lerp(a, b, p).

Scenes:
- 3 to 8 scenes, one idea each, in the order things happen. The first scene already shows the setting; nothing starts empty.
- A caption per scene, under about 100 characters, saying what changes ("The server asks the database"), not "Step 3".
- duration in ms (default 2500); give a busy scene more time.
- Use the theme variables (--fg, --muted, --border, --chart-1 to --chart-6) so it follows light and dark themes. No sound.
- Canvas for many moving things (particles, a simulation); SVG or plain elements for a few labelled ones.

Options: autoplay: true starts it when it first comes into view (never for readers who prefer less motion); loop: true starts over at the end. The returned object has play(), pause() and go(sceneIndex).
Interaction: for a game-like explainer, add your own click or key listeners to stage.el (keys work while the player has focus).`;

export const GUIDES: Record<GuideTopic, string> = { charts: CHARTS, tables: TABLES, diagrams: DIAGRAMS, images: IMAGES, interactive: INTERACTIVE, mockups: MOCKUPS, explainers: EXPLAINERS };

export function guideText(topic: unknown): { text: string; known: boolean } {
  const known = typeof topic === "string" && (GUIDE_TOPICS as readonly string[]).includes(topic);
  return known ? { text: GUIDES[topic as GuideTopic], known } : { text: `Pick a topic: ${GUIDE_TOPICS.join(", ")}.`, known: false };
}
