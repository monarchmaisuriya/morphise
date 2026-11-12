# Better Paseo parity: every feature and option, against Morphise

- Date: 2026-11-12 17:25
- Status: presented
- Mode: find out (then explore options for the plan)
- Repos: morphise   Folders: shared/, client/, server/
- Question / problem: Which customisation options and features does Better Paseo have that Morphise lacks, and which of them can Morphise add within M's standing rules?

## Research: what Better Paseo offers that Morphise does not

- **Bottom line:** Better Paseo has about 55 user settings in three records, plus a large agents board and timeline feature set. Morphise already covers about a third of the chat options, many only partly. The largest gaps are an agents board with per-card field switches, hover previews, number-precise sizes, turn details, and table copying. Confidence: high for the lists (read from source), medium for effort.
- **Where we are:** feeds the plan `docs/2026-11-12-1725_better-paseo-parity_plan.md`. About 40 minutes spent. In scope: Better Paseo at `d6c90498` (the registry pins `4309c1c6fa23`, one commit behind) and Morphise at `34e587e` (v0.18.2).
- **Need from M:** the scope decisions in the plan's briefing.

### Sources and method

- Better Paseo source, cloned to scratch: `shared/preferences-settings.ts` (chat record `presentation`), `shared/tasks-settings.ts` (record `tasks`), `shared/title-generation.ts` (record `title-generation`), and `README.md` sections Timeline, Block details, Tasks board, Settings [primary, verified by reading].
- Better Paseo's catalog page, https://paseo.sh/plugins/roundreddot/better-paseo [primary].
- License: MIT, copyright 2026 ABorakati [verified: `LICENSE`, `package.json` `"license": "MIT"`]. Porting with attribution in NOTICE.md is allowed, as with Chat Polish.
- Morphise: `shared/profile.ts:148-231, 251-318`, `shared/polish/prefs.ts:18-48`, `shared/inbox.ts:190-205`, `client/polish/i18n.ts:12-21` [verified by reading].

Legend: **has** = same option or better; **partial** = exists with fewer choices or on fewer platforms; **missing** = nothing equivalent; **blocked** = conflicts with a rule M set.

### 1. Chat presentation options (Better Paseo record `presentation`)

| # | Better Paseo option | Values (default first) | Morphise today | Status |
| --- | --- | --- | --- | --- |
| 1 | Enable plugin chat | on, off | `chat.enabled` | has |
| 2 | Language | follow Paseo, English, 简体中文 | follows Paseo only, no override (`client/polish/i18n.ts:12`) | partial; out of scope (M removed it) |
| 3 | Accent colour | host, jade, violet, amber, rose, zinc, midnight, claude, ghostty, pure black | theme, jade, violet, amber, rose, any `#hex` (`profile.ts` `chat.accent`) | partial: 5 named presets missing |
| 4 | Interface font | Paseo's, Inter, system | free-text family, web only (`chat.web.uiFont`) | partial |
| 5 | Inline code colour on phones | grey, blue, violet, green, coral, jade, amber, midnight, claude, pure black | none | missing |
| 6 | Monospace font + custom family | Paseo's, custom (up to 200 chars) | free-text family, web only (`chat.web.codeFont`) | partial: no phone faces |
| 7 | Code font size | Paseo's, or 10–22 px | small, medium, large (`chat.codeSize`) | partial |
| 8 | Block text size (rows, thoughts, checklists, notices) | 13, 9–20 px | small, medium, large (`chat.textSize`) | partial |
| 9 | Row icons and labels | icon, label, both | `chat.labels` icon, label, both | has |
| 10 | File paths | relative, absolute | `chat.paths` | has |
| 11 | Open failed calls | off, on | `polish.failedOpen` | has |
| 12 | Tight rows / tight reply | on, on | `chat.density` compact, normal, spacious | has (one control) |
| 13 | Hover previews | on, off | none | missing |
| 14 | Hover delay | 1 s, 0–10 s in tenths | none | missing |
| 15 | Preview wrap lines | on, off | `chat.wrap` (rows, not previews) | partial |
| 16 | Preview line numbers | on, off | `polish.diffLineNumbers` (diffs only) | partial |
| 17 | Alternating line shading | on, off | none | missing |
| 18 | Block details panel (drawer, floating or side panel; ← → steps blocks; W R F keys) | on, off | Details opens Paseo's own details tab for one tool | partial |
| 19 | Details text size | 14, 12–26 | none | missing |
| 20 | Pinch text size in the phone drawer | stored, no control | none | missing |
| 21 | Enhanced prompt bubble (copy always shown, turn tokens) | off, on | none | **blocked**: redraws prompts (M: never redraw prompts; keep Fork and Copy) |
| 22 | Plugin Markdown for replies | on, off | Paseo draws replies; Morphise restyles them with CSS | **blocked** as a redraw; the look itself is reachable with CSS |
| 23 | Markdown style | document, compact, terminal | per-element rich text variants (`polish.richText`), restyle only | partial: no compact or terminal preset |
| 24 | Selection toolbar | on, off | `polish.selection` + action list + style + position | has (more) |
| 25 | Automatic update check | on, off | manual check and install (Update section) | partial [unverified: whether Morphise checks on start] |

### 2. Timeline features (not options)

