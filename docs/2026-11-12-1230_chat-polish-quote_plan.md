# Every Chat Polish and Quote feature in Morphise 0.16.0, a selection-bar bookmark, and a better Workbench card

- Date: 2026-11-12 12:30
- Status: planning
- Repos: morphise   Folders: client, client/polish (new), client/polish/web (new), server, shared
- Files: shared/profile.ts, shared/chat-view.ts, client/sections.tsx, client/chat-rows.tsx (replaced by ported rows), client/forms/tabs.tsx, client/inbox.tsx, index.client.tsx, index.server.ts, paseo-plugin.json, package.json, package-lock.json, NOTICE.md (new), plus ported modules
- Subagents: none planned; parts 4 to 8 are independent and could run in parallel (see Open questions)
- Research: docs/2026-11-12-1215_chat-polish-quote_research.md

## Context and problem

M compared Morphise 0.15's chat with Chat Polish and found it "still not good enough": 22 Chat Polish features are missing and 6 are partial. M also wants every Quote feature (reply to a piece of an answer), a Bookmark button on the selection, and a better Workbench card (the "Finished, not seen yet" row repeats its heading, uses a heavy bold title and wastes a line).

## Goals / Non-goals

- Goals: every Chat Polish feature except the two M skipped; every Quote feature; Bookmark on the selection bar; a redesigned Workbench card; Paseo's Fork and Copy kept on every prompt and reply.
- Non-goals: writing Paseo's private settings (fonts, sizes, theme picker, reasoning expansion); loading Paseo's internal modules (its image viewer); Chinese for Morphise's own settings screens.

## What is true today

- Settings: one profile document; chat options live in `profile.chat` (`shared/profile.ts`), saved on their own since 0.15 (`client/forms/autosave.ts`). [verified]
- Chat rows: Morphise's transformers and renderers in `client/sections.tsx` and `client/chat-rows.tsx`, tool kinds and summaries in `shared/chat-view.ts`. [verified]
- Turn recap on the daemon (`server/turn-recap.ts`); file RPCs (`server/files.ts`). [verified]
- Bookmarks: `client/bookmark-store.ts`, operations in `shared/bookmarks.ts`, shown in the Workbench (`client/inbox.tsx` `Bookmarks`). [verified]
- Workbench row: `InboxRow` in `client/inbox.tsx:54`: status dot, 14pt title, then the status word ("Finished") on its own line, then the workspace. [verified]
- No runtime npm dependencies; `paseo-plugin.json` has no `build` command. [verified: package.json]

```
Paseo timeline item --> Morphise transformer (sections.tsx) --> Morphise row (chat-rows.tsx)   <-- replaced by ported rows
Paseo page (web)    --> chat.web style sheet (style-sheet.ts)                                 <-- joined by ported restyle
selected text       --> (nothing)                                                             <-- new selection bar
```

## Options considered

| Option | How it works | Tradeoffs | Fails when | Completeness |
| --- | --- | --- | --- | --- |
| A. Port Chat Polish's rows as Morphise's rows, then add Morphise's extras to them | `client/polish/views.tsx`, `model.ts`, `steps.ts`, `highlight.ts` ported; MCP cards, Details panel, Show in Finder, program icons, per-kind folding moved onto them | Matches the design M compares against; one row system; larger diff | A Morphise 0.15 option has no place in the new rows (each is mapped in Part 2) | 9/10 |
| B. Keep Morphise's rows, add Chat Polish's behaviours | Merged steps, highlighting, per-kind icons added to `chat-rows.tsx` | Smaller diff; keeps the design M called not good enough | M judges the look against Chat Polish | 6/10 |

RECOMMENDATION: A, because M's bar is Chat Polish's chat, and two row systems would double every later change.

## Decision

