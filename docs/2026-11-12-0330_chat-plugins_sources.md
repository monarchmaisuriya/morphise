# Chat-customising Paseo plugins: what they do and how

Research date: 2026-11-12. Purpose: list the features of four published Paseo chat plugins, and the Paseo plugin API each feature uses, so Morphise can re-build them (not copy them).

## How to read this file

- Every repository was cloned at the exact commit the Paseo registry pins, and read in this session. File references below are paths inside that clone, for example `index.client.tsx:53`.
- **Supported API** means the feature uses only calls documented in the Paseo plugin reference (`ref.md`, downloaded from https://paseo.sh/docs/plugins/reference.md).
- **Style layer only (web, fragile)** means the feature works by injecting CSS or reading/writing Paseo's DOM, `data-testid` attributes, or Paseo's private `localStorage` record. It runs only on desktop and web (there is no DOM on iOS or Android), and a Paseo update can break it without notice.
- **Private API** means the feature calls something the reference does not document (Paseo internal modules, private storage, the Paseo CLI).
- "RN renderer" means a React Native timeline renderer registered with `addTimelineRenderer`. These run on every platform (desktop, web, iOS, Android).

### Family tree (important for licensing and for "re-build, not copy")

```
ABorakati/beautiful-chat (MIT, 2026-09)
   |
   +-- forked at 42b61d8 --> RoundRedDot/better-paseo (MIT, keeps ABorakati copyright)
   |
   +-- forked at 42b61d8 --> GenoDevelop/paseo-refined-chat (MIT, keeps ABorakati copyright)

lthieu96/paseo-chat-polish (MIT, Hieu Le) -- independent code base
```

Evidence: `better-paseo/README.md:31` ("a fork of ABorakati/beautiful-chat, continued from 42b61d8"), `paseo-refined-chat/NOTICE.md:1-12`, and both forks' `LICENSE` start with "Copyright (c) 2026 ABorakati".

### What could not be reached or was not checked

| Item | What happened |
| --- | --- |
| Source links on the paseo.sh registry pages | Not present in the server-rendered HTML (the "Source" link is drawn by script). The repository URLs were taken from the registry's own JSON entries in the local clone of `getpaseo/plugins` (`plugins/<owner>/<id>.json`). |
| `github.com/lthieu96/chat-polish`, `github.com/genodevelop/refined-chat` | These names do not exist. The real repositories are `lthieu96/paseo-chat-polish` and `GenoDevelop/paseo-refined-chat` (registry JSON `repository.url`). |
| Running any plugin | Not done (task said do not install). Behaviour is from source and READMEs only. |
| GitHub licence detection | `gh repo view --json licenseInfo` returned empty for all four; licences were read from each `LICENSE` file instead. |

---

## 1. Beautiful Chat (aborakati/beautiful-chat)

- Registry: https://paseo.sh/plugins/aborakati/beautiful-chat (1.6k installs, pinned commit `42b61d8301b5`).
- Source: https://github.com/ABorakati/beautiful-chat
- Licence: **MIT**, Copyright (c) 2026 ABorakati (`LICENSE`).
- Requires: **Paseo >= 0.8.0** (`paseo-plugin.json`). Built against `@getpaseo/plugin` 0.8.0 (`package.json`).
- Storage of preferences: browser `localStorage` key `paseo/beautiful-chat/preferences/v1` (`client/preferences.ts:52`). On iOS/Android there is no `localStorage`, so defaults always apply there.
- Server side (`index.server.ts`): three RPCs (remote procedure calls from client to daemon) - `highlight.tokens` (Shiki syntax highlighting on the daemon), `file.image` (reads image bytes, max 3 MB), `file.reveal` (opens the OS file manager).
- Designed around Oh My Pi (OMP) tool names, but intercepts every agent's timeline.

### Features

| Feature | Options (default) | API used | Platforms | Fragile? |
| --- | --- | --- | --- | --- |
| Typed tool-call cards (shell/git terminal frame with exit code and duration, read with language logo and line numbers, edit diff, MCP, eval, ask, task/subagent, hub, Paseo tools, GitHub) | none | `addTimelineTransformer({itemType:"tool_call"})` + `addTimelineRenderer` (`index.client.tsx:50-86`) | All (RN renderer) | No. Tool recognition is by tool name inside `transform`, which the reference recommends. |
| Completed tools collapse, running/failed stay open | fixed | inside renderer (`client/live-renderers.tsx:599`) | All | No |
| Reasoning trace: collapsible, step rail, per-step duration, token total | none | transformer `reasoning` + renderer | All | No |
| Checklist (todo) card: phase, per-task status, durations, blocked reason | none | transformer `todo` + renderer | All | No |
| Error notice card | none | transformer `error` + renderer | All | No |
| Prompt bubble with copy button and turn token usage | Enhanced prompt bubble (on) | transformer `user_message` + renderer; usage via `useAgent` (live only) | All | Partly: sets `dataSet={{historyRowId}}` so Paseo's chat outline can scroll to it (`client/components/prompt-anchor.ts`), a host DOM convention. |
| Plugin Markdown for assistant replies | Assistant markdown (on); Markdown style: document / compact / terminal (document) | transformer `assistant_message` + own Markdown parser (`client/components/markdown/`) | All | No, but it is a subset of Paseo's Markdown (no mermaid, no host file links). |
| Syntax highlighting (Shiki on daemon) | none | `defineRpc` + `server.handle` + `useRpc` | All | No |
| Image read preview (thumbnail, size, hide toggle) | none | RPC `file.image` | All | No |
| Click file name to reveal in Finder/Explorer | none | RPC `file.reveal` (daemon runs `open -R` / `explorer.exe` / `xdg-open`) | Desktop (daemon machine) | No |
| Accent colour | host / jade / violet / amber / rose (host) | renderer styles from `theme` + preset hex | All | No |
| Interface font | Inter (embedded) / system (Inter) | injected `@font-face` `<style>` + `data-pmono` escape (`client/components/embed-fonts.ts`, `host-font-escape.ts`) | Web only for Inter | Yes: relies on Paseo's `data-pmono` attribute and its font cascade. |
| Code glyphs | Iosevka with ligatures / plain (ligatures) | same injected font | Web | Yes (as above) |
| Frosted glass | on/off (on) | injected `<style>` with `backdrop-filter` on `[data-ompfrost]` (`client/components/frosted.ts`) | Web | Yes: CSS injection |
| Pointer glow on cards | on/off (on) | injected `<style>` + `document` mouse listeners (`client/components/glow.ts`) | Web | Yes |
| Shimmer on running rows | fixed | injected `<style>` (`client/components/shimmer.ts`) | Web | Yes |
| Restyle Paseo's own background-job notice row | fixed | scans `document.styleSheets` for Paseo's atomic class with a hard-coded rgba, then injects border/radius (`client/components/host-notice.ts:35`) | Web | **Very fragile**: depends on React Native Web's generated class names and Paseo's literal colours. |
| Own find bar on Ctrl/Cmd+F | fixed (active when plugin draws prompts/replies) | window keydown listener + DOM search inside `[data-testid="agent-chat-scroll"]` (`client/components/chat-find.ts:7`) | Web | Yes: Paseo test id |
| Selection toolbar: Copy / Add to chat | Selection actions (on) | `window.getSelection`, writes into `[data-composer-input]` (`client/components/selection-actions.ts:49`) | Web | Yes: Paseo DOM attribute; writes into the host composer |
| Settings page | all of the above | `addSettingsScreen` | All | No |

---

## 2. Refined Chat (genodevelop/refined-chat)

- Registry: https://paseo.sh/plugins/genodevelop/refined-chat (16 installs, pinned commit `088d860fecb5`).
- Source: https://github.com/GenoDevelop/paseo-refined-chat
- Licence: **MIT**, Copyright ABorakati + GenoDevelop and contributors + Moyf (`LICENSE`). Embedded fonts are SIL OFL 1.1 (`README.md`, Credits).
- Requires: **Paseo >= 0.11.0** per manifest. But the file preview panel uses `addWorkspacePanel` + `openPanel`, which the README itself says arrived in 0.14.0 (`README.md`, limitation 1). Built against `@getpaseo/plugin` 0.14.0. [unverified: whether the plugin loads on 0.11-0.13; check by installing on a 0.11 host.]
- A fork of Beautiful Chat: same transformers (`omp-*` kinds), same three RPCs plus `file.read` and `file.kind`, and everything in section 1 except where noted.
- Preferences: browser `localStorage` key `paseo/refined-chat/preferences/v1` (`client/preferences.ts:186`), so per-client and absent on iOS/Android.

### Features (only those added or changed vs Beautiful Chat)

| Feature | Options (default) | API used | Platforms | Fragile? |
| --- | --- | --- | --- | --- |
| Three text sizes | Assistant replies, Tool cards, Code and terminal: 50-300 %, decimals allowed (100 %) | renderer style maths | All | No (applies only to plugin-drawn rows) |
| Reply line spacing | 80-200 % (100 %) | renderer style | All | No |
| Custom accent colour | off = Paseo theme; on = palette Rose/Orange/Yellow/Green/Sky/Violet or Custom hex (off; custom default `#6366f1`) | renderer style | All | No |
| Colour bold text | off / palette / custom hex (off; custom `#e64980`) | own Markdown renderer | All | No |
| Highlight marks `==text==` | off / palette / custom (off; yellow) | own Markdown renderer | All | No |
| Code font | Iosevka / Paseo's code font / custom installed font (Iosevka) | "Paseo" uses CSS `var(--fontFamily-mono, ...)` as `fontFamily` on web; platform monospace on native (`client/components/theme-tokens.ts:46`) | Web follows Paseo live; native gets platform mono | Yes for the "Paseo" option: depends on Paseo's CSS variable name. |
| Interface font, code glyphs, frosted glass, pointer glow | as Beautiful Chat (Inter, ligatures, on, on) | injected CSS | Web | Yes |
| Card folding by kind | Cards that start collapsed; Cards to collapse when finished (kinds: Shell and Git, Writes, Edits, Reads, Other tools, Thinking) (none); Only fold longer cards (off) | renderer state | All | No |
| Long content folding | Long terminal output 20 lines; Long code and diffs 30 lines; Long prompts 15 lines (each a switch, on) | renderer | All | No |
| Shell card summary (`+53 −0`, `8 lines`, `no output`); edit `+X −Y`; failed edit labelled "Not applied"; word-level diff highlight; real line numbers for edits | none | renderer; edit line numbers read file on daemon (RPC) | All | No |
| Timestamps under prompts and replies (with seconds; weekday or date when older) | none | renderer `timestamp` prop + `formatMessageTime` (`client/components/message-time.ts`) | All | No |
| Images in replies (`![](file://...)` thumbnails, viewer with zoom/pan) | Load remote images automatically (off) | renderer + RPC `file.image` | All | No |
| Link previews: icon, dashed underline, address bubble, warning when text and target differ | none | renderer + injected link CSS (`installLinkStyle`) | Hover parts web only | Partly (injected CSS) |
| File paths in replies open a read-only File preview panel | File paths in replies: panel / file manager (panel); Preview files outside the project (off) | `addWorkspacePanel` + `openPanel` + RPCs `file.read`, `file.kind` (`index.client.tsx:53-60`) | Desktop/web side view | No (supported API, 0.14+) |
| Let Paseo fold tool calls and turns | on/off (off) | reads Paseo's private `localStorage["@paseo:app-settings"].chatDisplay` (`client/host-chat-display.ts:17`) | Web | Yes: private storage |
| Find bar, selection actions | as Beautiful Chat | DOM (`client/components/chat-find.ts:9`, `[data-composer-input]`) | Web | Yes |
| Settings page in collapsible sections | - | `addSettingsScreen` | All | No |

---

## 3. Chat Polish (lthieu96/chat-polish)

- Registry: https://paseo.sh/plugins/lthieu96/chat-polish (746 installs, pinned commit `6b52cc252842`).
- Source: https://github.com/lthieu96/paseo-chat-polish
- Licence: **MIT**, Copyright (c) 2026 Hieu Le. Optional icon sets downloaded at run time keep their own licences: Hugeicons (MIT), Untitled UI (Untitled UI licence) (`README.md`, License).
- Requires: **Paseo >= 0.12.0**, plus Node 20.9+ and npm on the daemon host. Dependencies: `pele` (diagram renderer), `sharp` (thumbnails), `@getpaseo/protocol`.
- Preferences: two host-scoped settings documents via `defineSettings` + `server.registerSettings` (`shared/timeline.ts:88` "timeline", `shared/theme.ts:121` "theme"), so shared by all clients of a daemon. It also writes Paseo's own app settings (see below).
- UI: a dashboard screen with live preview (`addScreen` + `addSidebarHeaderItem`), and Command Center items.
- Independent code base. By far the heaviest user of Paseo DOM internals: `client/web/` has 25 files and references about 77 distinct Paseo `data-testid` values.

### Features

| Feature | Options (default) | API used | Platforms | Fragile? |
| --- | --- | --- | --- | --- |
| Tool calls as single rows (icon, state verb Running/Ran, command or file, detail; open for diff/output/raw) | Tool details start: collapsed / failed / expanded (collapsed); Command colours: expanded / always (expanded); Wrap diff lines (off); Row icons per kind steps/tool/thought: show/hide (show) | transformer `tool_call` + RN renderer `chat-polish-tool` | All | No. Only active when Paseo's Chat display is "Full", which it reads from private storage (below). |
| Hide completed calls by kind | read, search, fetch, task, todo (none hidden) | transformer returns `{items: []}` | All | No |
| Merged steps: thoughts and tool calls between replies fold into one row ("Edited 1 file and ran 1 command") | Merge (on) | transformers + `paseo.agents.ref(id).timeline.refetch` to read the whole run (`client/steps.ts:392`) | Rows everywhere; which agents to follow comes from DOM tabs | Partly: finds open agent tabs and subagent panes via DOM (`openAgentIds`, `subagentPaneShown`). |
| Row strength (fade until hover) | steps: dim / faded / soft / full (faded) | RN renderer + CSS for Paseo rows | All for plugin rows | Paseo rows: yes |
| Density | compact / normal / spacious (normal) | RN renderer + injected CSS | All / web | Paseo rows: yes |
| Reasoning row | reasoning: paseo / collapsed / expanded (paseo) | transformer `reasoning` + renderer | All | Reads Paseo's "Always expand reasoning" from private storage. |
| Plan card, todo row, error/compaction notice | none | transformers `tool_call` (plan), `todo`, `error`, `compaction` | All | No |
| Image-only replies as thumbnails | images: small / large / xlarge / native (small) | transformer `assistant_message` + renderer + RPC `image.read` (sharp on daemon) | All | No |
| Image stacks in Paseo-drawn replies | Image stacks (off); open on hover / click (hover) | DOM injection (`client/web/image-stacks.ts`); viewer borrows Paseo's lightbox found in Paseo's web bundle (`client/web/lightbox.ts`, `app-script.ts`) | Web | **Very fragile** |
| Turn recap row (changed files, failed-command excerpts) | Recap (on) | server `server.on("agent.turn_ended")` + `paseo.agents.ref(id).timeline.append({type:"plugin",...})` (`index.server.ts:52-62`) | All | No (older `server.on` form; reference now prefers `server.addHook("agent.turn.after")`, see `hooks.md:703`) |
| Theme contribution (Mariana, Ivory, Parchment, Dusk presets; colour editor with contrast checks) | name, appearance, 8 colours, sidebar colour, syntax theme (One Dark Darker Mariana) | `client.addTheme` (`client/theme-registry.ts:26`) | All | No. But "Use this theme" writes Paseo's private `@paseo:app-settings` and reloads (`client/web/host.ts:93`): web only, fragile. |
| Fonts and sizes (UI font, mono font, content size, code size) | Paseo values | writes Paseo's private `localStorage["@paseo:app-settings"]` then `location.reload()` (`client/web/host.ts:84-94`) | Web | **Yes: private storage** |
| Restyle Paseo's own items (tool groups, bubbles, Markdown, composer, permission cards, menus) | nativeStyle: design / paseo (design) | injected CSS keyed on Paseo `data-testid` and `data-paseo-markdown-*` (`client/web/selectors.ts`, `restyle-css.ts`) | Web | **Very fragile** |
| Rich text variants for quote, table (4), code, inline code, heading, list, callout, rule | a / b / c (a) each | injected CSS on Paseo's Markdown | Web | **Very fragile** |
| Window chrome restyle (sidebars, header, tabs, Explorer) | windowStyle: paseo / flat / floating (flat) | DOM tagging + CSS (`client/web/window.ts`) | Web | **Very fragile** |
| Mermaid diagrams drawn by Pele in theme colours | diagrams: pele / mermaid (pele) | RPC `diagram.render` + DOM replacement of Paseo's mermaid (`client/web/mermaid.ts`) | Web | **Very fragile** |
| HTML pages (agent gets `html_render` / `html_preview` MCP tools; page shown inline) | html (off); optional headless Chrome download | `server.before("agent.create")` adds an MCP tool; local server on 127.0.0.1; RN renderer `chat-polish-html` | Desktop/web show the page; phones show the name | Mostly supported API; heavy feature |
| Working indicator | loader: dots / sparkle / spokes / dotring / orb / matrix / snake (dots); size s/m/l (s) | CSS on Paseo's footer | Web | Yes |
| Icon set swap | lucide / untitled / hugeicons (lucide) | CSS masks by Paseo's `lucide-*` classes; daemon downloads npm set | Web | Yes |
| Clamp long user messages to 6 lines with fade | userMessages: clamp / full (clamp) | DOM + CSS (`client/web/user-messages.ts`) | Web | Yes |
| Selection copy menu (Copy Text / Markdown) | selectionCopy (on) | DOM | Web | Yes |
| Jump between prompts (Opt+Cmd+Up/Down) | fixed | DOM keydown + Command Center items | Web (keys); Command Center everywhere | Keys: yes |
| Copy last turn as Markdown | Command Center item | `addCommandCenterItem` + `timeline.refetch` + `copyText` | All | No |
| Composer model picker rail with provider list | fixed | `client.paseo.providers.snapshot()` (supported) + DOM injection into composer (`client/web/model-picker.ts`) | Web | Yes |
| Context window card with Compact row | fixed | DOM + `agents.ref(id).send("/compact")` | Web | Yes |
| Phones: turn plugin rows off | phoneChat (on) | skips transformers when `Platform.OS` is ios/android or width < 720 | All | No |
| Language follows Paseo (English / Chinese) | fixed | `client.i18n` (supported) | All | No |
| Command Center toggles for most prefs | - | `addCommandCenterItem` | All | No |

---

## 4. Better Paseo (roundreddot/better-paseo)

- Registry: https://paseo.sh/plugins/roundreddot/better-paseo (1.7k installs, pinned commit `fe5b9327acea`).
- Source: https://github.com/RoundRedDot/better-paseo
- Licence: **MIT**, Copyright (c) 2026 ABorakati (`LICENSE`; fork of Beautiful Chat).
- Requires: **Paseo >= 0.14.0** (`paseo-plugin.json`). Builds a minified client with esbuild at install (`scripts/build-client.mjs`).
- Preferences: host-scoped `defineSettings` record `presentation` (`shared/preferences-settings.ts`), shared by all clients; `localStorage` only as a fast-start cache.
- Also adds a large **Tasks board** (all agents in lanes by state). That is outside chat scope and only summarised here.
- Server records each turn's start, end, error and token usage, so turn footers show figures after a reload (`docs/plugin-sdk-limitations.md` item 6).

### Features (chat only)

| Feature | Options (default) | API used | Platforms | Fragile? |
| --- | --- | --- | --- | --- |
| Master switch | Enable Better Paseo chat (on) | re-registers all transformers when it changes (`client/state/follow-preference.ts`) | All | No |
| One compact row per tool call (26pt, typed summary, starts collapsed, state kept per `agentId:callId`) | Open failed calls (off); Row icons and labels: icon / label / both (icon); File paths: relative / absolute (relative) | transformers `tool_call`, `compaction` + renderer `omp-tool-call` | All | No |
| Tool icons: 101 icons for 209 shell programs, 75 MCP services | fixed | PNG rasters served by RPC `marks.bitmaps` | All | No |
| Reasoning row split on headings, live heading preview, observed durations only | none | transformer `reasoning` | All | No |
| Checklist with progress ring, pop-out live panel | none | transformer `todo` | All | No |
| Plugin Markdown for replies (block-by-block streaming cache, table repair) | Plugin markdown for replies (on); Markdown style document / compact / terminal (document) | transformer `assistant_message`; vendored `marked` | All | No |
| Mermaid fences | fixed | hands back to Paseo's diagram renderer (`Markdown` from `client/ui`) | All | No |
| Tables: copy as Markdown / as image, cell selection, multi-range | none | renderer; `copyText` | All (image copy web) | No |
| Turn footer: copy, time, provider mark, model, thinking level, duration; hover "Turn details" with tokens | fixed | renderer `timestamp`, `useAgent`, server turn hooks + RPCs `turns.usage`, `turns.last` | All | Partly: also reads provider session files on disk for running token counts. |
| System cards for OMP `<system-notice>` / `<irc>` tagged messages | fixed | transformer `assistant_message` | All | No |
| Notification rows | fixed | transformer `notification` (accepted from Paseo 0.14; Beautiful Chat notes 0.8 rejected it) | All | No |
| Prompt bubble with copy and token usage | Enhanced prompt bubble (off) | transformer `user_message` | All | No |
| Block details panel (drawer on phone, floating or side panel on tablet/desktop; step through blocks; keys; pinch text size on phones) | Block details panel (on) | RN components | All | No |
| Hover previews of collapsed rows/paths (movable, resizable) | Hover previews (on); Delay 0-10 s (1 s); Wrap lines (on); Line numbers (on); Alternating shading (on) | RN components | Desktop/web (long press on touch) | No |
| Image read and reply images, viewer 0.25x-8x zoom | none | RPC `file.image` | All | No |
| Accent colour | theme / jade / violet / amber / rose (theme) | renderer | All | No |
| Interface font | Follow Paseo / Inter (fetched from daemon) / system (Follow Paseo) | Inter via injected `@font-face` (RPC `fonts.embedded`) | Inter web only | Partly (CSS injection) |
| Monospace font and code size | Follow Paseo / Custom family (Follow Paseo); code size Follow Paseo or 10-22 px | "Follow Paseo" reads Paseo's private `localStorage["@paseo:app-settings"]` (read-only shim, `client/ui/tokens/host-appearance-shim.ts`) | Web reads Paseo; native uses platform mono 12px | Yes: private storage |
| Inline code colour on mobile | dark grey / blue / violet / green / coral (dark grey) | renderer | iOS/Android | No |
| Block text size | 9-20 px (13 px) | renderer | All | No |
| Tight rows / Tight reply (take back Paseo's 16pt gap) | on / on | negative-margin compensation in RN styles (`client/preferences.ts:165-176`) | All | Yes: hard-codes Paseo's internal 16pt plugin-row gap. |
| Language | Follow Paseo / English / Simplified Chinese (Follow Paseo) | reads host language | All | Partly |
| Find bar, selection toolbar (Copy / Add to chat) | Selection toolbar (on) | DOM: `agent-chat-scroll` test id, writes into `[data-composer-input]` (`client/components/selection-actions.ts:58`) | Web | Yes |
| Debug slash command `/bc-perf` | - | `addSlashCommand` | All | No |
| Tasks board (out of chat scope) | many | `addScreen`, sidebar item, Command Center; Stop/Unarchive run the Paseo CLI; Mark read and sub-agents load Paseo internal modules `@getpaseo/client/internal/daemon-client` (`server/tasks/provider-subagents.ts:146`) | All | **Private API** |

---

## 5. Merged feature list (de-duplicated)

Key: **Supported API** = documented plugin API, works on every platform unless noted. **Style layer only (web, fragile)** = CSS or DOM injection, or Paseo private storage. Source plugins: BC = Beautiful Chat, RC = Refined Chat, CP = Chat Polish, BP = Better Paseo.

### Message layout

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Replace prompt bubble (copy button, token usage, long-prompt fold) | BC, RC, BP | transformer `user_message` + renderer | Supported API (loses pasted images and Paseo's rewind menu) |
| Replace assistant reply with plugin Markdown (document / compact / terminal styles) | BC, RC, BP | transformer `assistant_message` + renderer (or `Markdown` from `client/ui`) | Supported API |
| Merge thoughts and tool calls between replies into one row | CP | transformers + `agents.ref().timeline.refetch` | Supported API for rows; CP finds open tabs via DOM (fragile part) |
| Hide completed tool calls by kind | CP | transformer returns `{items: []}` | Supported API |
| Row density / spacing | CP (compact/normal/spacious), BP (tight rows) | renderer styles | Supported API for plugin rows; changing Paseo's own rows or its 16pt gap is style layer (fragile) |
| Row strength (fade until hover) | CP | renderer | Supported API for plugin rows |
| Clamp long user messages drawn by Paseo | CP | DOM + CSS | Style layer only (web, fragile) |
| Turn recap row after each turn | CP | `server.addHook("agent.turn.after")` + `timeline.append` | Supported API |
| Phone opt-out (leave chat to Paseo on narrow screens) | CP | `Platform.OS`, `Dimensions` | Supported API |
| Block details panel / drawer, hover previews | BP | RN components | Supported API |
| Window chrome restyle (flat / floating) | CP | DOM + CSS | Style layer only (web, fragile) |

### Typography

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Separate text sizes for replies, tool cards, code | RC (50-300 %), BP (block 9-20 px, code 10-22 px) | renderer styles | Supported API (plugin rows only) |
| Reply line spacing | RC | renderer styles | Supported API |
| Embedded interface font (Inter) | BC, RC, BP | injected `@font-face` | Style layer only (web, fragile) |
| Code font choice (Iosevka, ligatures, custom family) | BC, RC, BP | injected `@font-face` on web; `fontFamily` on native | Custom installed family: supported; embedded faces: style layer only |
| Follow Paseo's font and sizes | RC, BP | read `@paseo:app-settings` or CSS var `--fontFamily-mono` | Style layer only (web, fragile) - no host API |
| Change Paseo's own fonts and sizes | CP | write `@paseo:app-settings` + reload | Style layer only (web, fragile), writes private state |
| Accent colour, bold colour, highlight marks | BC, RC, BP | renderer styles from `theme` | Supported API |
| Rich text variants on Paseo's own Markdown | CP | CSS on `data-paseo-markdown-*` | Style layer only (web, fragile) |
| Full app theme (8-colour palette, light/dark) | CP | `client.addTheme` | Supported API |

### Tool calls

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Typed cards per tool kind (shell, git, read, write, edit, search, fetch, MCP, subagent, plan, Paseo tools) | all | transformer `tool_call` + renderer | Supported API |
| One-line summary in header (`+X −Y`, exit code, duration, line count) | RC, BP, CP | renderer | Supported API |
| Collapse rules (start collapsed / collapse when finished / open failed / min length) | RC, BP, CP | renderer state | Supported API |
| Long output folding (head+tail for terminal, head for code) | RC, BP | renderer | Supported API |
| Program / MCP-service icons | BP | PNG rasters (RN `Image` cannot draw SVG on native) + RPC | Supported API |
| Diff rendering with word highlight and real line numbers | RC, BC, CP (wrap toggle) | renderer + daemon RPC to read file | Supported API |
| Reveal file in Finder / Explorer | BC, RC, BP | `defineRpc` + `server.handle` (daemon runs OS command) | Supported API (desktop) |
| Open file in a read-only preview panel | RC | `addWorkspacePanel` + `openPanel` + RPC | Supported API (0.14+) |
| Image read preview and viewer | all | RPC returning bytes | Supported API |

### Thinking

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Reasoning row: collapsible, steps, durations, token badge, heading preview while streaming | BC, RC, BP, CP | transformer `reasoning` + renderer | Supported API |
| Initial state follows Paseo's "Always expand reasoning" | CP | reads private `@paseo:app-settings` | Style layer only (web, fragile) |
| Thinking kind in fold rules | RC | renderer | Supported API |

### Code blocks

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Syntax highlighting (Shiki on daemon) | BC, RC, BP | RPC; Shiki in server deps | Supported API |
| Line numbers, copy button, wrap toggle, maximized preview | BC, RC, BP | renderer + `copyText` | Supported API |
| Mermaid via Paseo's renderer | BP | `Markdown` from `client/ui` | Supported API |
| Mermaid via Pele in theme colours | CP | RPC + DOM replacement | Style layer only (web, fragile) |
| Tables: copy as Markdown / image, cell selection | BP | renderer | Supported API (image copy web only) |

### Timestamps and metadata

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Time under prompts and replies (seconds, weekday, date) | RC | renderer `timestamp` prop | Supported API |
| Turn footer: provider mark, model, thinking level, duration, tokens | BP | renderer + `useAgent` + server turn hooks + RPC | Supported API (token history only from install time) |
| Token usage on prompt | BC, RC, BP | `useAgent` (live only) | Supported API |

### Composer

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| "Add to chat" from selected text | BC, RC, BP | writes into `[data-composer-input]` | Style layer only (web, fragile) - no SDK call writes the composer |
| Model picker provider rail | CP | `paseo.providers.snapshot()` + DOM injection | Style layer only (web, fragile) |
| Composer restyle | CP | CSS | Style layer only (web, fragile) |
| Composer pills / items (none of the four use them) | - | `addComposerPill`, `addComposerItem` | Supported API, unused by these plugins |

### Other

| Feature | From | Needs | Class |
| --- | --- | --- | --- |
| Own find bar (Paseo's Ctrl/Cmd+F cannot reveal replaced rows) | BC, RC, BP | keydown + DOM search in `agent-chat-scroll` | Style layer only (web, fragile) |
| Selection toolbar (Copy) | BC, RC, BP, CP | `window.getSelection` + DOM | Style layer only (web, fragile) |
| Frosted glass, pointer glow, shimmer | BC, RC | injected CSS | Style layer only (web, fragile) |
| Link decoration and mismatch warning | RC | renderer + injected CSS for hover | Mostly supported; hover is style layer |
| Working indicator variants, icon-set swap | CP | CSS on Paseo classes | Style layer only (web, fragile) |
| Jump between prompts | CP | Command Center (supported) + DOM keys (fragile) | Mixed |
| Copy last turn as Markdown | CP | `addCommandCenterItem` + `timeline.refetch` + `copyText` | Supported API |
| HTML pages from an agent tool | CP | `agent.create` hook adds MCP tool + renderer | Supported API (heavy) |
| Settings page / dashboard | all | `addSettingsScreen` or `addScreen` + `defineSettings` | Supported API |
| Language follows Paseo | CP, BP | `client.i18n` | Supported API |

---

## 6. Cross-cutting constraints the authors hit (useful for Morphise)

Each item comes from the authors' own limitation lists (`beautiful-chat/README.md` "Plugin SDK limitations", `better-paseo/docs/plugin-sdk-limitations.md`). These are their claims, re-checked by them against `@getpaseo/plugin` 0.12/0.13; not re-checked here against 0.16.

1. A transformer replaces a row completely. There is no "decorate" mode. Replacing a prompt loses pasted images (the item handed to plugins keeps only text and ids) and Paseo's rewind menu; replacing a reply loses Paseo's Fork action and file links.
2. Paseo's Ctrl/Cmd+F cannot reveal a replaced row (row id becomes `<pluginId>/<itemId>`). The reference (`ref.md:1186-1191`) now says find highlights text in replacement rows when the query also matches the original message, so this may be partly fixed. [unverified: test on current Paseo.]
3. Transform results are cached per source item; a preference change needs the transformer removed and re-added to re-project existing rows (BP and CP both do this).
4. `PluginTheme` has eleven colours; code backgrounds and diff tints must be derived.
5. No font registration API and no CSS hook; every font and blur effect is web-only CSS injection.
6. No API reads Paseo's appearance settings (fonts, sizes, chat display); all three plugins that need them read private `localStorage["@paseo:app-settings"]`.
7. No API writes into the composer.
8. Paseo leaves a 16pt gap under each plugin row.
9. Settings: Beautiful Chat (0.8) says `defineSettings` was host-only; the current reference documents `scope: "device"` as well (`ref.md:1395`), so per-device presentation settings are now possible without `localStorage`.
10. Item types a transformer can target, as seen in these plugins: `tool_call`, `reasoning`, `todo`, `user_message`, `assistant_message`, `error`, `compaction`, and `notification` (0.14+). The reference itself does not list them.

---

## Sources

Registry pages (fetched):
- https://paseo.sh/plugins/roundreddot/better-paseo
- https://paseo.sh/plugins/aborakati/beautiful-chat
- https://paseo.sh/plugins/lthieu96/chat-polish
- https://paseo.sh/plugins/genodevelop/refined-chat

Registry entries (local clone of `getpaseo/plugins`, read):
- `plugins/roundreddot/better-paseo.json` (commit `fe5b9327acea30c2b1cd86ecdec3bdf23cfdc063`)
- `plugins/aborakati/beautiful-chat.json` (commit `42b61d8301b5400a67821bbbfcf99fa8b681dc37`)
- `plugins/lthieu96/chat-polish.json` (commit `6b52cc2528426812c78ec8d2b547ffb8d158e542`)
- `plugins/genodevelop/refined-chat.json` (commit `088d860fecb5154ba5973816f528a6781028d7f9`)

Repositories (cloned at the pinned commits and read):
- https://github.com/RoundRedDot/better-paseo/tree/fe5b9327acea30c2b1cd86ecdec3bdf23cfdc063
- https://github.com/ABorakati/beautiful-chat/tree/42b61d8301b5400a67821bbbfcf99fa8b681dc37
- https://github.com/lthieu96/paseo-chat-polish/tree/6b52cc2528426812c78ec8d2b547ffb8d158e542
- https://github.com/GenoDevelop/paseo-refined-chat/tree/088d860fecb5154ba5973816f528a6781028d7f9

Licence files:
- https://github.com/RoundRedDot/better-paseo/blob/fe5b9327acea30c2b1cd86ecdec3bdf23cfdc063/LICENSE
- https://github.com/ABorakati/beautiful-chat/blob/42b61d8301b5400a67821bbbfcf99fa8b681dc37/LICENSE
- https://github.com/lthieu96/paseo-chat-polish/blob/6b52cc2528426812c78ec8d2b547ffb8d158e542/LICENSE
- https://github.com/GenoDevelop/paseo-refined-chat/blob/088d860fecb5154ba5973816f528a6781028d7f9/LICENSE

Paseo plugin API reference:
- https://paseo.sh/docs/plugins/reference.md (local copy: scratchpad `ref.md`; sections "Timeline items", "Contribute a theme", "Persisted values", "Cross-platform rules")
- Paseo hooks reference (local copy: scratchpad `hooks.md`, migration table line 694-703)