| Better Paseo feature | Morphise today | Status |
| --- | --- | --- |
| Shell rows draw the program (101 icons, 209 programs); MCP rows the service (75 services) | program icon rules in `client/polish/rows/model.ts` (count not measured) | partial [unverified: coverage] |
| Turn footer: provider mark, model, thinking level, duration; hover for a Turn details table (start, end, tokens in, cached, out) | turn recap (files changed, failed commands) | missing; token data exists in Paseo's `AgentUsage` [verified: `@getpaseo/protocol` agent-types.d.ts:175] but plugin access is [unverified] |
| Tables: copy menu (Markdown), cell and range selection, Add to chat | table restyle only | missing |
| Code fence preview window (rendered or raw, wrap, copy) | HTML pages (`polish.html`) for HTML only | partial |
| Image viewer: zoom 0.25–8×, pan, open in default app | image stacks and lightbox (`client/polish/media`) | partial [unverified: zoom range] |
| Structured question transcripts (choices, answers) | none | missing |
| System notices as cards | `chat.notices` | has |
| Live checklist panel with progress ring | steps card | has (different form) |
| Reasoning split on headings; streaming row previews the current heading | `polish.thoughtFirstLine` | partial |
| Settings page: Desktop / Mobile preview switch | previews at desktop width only | missing |

### 3. Agents board (Better Paseo record `tasks`)

Better Paseo's board lists every agent on the host in lanes: waiting, running, to review, done, archived. Morphise's nearest pieces are the Workbench Waiting list (`shared/inbox.ts`) and the status-grouped sidebar view (`profile.ts` `sidebar.view`). Morphise's Board is a kanban of the user's own tasks, a different thing.

| Better Paseo option or feature | Values (default first) | Morphise today | Status |
| --- | --- | --- | --- |
| Enable the board | on, off | Workbench always on | partial |
| Card density preset | standard, minimal, full, custom | none | missing |
| 16 card field switches | provider, model, thinking, project, project icon, workspace, branch, Git status, folder, full path, labels, linked PR, timer, context ring, plan, subtasks | Waiting card: workspace line, preview line (`inbox.ts` `cardWorkspace`, `cardPreview`) | partial: 2 of 16 |
| Labels shown | 2, 1, 3, all | none | missing |
| Done lane window | 7 days, 24 h, all | none | missing |
| Lane width | default, narrow, wide | none | missing |
| Show subtasks (fold into parent when off) | on, off | sidebar `showSubAgents`, `singleSubAgent` | partial |
| Show archived lane | on, off | none | missing |
| Show groups with no tasks | on, off | none | missing |
| Sidebar entry count | all, waiting only, hidden | sidebar `counts` on, off | partial |
| Minimal cards on phones | off, on | none | missing |
| Card actions: Stop, Mark as read, Archive, Unarchive, Allow or Deny a permission | — | Waiting detail: Open chat, Bookmark answer, Clear, Allow and Deny, Reply (`client/inbox.tsx:281, 297-338`) | partial: no Stop, Archive, Unarchive or Mark as read; the public SDK has Archive but not Stop, Unarchive or Mark as read (`@getpaseo/client/dist/index.d.ts:321-388`) |
| Filters: agent, label, project, workspace, search; sort by 9 keys | — | sidebar status filters and sort | partial |
| Keyboard: J/K, H/L, Enter, /, Esc | — | none | missing |
| Card details: first prompt, last reply, subtasks, properties, usage chart, activity | — | Waiting detail shows the chat's last answer (`client/inbox.tsx:183-201`) | partial |
| Automatic titles: provider, model, thinking, prompt, after first reply | off by default | none | missing; runs a helper agent on the user's login, so it costs tokens |

### What this means for our code

- Options 1–17 and 23 are settings plus CSS or row code Morphise already owns (`shared/polish/prefs.ts`, `client/polish/rows/row.tsx`, `client/polish/web/restyle-css.ts`) [inferred from the files above].
- Hover previews and table copying are new web-only parts (`client/polish/web/`), like the selection bar [inferred].
- The agents board is the largest piece: a new Workbench view over Paseo's agent list (`useWorkspaces`, `useAgent`), with lanes from the same status rules the sidebar uses (`shared/chat-status.ts`) [inferred].
- Items 21 and 22 conflict with M's rule to never redraw prompts or replies; they stay out unless M changes that rule.

### Confidence and gaps

| Claim | Tag | Source tier | What would raise confidence |
| --- | --- | --- | --- |
| Better Paseo's option lists | verified | primary (source) | none needed |
| Morphise's option lists | verified | primary (source) | none needed |
| Plugins can read per-turn token usage | verified (review) | primary (SDK types) | `useAgent` has no usage; the agent handle's `lastUsage` after `refresh()` does (`@getpaseo/client/dist/index.d.ts:338`); per turn needs server turn hooks |
| Morphise image zoom range, program icon count, update check on start | unverified | — | read `client/polish/media/views.tsx`, `rows/model.ts`, `server/polish/update.ts` |

### Sources

- Better Paseo catalog page: https://paseo.sh/plugins/roundreddot/better-paseo
- Better Paseo source: https://github.com/RoundRedDot/better-paseo (read at `d6c90498`)

## Standardized review

Reviewed against the research rubric, then refuted by an independent reviewer (see the plan's review section).

- **Question and decision fit:** pass. Question, decision and scope are stated.
- **Method and reproducibility:** pass. File paths and commits are named.
- **Source quality and traceability:** pass. Every Better Paseo claim comes from its own source; every Morphise claim cites a file.
- **Uncertainty:** pass. Four claims are marked unverified, each with the check that settles it.
- **Coverage:** note. Better Paseo's phone-only gestures (drawer, pinch) are listed but not costed, since the test daemon has no phone.

- **Review corrections applied:** two status rows were wrong (card actions, card details) and one citation was off; all three are fixed above.

Bottom line: 0 blocking, 2 must-verify (fixed), 1 note.
