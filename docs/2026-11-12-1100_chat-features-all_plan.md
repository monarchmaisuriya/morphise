# Every chat feature from the four chat plugins, in Morphise 0.15.0

- Date: 2026-11-12 11:00
- Status: built; reviewed and fixed
- Repos: morphise   Files: shared/chat-view.ts, client/chat-rows.tsx, client/sections.tsx, client/forms/tabs.tsx, shared/profile.ts, server/files.ts (new), server/turn-recap.ts (new), shared/style-sheet.ts, index.server.ts
- Source list: docs/2026-11-12-0330_chat-plugins_sources.md (Beautiful Chat, Refined Chat, Chat Polish, Better Paseo; all MIT). Features are rebuilt, not copied.

## Rule for every feature

Prompts and replies are never redrawn (M: Paseo's Fork and Copy must never be removed). Paseo's own rows stay the default; every feature is opt-in in Settings, Chat. Web-only features that depend on Paseo's page structure sit in an "Experimental (web)" section, off by default, labelled as possibly breaking on Paseo updates.

## Decisions, feature by feature

Key: HAVE = already in 0.14; BUILD = this release, documented API, every platform; WEB = this release, opt-in, web/desktop only, may break; NO = not built, with the reason.

### Tool calls

| Feature (source) | Decision |
| --- | --- |
| Typed cards per kind: shell, read, edit, write, search, fetch (all) | HAVE |
| MCP and other tools as cards: "server · tool", input and output as JSON (BC, BP) | BUILD |
| Git and program-aware shell rows: icon per program (git, npm, node, python, docker, curl, rg ...) (BP: 101 icons) | BUILD (Lucide icons for common programs; BP's PNG set is theirs) |
| Command colours: program, flags, strings (CP) | BUILD |
| One-line rows (CP, BP) | HAVE |
| Row labels: icon / label / both (BP, CP) | BUILD |
| File paths relative to the workspace or absolute (BP) | BUILD |
| Fold rules: open while running, fold when done / always / never; failed always open (all) | HAVE |
| Fold per kind: start folded and fold when finished, by kind; only fold longer cards (RC) | BUILD |
| Long output: separate limits for terminal output and for code and diffs (RC) | BUILD |
| Shell summary "N lines" / "no output"; failed edit "Not applied" (RC) | BUILD |
| Diff colours and line numbers (all) | HAVE |
| Word-level diff highlight (RC) | BUILD |
| Wrap diff and output lines, or scroll sideways (CP) | BUILD |
| Copy (all) | HAVE |
| Hide finished calls by kind (CP) | HAVE |
| Row strength: dim / faded / soft / full until hovered (CP) | BUILD |
| Open the full output, or the file, in a side panel (RC file preview, BP block details panel) | BUILD (one "Details" workspace panel) |
| Image reads shown as a picture (all) | BUILD (daemon reads the image, at most 3 MB) |
| Reveal a file in Finder / Explorer (BC, RC, BP) | BUILD (daemon runs the OS file manager) |
| Real line numbers for edits from the file on disk (RC) | NO: hunk headers already give real numbers; reading the whole file adds cost for no gain |
| Hover previews of folded rows (BP) | NO: the Details panel shows the same content without a floating window |
| Merge thoughts and calls between replies into one row (CP) | NO: rows are transformed one at a time; merging needs neighbour rows and leaves Paseo's 16pt gap under each empty row |

### Thinking

| Feature | Decision |
| --- | --- |
| Collapsible card (all) | HAVE |
| Expanded card option (CP) | BUILD |
| Split on headings into steps; live heading while streaming (BP) | BUILD |
| Observed duration (BC, BP) | BUILD (measured while the card is on screen) |

### Plans and notices

| Feature | Decision |
| --- | --- |
| Checklist card with progress (all) | HAVE (steps card) |
| Error notice card (BC, CP) | BUILD |
| Compaction notice row (CP, BP) | BUILD |
| Notification rows (BP) | BUILD |
| Turn recap after each turn: duration, files changed, failed commands (CP, BP turn footer) | BUILD (opt-in; daemon appends one row per turn) |

### Look

| Feature | Decision |
| --- | --- |
| Text size, spacing, times (all) | HAVE |
| Separate code and output text size (RC, BP) | BUILD |
| Accent colour: theme / jade / violet / amber / rose / custom (BC, RC, BP) | BUILD |
| Tight rows: take back Paseo's 16pt gap under plugin rows (BP) | BUILD (opt-in; relies on Paseo's gap staying 16pt) |
| Theme presets (CP) | BUILD (four Morphise palettes in Settings, Look) |
| Phones: Paseo's rows (CP) | HAVE |
| Master switch (BP) | BUILD |
| Command Center toggles (CP) | BUILD |
| Copy last turn (CP) | HAVE |

### Replies and prompts (web, experimental, without redrawing them)

| Feature | Decision |
| --- | --- |
| Reply text size and line spacing (RC) | WEB |
| Bold text colour (RC) | WEB |
| Link underline style (RC) | WEB |
| Clamp long prompts, open on hover (CP) | WEB |
| Interface font and code font: any installed family (BC, RC, BP) | WEB |
| Jump to previous / next prompt (CP) | WEB (Command Center items) |
| Plugin Markdown replies, prompt bubbles, timestamps under messages, images and link previews in replies, tables copy, system cards (BC, RC, BP) | NO: they replace prompts or replies, which removes Paseo's Fork and Copy |

### Not built (heavy or very fragile)

| Feature | Reason |
| --- | --- |
| Syntax highlighting (Shiki on daemon) | Needs a large dependency on the daemon; Morphise has none |
| HTML pages tool (CP) | Adds an MCP tool to agents and a local web server |
| Mermaid via Pele, image stacks, icon set swap, working indicator, window chrome, restyling Paseo's Markdown, menus, composer and permission cards (CP) | Rewrites Paseo's page through about 77 private test ids |
| Model picker rail, context window card (CP) | DOM injection into Paseo's composer |
| Selection toolbar, own find bar (BC, RC, BP) | Write into Paseo's composer through private DOM; Paseo's own find already works |
| Changing Paseo's own fonts and sizes (CP) | Writes Paseo's private app settings and reloads the app |
| Tasks board (BP), language (CP, BP), debug command (BP) | Morphise has its own board; not chat customisation |

## Standardized review

Plan reviewed against the confirmed need ("add all the features", keep Fork and Copy): every feature from the four source tables appears above with a decision; NO decisions carry a concrete reason. New daemon behaviour (file read, reveal, turn recap row) is opt-in and must be listed in the registry PR's permissions. Risk: web-only features depend on Paseo's page structure; mitigated by the Experimental label and off-by-default.

## Changes made

- Every BUILD and WEB row above is built (0.15.0). Also added on request: hide a workspace's only chat in the sidebar, and a redesign of every Morphise chat row after M's screenshot of 0.14 in use.
- Also on request: Finished, unread is green; settings save on their own (no Save button).
- Review fixes: bounded text reads (1 MB), image reads only of files, Windows reveal with spaces, a recap row id per prompt and only entries up to the turn's end, no recap for a turn without tool calls, recap off with the master switch, colour transparency for any theme colour form, full paths for file actions, 0.14's "show all output" kept for code, hover through Pressable, Details reports a missing workspace and draws at most 5,000 lines.