Port both plugins with attribution (M, 2026-11-12) into `client/polish/` and `server/polish/`, read all their preferences from `profile.chat` through one adapter, and use Chat Polish's rows as Morphise's rows with Morphise's extras added. Rejected: B (above); keeping Chat Polish's separate settings documents (two sources of truth).

## Design

- **Settings:** new optional keys under `profile.chat` (written only when they differ from the default, as since 0.11): `merge`, `rowIcons`, `toolDetails`, `commandColors: "expanded" | "always"` (0.15's `true`/`false` still read), `images`, `imageStacks`, `imageStackOpen`, `selectionBar` (quote, reply, side chat, copy, bookmark), `restyle`, `window`, `loader`, `loaderSize`, `richText`, `diagrams`, `iconSet`, `html`, `syntax`. One adapter, `polishPrefs(chat)`, gives the ported code Chat Polish's `Prefs` shape. Unset means today's behaviour, except that the new rows replace 0.15's when "Let Morphise draw chat rows" is on. Empty or unknown values fall back to the default; nothing turns a safety off.
- **Settings screens:** Chat tab (rows, steps, tools, thinking, notices, recap, phones, hidden); new Messages tab (selection bar, long prompts, images and stacks, rich text, diagrams); Look tab gains Paseo restyle, window, loader, icon set, Chat Polish's four themes with contrast checks and a syntax theme; new Pages tab (HTML pages, headless Chrome download and removal). Every page keeps a live preview.
- **Daemon:** `pele` and `sharp` as runtime dependencies, loaded on first use from the plugin folder (not bundled); manifest `build: [["npm", "ci", "--omit=dev", "--ignore-scripts"]]` and a committed lock. RPCs: diagram render, image thumbnail (image files only), icon set (hash-pinned npm download), HTML page store and serve, headless Chrome status, install and remove, update check and apply. `agent.create` hook adds the HTML tools only while `html` is on and never for internal agents. Every RPC under 30 s; long work (Chrome download, update) runs as a job the client polls.
- **Selection bar (web):** Quote's shadow-root bar with Quote, Reply, Side chat, Copy (Markdown or Text) and Bookmark. Bookmark writes `{ agentId, workspaceId, excerpt: selection, note: "" }` through `applyBookmark`. Side chat is a Workspace panel plus a sub-agent with the parent's provider, model, mode and thinking.
- **Workbench card:** status icon in its own column (check, alert, shield) in the status colour; 13pt medium title; time on the right; line two is the preview (last answer, error or permission request), and the status word only when the list is not grouped by status; line three the project tile, workspace and "sub-agent of"; on hover (web) Mark seen and Open buttons; selection drawn as an accent bar, not a heavy fill; group headings as small labels with a count pill.
- **Attribution:** `NOTICE.md` with both MIT notices; each ported file starts with a one-line origin comment.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation | Noticed by |
| --- | --- | --- | --- | --- |
| Ported page restyle misses Paseo 0.16 beta markup | Medium | Parts of the restyle don't apply | Experimental and off by default; live check on the beta | Live check, Part 4 |
| sharp fails to load in the macOS app | Medium | No thumbnails | Loaded on first use; failure keeps Paseo's images and logs once | Live check, Part 5 |
| A 0.15 chat option loses its effect | Medium | User's setting ignored | Mapping table in Part 2 with a test per option | Tests |
| Old Morphise versions reject the new keys (strict objects) | High on rollback | Profile reported invalid on rollback | New keys optional and only written when changed; changelog rollback note | Changelog |
| Registry review rejects network or MCP features | Low | Listing stays on the old pin | All opt-in; the PR lists each permission | Review PR |
| Merged steps crash Paseo's virtual list | Low | Chat errors | Chat Polish's approach (remove items, never hide in place) kept as is | Live check, Part 2 |

## Acceptance criteria

- Given Morphise rows on, when an agent runs tools between replies, then they show as one merged row ("Edited 1 file and ran 1 command") that opens to each step, and Fork and Copy still work on prompts and replies.
- Given text selected in a reply on web, when the bar shows, then Quote, Reply, Side chat, Copy and Bookmark each work, and Bookmark adds a Workbench bookmark with that excerpt.
- Given each Chat Polish feature in the research table not marked SKIP, then a setting turns it on and the preview or a live check shows it working.
- Given the Workbench has a finished chat, then its card shows the preview, not "Finished", and Mark seen works from the card.
- Given a clean copy without node_modules, when it is installed, then it builds and runs.

## Rollout and rollback

Release 0.16.0 with a semver tag and a GitHub Release; reinstall from the tag. Everything new is off or unchanged by default except the row design. Rollback: `paseo plugin update morphise --ref v0.15.1` after setting new options back.

## Parts

### Part 1: Foundation
- [ ] Settings keys and `polishPrefs` adapter, with tests. Done: schema and adapter tests pass.
- [ ] NOTICE.md, manifest build command, dependencies and lock. Done: clean-copy install builds.
- [ ] Messages and Pages tabs (empty sections). Done: tabs show on the test daemon.

### Part 2: Chat rows (Chat Polish design)
- [ ] Port model, views, steps, highlight, i18n (rows only); add MCP cards, Details, Show in Finder, program icons, per-kind folding. Done: preview and live chat show the new rows.
- [ ] Merged steps, plan rows, todo rows, per-kind icons, "failed only", "always" command colours. Done: tests plus live check.
- [ ] Map each 0.15 option. Done: one test per option.

### Part 3: Selection bar
- [ ] Port Quote (bar, Quote, Reply, Side chat panel, Copy Markdown) plus Copy Text and Bookmark. Done: each action works live on web.

### Part 4: Paseo restyle (web, experimental)
- [ ] Port restyle CSS, parts, selectors, CSS guard, window style, sidebar colour, rich text, loaders, spacing, control font, plugin views, hover cards, context card, model picker, prompt keys. Done: live check on the beta.

### Part 5: Images
- [ ] Thumbnail RPC with sharp, image-only reply rows, image stacks, stack viewer. Done: live check with a reply that has images.

### Part 6: Diagrams
- [ ] Mermaid theme colours, Pele RPC, redraw button. Done: a mermaid reply draws both ways.

### Part 7: Icon sets
- [ ] Hash-pinned download, cache, swap on web. Done: picking Hugeicons swaps icons.

### Part 8: HTML pages
- [ ] Tools through `agent.create`, page store and server, frame renderer, headless Chrome job, page check. Done: a test agent's page shows in the chat (test daemon only).

### Part 9: Themes, update check, Workbench card
- [ ] Chat Polish's four themes, contrast checks, syntax theme. Done: preview shows contrast warnings.
- [ ] Update available and Update. Done: check reports the current tag.
- [ ] Workbench card redesign. Done: screenshot compared with M's.

### Part 10: Review, release, reinstall
- [ ] Independent review, fixes, changelog, overview, release 0.16.0, reinstall, registry question.

## Standardized review

- **Typed bottom line:** executable after sign-off; 0 blocking, 3 must-verify, 2 notes.
- **Goal fidelity:** pass; every research row maps to a part. **Current-system accuracy:** pass; claims tagged with files. **Sequencing:** pass; Part 1 defines the settings every later part reads. **Failure and recovery:** pass; each new daemon feature is opt-in and fails to Paseo's own behaviour. **Verification:** pass; each task has a live or test done condition. **Decision readiness:** the row design (A or B) is M's call.
- **must-verify:** sharp in the macOS app (Part 5); restyle on 0.16 beta (Part 4); HTML tools reach new agents on 0.16 beta (Part 8).
- **note:** about 11,000 ported lines; review effort is large. Part 8 adds an MCP tool and a local server, which the registry PR must state.

## Changes made

- None yet.

## Open questions

- Row design: A (Chat Polish's rows) or B (keep Morphise's)? Recommendation A.
