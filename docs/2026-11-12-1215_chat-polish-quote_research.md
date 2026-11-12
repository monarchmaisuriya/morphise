# Every Chat Polish and Quote feature, against Morphise 0.15.1

- Date: 2026-11-12 12:15
- Status: presented
- Mode: find out
- Repos: morphise   Folders: client, shared, server
- Question / problem: Which features of Chat Polish (lthieu96/chat-polish) and Quote (keefeere/quote) does Morphise lack, and how can each be brought in?

## Research: what Morphise must add to have every Chat Polish and Quote feature

- **Bottom line:** Chat Polish has 41 features; Morphise 0.15 covers 13 of them, partly covers 6, and lacks 22. Quote has 5 features (a selection bar with Quote, Reply, Side chat, Copy, plus its keys); Morphise has none. Both are MIT, so their code can be ported with their copyright notices. Confidence: high (both repositories read at their registry-pinned commits).
- **Where we are:** feeds the 0.16.0 plan. M decided (2026-11-12): HTML pages included, off by default, with the optional headless Chrome; Pele, icon sets and sharp included, each opt-in; port with attribution; skip anything that writes Paseo's private settings or loads Paseo's internal modules.
- **Need from M:** nothing for the research; the plan asks for sign-off.

### Sources read

- Chat Polish at `6b52cc2528426812c78ec8d2b547ffb8d158e542` (registry pin, 2026-11-11), about 12,900 lines: `README.md`, `shared/timeline.ts` (every preference), `shared/theme.ts`, `index.client.tsx`, `index.server.ts`, and the header of every module in `client/`, `client/web/`, `server/`. [verified: local clone]
- Quote at `f6484cb4047b7393d12e86b512d897ff548c4f76` (registry entry `plugins/keefeere/quote.json`), 1,383 lines: `README.md`, `client/web.ts` (host DOM contract), `client/actions.ts`. [verified: local clone; `gh api repos/getpaseo/plugins/contents/plugins/keefeere/quote.json`]
- Paseo publishing docs, dependencies: runtime npm dependencies need a committed lock and `"build": [["npm", "ci", "--omit=dev", "--ignore-scripts"]]` in `paseo-plugin.json`. [verified: https://paseo.sh/docs/plugins/publishing.md lines 191-203]
- Licences: Chat Polish MIT, Copyright (c) 2026 Hieu Le; Quote MIT, Copyright (c) 2026 Chechulin Serhii. Untitled UI icons are under their own licence and are downloaded at run time, never stored in the repo. [verified: each `LICENSE`, Chat Polish `README.md` License]

### Chat Polish, feature by feature

Key: HAVE = in Morphise 0.15; PART = partly; MISSING; SKIP = M chose to skip.

| # | Feature (Chat Polish source) | Morphise 0.15 | Note |
| --- | --- | --- | --- |
| 1 | Tool calls as single rows: icon, state verb (Running, Ran), command or file, detail; open for diff, output or raw input/output (`client/views.tsx`) | HAVE (own design) | M finds Morphise's design not good enough; Chat Polish's design is the reference |
| 2 | Tool details start collapsed / failed only / expanded (`toolDetails`) | PART | Morphise has fold rules but no "failed only" |
| 3 | Command colours when expanded / always (`commandColors`) | PART | Morphise: on/off |
| 4 | Wrap diff lines (`diffWrap`) | HAVE | |
| 5 | Hide completed reads, searches, fetches, tasks, todo updates (`hidden`) | HAVE | |
| 6 | Thinking start: Paseo / collapsed / expanded (`reasoning`) | HAVE | |
| 7 | Row strength dim / faded / soft / full (`steps`) | HAVE | |
| 8 | Leading icon per row kind: merged, tool, thought (`rowIcons`) | PART | Morphise: one global labels choice |
| 9 | Merged steps: thoughts and calls between replies fold into one row, "Edited 1 file and ran 1 command" (`client/steps.ts`, `merge`) | MISSING | Uses transformers plus `timeline.refetch`; removed items return `{items: []}` |
| 10 | Todo updates as their own rows, folded into merged rows (`todo` transformer) | PART | Morphise has the steps card |
| 11 | Plan rows (`plan` transformer, PlanItem) | MISSING | Morphise leaves plans to Paseo |
| 12 | Error and compaction notices (`notice`) | HAVE | |
| 13 | Image-only replies as thumbnails small / large / extra large (`images`, `server/image.ts` with sharp) | MISSING | sharp, opt-in |
| 14 | Image stacks in replies, open on hover or click, own viewer (`image-stacks.ts`, `stack-viewer.ts`) | MISSING | Paseo's internal lightbox is SKIP; Chat Polish's own viewer is used |
| 15 | Turn recap (`server/turn.ts`, `shared/recap.ts`) | HAVE | |
| 16 | Phones: leave rows to Paseo (`phoneChat`) | HAVE | |
| 17 | Clamp long prompts (`userMessages`) | HAVE (web) | |
| 18 | Selection popup "Copy Text Markdown" (`selection-copy.ts`) | MISSING | Merged into Quote's selection bar |
| 19 | Spacing compact / normal / spacious, for Paseo's items too (`density`) | PART | Morphise: its own rows only |
| 20 | Restyle Paseo's own items: tool groups, bubbles, composer, cards, popovers, markdown (`restyle-css.ts`, 552 lines; `parts.ts`, `selectors.ts`, `css-guard.ts`) | MISSING | Web, page structure, experimental |
| 21 | Window chrome flat / floating, quieter sidebars, header, tabs, Explorer (`window.ts`) | MISSING | Web, experimental |
| 22 | Sidebar colour from the theme (`sidebar.ts`) | MISSING | Web |
| 23 | Rich text variants for quotes, tables, code, inline code, headings, lists, callouts, rules; callouts from `> [!NOTE]`, task lists, line numbers (`rich-text.ts`) | MISSING | Web, experimental |
| 24 | Diagrams: Paseo's mermaid in theme colours, or Pele; redraw button (`mermaid.ts`, `server/diagram.ts`) | MISSING | pele, opt-in |
| 25 | HTML pages: `html_render` / `html_preview` tools for new agents, local server, layout check in headless Chrome (`server/html.ts`, `server/page-check.ts`, `server/headless-shell.ts`, `client/html*.ts`) | MISSING | Opt-in; Chrome download is its own button |
| 26 | Working indicator: dots, sparkle, spokes, dot ring, orb, matrix, snake; three sizes (`loader`) | MISSING | Web CSS |
| 27 | Icon sets: Lucide, Untitled UI, Hugeicons (`server/icons.ts`, `web/icons.ts`) | MISSING | Downloaded from npm on first pick, hash-pinned |
| 28 | Themes: Mariana, Ivory, Parchment, Dusk, editor with contrast checks, syntax theme (`shared/theme.ts`, dashboard theme editor) | PART | Morphise contributes a theme with four other presets; no contrast check, no syntax theme |
| 29 | Syntax highlighting of commands, diffs and JSON (`client/highlight.ts`, 133 lines, regex based) | MISSING | No dependency |
| 30 | Jump between prompts with ⌥⌘↑/↓ and keep a pinned chat at the bottom while a row opens (`web/prompts.ts`) | PART | Morphise: Command Center items only |
| 31 | Command Center toggles and Copy last turn | HAVE | |
| 32 | Model picker: provider rail, model counts, default thinking levels (`web/model-picker.ts`) | MISSING | Web DOM, experimental |
| 33 | Context card: percent bar, Compact button, steady height (`web/context-card.ts`) | MISSING | Web DOM, experimental |
| 34 | Hover cards glide between sidebar rows (`web/hover-cards.ts`) | MISSING | Web DOM, experimental |
| 35 | Button text centred for fonts that sit low (`web/control-font.ts`) | MISSING | Web |
| 36 | Plugin card shapes and hover transitions on web (`web/plugin-views.ts`) | MISSING | Web |
| 37 | English and Chinese, following Paseo's language (`client/i18n.ts`, `shared/i18n.ts`) | MISSING | Chat rows and selection bar; settings screens stay English (see gaps) |
| 38 | Live-preview dashboard | HAVE | Settings tabs with previews |
| 39 | Update available and Update button (`server/update.ts`, runs `paseo plugin update`) | MISSING | Paseo's Settings, Plugins also updates |
| 40 | Fonts and sizes, app theme picker, reasoning expansion written into Paseo's own settings (`web/host.ts`) | SKIP | M: no writes to Paseo's private settings |
| 41 | Paseo's own image viewer loaded from its bundle (`web/lightbox.ts`, `web/app-script.ts`) | SKIP | M: no internal modules |

### Quote, feature by feature

| # | Feature (Quote source) | Morphise 0.15 |
| --- | --- | --- |
| Q1 | Selection bar above text selected in a chat, in a shadow root (`client/web.ts`) | MISSING |
| Q2 | Quote: the selection into this chat's message box as `> quote`, cursor below; lands in the chat it came from across tabs and split panes | MISSING |
| Q3 | Reply: a field at the selection; Enter sends quote plus reply, Ctrl/⌘+Enter adds to the message box; follows Default send while running (`client/actions.ts`) | MISSING |
| Q4 | Side chat: a sub-agent with the same provider, model, mode and thinking, in a right-hand panel, Open as tab (`client/side-chat-panel.tsx`) | MISSING |
| Q5 | Copy as Markdown: lists, tables, emphasis, fences survive (`client/format.ts`) | MISSING |
| New | Bookmark the selection (M's request) | MISSING; Morphise has a bookmark store (`client/bookmark-store.ts`) to write to |

### What this means for our code

- Morphise keeps one source of truth for settings, the profile's `chat` object (`shared/profile.ts`). Chat Polish's preference names map onto it; the ported code reads them through one adapter. [inferred: Chat Polish reads prefs only through `client/prefs.ts`]
- Chat Polish reads Paseo's "Chat display" setting to decide between its rows and Paseo's grouped calls (`readHostAppearance` in `web/host.ts`). That is a read, not a write, so it stays; the writes in the same file are left out. [verified: `index.client.tsx` `detailed()`]
- New daemon capabilities, each off until turned on: npm dependencies `pele` and `sharp`; network downloads (icon sets from npm, headless Chrome); a local web server on 127.0.0.1; an `agent.create` hook that adds MCP tools; a `paseo plugin` subprocess for updates. The registry PR must list each.

### Confidence and gaps

| Claim | Tag | Source tier | What would raise confidence |
| --- | --- | --- | --- |
| Feature list is complete | verified | Primary (source) | n/a |
| Git installs get npm dependencies through the manifest `build` command | verified | Primary (docs) | A clean-copy install with the dependencies |
| sharp loads in the macOS app with `--ignore-scripts` | unverified | Chat Polish comment says it falls back to WebAssembly | Install and read an image on the test daemon |
| Chat Polish's page restyle works on Paseo 0.16 beta | unverified | Written for 0.11 to 0.15 | Live check on the 0.16 beta test daemon |
| Chinese strings cover Morphise's own settings | disproved | `shared/i18n.ts` covers only Chat Polish's strings | Translating Morphise's settings is separate work |

### Sources

- Chat Polish: https://github.com/lthieu96/paseo-chat-polish/tree/6b52cc2528426812c78ec8d2b547ffb8d158e542
- Quote: https://github.com/keefeere/paseo-quote/tree/f6484cb4047b7393d12e86b512d897ff548c4f76
- Paseo plugin publishing: https://paseo.sh/docs/plugins/publishing.md
- Registry listings: https://paseo.sh/plugins/lthieu96/chat-polish, https://paseo.sh/plugins/keefeere/quote

## Standardized review

- **Typed bottom line:** usable for planning; 0 blocking, 2 must-verify, 1 note.
- **Coverage:** question and decision fit (pass: feeds the 0.16 plan); method (pass: full source read at pinned commits); source quality (pass: primary only); traceability (pass: file per row); uncertainty stated (pass); recommendation proportional (n/a: find-out mode).
- **must-verify:** sharp under `--ignore-scripts` in the macOS app (check in build, Part 6). Chat Polish's restyle on the 0.16 beta (check in build, Part 4).
- **note:** Chinese covers only the ported chat strings; Morphise's own settings stay English.
