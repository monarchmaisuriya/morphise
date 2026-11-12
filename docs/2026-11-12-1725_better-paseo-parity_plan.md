# Better Paseo parity: more options, an agents board, previews and copying (Morphise 0.19.0)

- Date: 2026-11-12 17:25
- Status: done (0.19.0); approved by M ("build reveiw fix release reinstall"), recommended answers to questions 1-4
- Repos: morphise   Folders: shared/, client/, server/   Files: shared/polish/prefs.ts, shared/polish/i18n.ts, shared/agents-board.ts (new), client/forms/**, client/polish/rows/**, client/polish/web/hover-previews.ts (new), client/polish/web/tables.ts (new), client/agents-board/** (new), client/workbench.tsx, client/chat-rows.tsx, server/turn-usage.ts (new), server/agent-actions.ts (new, only if M picks the CLI route), server/titles.ts (new, only if M approves titles), NOTICE.md, OVERVIEW.md, CHANGELOG.md
- Subagents: Part 1 first, alone (it owns every new settings key and default). Then parts 2, 4 and 5 in parallel, each owning only its own new folder and its own settings controls file. Parts 3, 6 and 7 by the integrator.

## Context and problem

M finds Morphise's customisation thin next to Better Paseo (roundreddot/better-paseo, MIT). The research file `docs/2026-11-12-1725_better-paseo-parity_research.md` lists every Better Paseo option and feature against Morphise: about 30 are missing or partial, in chat presentation and on the agents board.

## Goals / Non-goals

Goals:
- Every Better Paseo chat option Morphise lacks or only partly has (research table 1), except those named in the non-goals.
- An agents board in the Workbench with Better Paseo's card fields, density presets and board options (research table 3), and every card action the public SDK or the public CLI allows.
- Hover previews, table copying, and turn details with tokens (research table 2).
- Every existing surface looks and behaves as in 0.18 until the user changes an option. New surfaces (the Agents view) are additive.
- Chinese strings for all new text, as Morphise already ships English and Chinese.

Non-goals (and why):
- Redrawing prompts or replies (Better Paseo's enhanced prompt bubble and plugin Markdown): M's rule that Paseo draws them, so Fork and Copy stay.
- Better Paseo's own block-details drawer, its details text size and phone pinch sizing (research items 18–20): Morphise uses Paseo's own details tab; a second details system would duplicate it.
- Read-only cards for sub-agents a provider runs itself (Claude Code's Agent tool): Better Paseo reads them through Paseo's internal daemon client, which M's rule excludes.
- Fetching the Inter font from the daemon.
- A language override (M, 2026-11-12: removed). Morphise keeps following Paseo's own language.

Invariant (M, 2026-11-12): nothing in this plan removes, hides or replaces Paseo's native Fork, on prompts or on the turn footer. Morphise never redraws prompts, replies or the turn footer; turn details go in Morphise's own recap row, and table and hover parts only add to Paseo's DOM, never take from it.

## What is true today

- Chat options live in `profile.chat` (`shared/profile.ts:272-314`) and `profile.chat.polish` (`shared/polish/prefs.ts:26-70`, a strict object), with `POLISH_DEFAULTS` (`prefs.ts:75`) as the single default source [verified].
- Text and code sizes are three steps, applied as offsets from Paseo's own sizes (`TEXT_STEP`, `CODE_STEP` at `client/polish/rows/row.tsx:43-44`) [verified].
- The language follows Paseo with no override [verified: `client/polish/i18n.ts:12-21`]; English and Chinese strings exist [verified: `shared/polish/i18n.ts:10`].
- The Workbench Waiting card has two field switches (`shared/inbox.ts:199-201`). Its detail has Open chat, Bookmark answer, Clear, permission Allow and Deny through `respondToPermission`, a Reply box, and the chat's last answer [verified: `client/inbox.tsx:183-201, 281, 297-338`]. Inbox settings are per device (`inbox.ts:192`) [verified by review].
- Status words come from `shared/chat-status.ts`; the sidebar's status toggles are in `client/sidebar-view.tsx:1121` [verified by review].
- An unparseable profile switches off every Morphise setting [verified by review: `client/profile-store.ts:46`].
- Agent handle in the public SDK [verified: `@getpaseo/client/dist/index.d.ts:321-388`]:

| Action | Public SDK | Public CLI | Better Paseo uses |
| --- | --- | --- | --- |
| Open chat | yes (navigation) | `paseo agent open` | SDK |
| Archive | yes, `archive()` | `paseo agent archive` | SDK |
| Allow / Deny permission | yes, `respondToPermission()` | — | SDK |
| Stop | no (`reload()` reopens the session, not a clean stop) | yes, `paseo agent stop` | CLI |
| Rename | no | yes, `paseo agent update --name` | internal client |
| Unarchive | no | none listed; `reload` may restore [unverified] | CLI `reload` |
| Mark as read | no (opening the chat clears it) | none | internal client |
| Token usage | `lastUsage` after `refresh()` or `subscribe()`; not in `useAgent` | `paseo agent inspect` | server turn hooks |

## Options considered

| | A. Port Better Paseo's parts with attribution | B. Rebuild each idea on Morphise's own parts | C. Install Better Paseo beside Morphise |
| --- | --- | --- | --- |
| How it works | Copy its code, adapt it | Same behaviour, written on Morphise's `Row`, settings and previews | Two plugins redraw the timeline |
| Fit | Assumes its own settings, renderers, reply redraw and internal client | Reuses existing parts; one settings page | Both register tool-call renderers; they fight |
| Cost | Medium code, high rewiring | Medium to high | None |
| Fails when | Its reply redraw or internal client leaks in (M's rules) | Small behaviour differences | Always, for the timeline |
| Completeness | 7/10 | 9/10 | 3/10 |

RECOMMENDATION: B, porting small self-contained pieces with credit in NOTICE.md (program and MCP icon maps, table range logic, turn-usage hook pattern), because Morphise's parts exist and Better Paseo's code assumes things M's rules exclude.

## Decision

Build the missing options and features as Morphise parts (B), in 7 parts. The card actions the SDK lacks (Stop, Rename, maybe Unarchive) depend on M's choice of a CLI route (Question 1). Automatic titles depend on Question 3.

## Design

### Part 1: Settings keys and chat look options (runs first, alone)

Owns every new `chat.polish` key and default, including those parts 2 and 4 use. Each key is optional, written only when changed, and its default in `POLISH_DEFAULTS` keeps 0.18 behaviour.

| Key | Values (default first) | Missing or out of range means |
| --- | --- | --- |
| `chat.accent` presets | add `zinc`, `midnight`, `claude`, `ghostty`, `black` | theme |
| `uiFontChoice` | `paseo`, `system`, `custom` (uses `chat.web.uiFont`) | Paseo's |
| `inlineCodeColor` (phones) | `paseo`, grey, blue, violet, green, coral, jade, amber, midnight, claude, black | Paseo's |
| `codePx` | `null`, 10–22 | follow `codeSize` (absolute px when set) |
| `textPx` | `null`, 9–20 | follow `textSize` (absolute px when set) |
| `markdownStyle` (restyle on) | `paseo`, `document`, `compact`, `terminal` (CSS only; replies stay Paseo's) | Paseo's |
| `hoverPreviews` | off, on | off |
| `hoverDelay` | 1.0, 0–10 in tenths | 1.0 |
| `previewWrap`, `previewLineNumbers`, `previewStripes` | on, on, off | as listed |
| `tableCopy` | off, on | off (Paseo's tables unchanged) |

Controls go on Chat, Messages and Look, with previews.

### Part 2: Hover previews (web, `client/polish/web/hover-previews.ts`)

Resting on a collapsed Morphise tool row, thought row or path opens a floating, scrollable preview of its body after `hoverDelay`. It closes on pointer leave, scroll and Escape, in the native popover layer Morphise already uses. Off by default.

### Part 3: Turn details on the recap (server + client)

- Server (`server/turn-usage.ts`): `agent.turn.before` records the start; `agent.turn.after` refreshes the agent and stores `lastUsage` (input, cached, output tokens, cost, context) with model, thinking level, start and end in the recap row data. Pattern credited to Better Paseo's `server/turn-usage.ts`.
- Client: the opened recap shows these as one details line. Turns before the update have none.

### Part 4: Tables (web, `client/polish/web/tables.ts`)

When `tableCopy` is on: a copy button at a table's top-left (Markdown); double-click selects a cell; drag selects a range; Cmd or Ctrl adds ranges; on release a menu offers Copy (text for one cell, a Markdown table for several) and Add to chat (the selection bar's composer path).

### Part 5: Agents board (Workbench view "Agents")

Lanes and their statuses (from `shared/chat-status.ts`):

| Lane | Agents in it |
| --- | --- |
| Waiting | needs_input (permission or question) |
| Running | running, and a parent whose sub-agent still runs or waits |
| To review | attention (finished, unseen) and failed |
| Done | done, within the done window |
| Archived | archived agents within the done window, read with `paseo.agents.list` including archived (`useAgents` leaves them out) |

Settings record `agents-board` (scope per Question 4). Defaults keep the view on, since it is a new view and changes nothing existing.

| Setting | Values (default first) |
| --- | --- |
| Show the Agents view | on, off |
| Card density | standard, minimal, full, custom (editing a field makes it custom) |
| Card fields (16) | provider, model, thinking, project, project icon, workspace, branch, Git status, folder, full path, labels, linked PR, timer, context ring, plan, subtasks |
| Labels shown | 2, 1, 3, all |
| Done window | 7 days, 24 hours, all |
| Lane width | default, narrow, wide |
| Show subtasks | on, off |
| Show archived lane | on, off |
| Show empty groups | on, off |
| Minimal cards on phones | off, on |

The context ring reads `lastUsage`, refreshed only for cards on screen, at most once a minute each.

Card actions: Open, Archive, Allow and Deny through the SDK; Stop and Rename through the CLI route if M picks it (Question 1); Unarchive only if `paseo agent reload` is confirmed to restore an archived agent on the test daemon; no Mark as read. A right-click or long-press menu copies session ID, title, workspace and project. Filters by provider, label, project, workspace, and a search box; sort by workspace, project, branch, folder, title, created, updated, context, duration; keys J/K, H/L, Enter, /, Esc. Details pane: first prompt, last reply, subtasks, properties, usage, activity.

### Part 6: Titles (only if M approves, Question 3)

A card menu action "Generate a title" (manual), and an optional "after the first reply" switch, off by default. A helper agent with a chosen provider, model and prompt writes a title of at most 60 characters, applied with `paseo agent update --name`. It runs on the user's provider login and costs tokens. A title the user set is not replaced.

### Part 7: Settings previews at phone width

A Desktop / Phone switch above each preview that draws it at 390 pt with the compact layout.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation | Noticed by |
| --- | --- | --- | --- | --- |
| The CLI route fails (CLI missing, other daemon home) | medium | Stop and Rename fail | Find the CLI as `server/polish/update.ts` does; show the CLI's error as a toast; buttons hidden when no CLI | action test on the test daemon |
| `reload` does not unarchive, or restarts a running agent | medium | Wrong action | Gate on the test daemon with a scratch agent of a non-Claude provider; leave Unarchive out if unsure | Part 5 gate |
| Agents board slow with many agents | medium | Laggy Workbench | Done window 7 days; subscriptions only while the view is open; context refresh only for visible cards | live count on the test daemon |
| Hover previews collide with Paseo's own hover cards | low | Two popovers | Only on Morphise rows and paths | live check |
| Downgrade to 0.18 with 0.19 keys switches off every setting | low (only if M downgrades) | All Morphise settings off until reset | Question 2 offers per-key tolerance | settings page shows "invalid" |
| Titles spend tokens | high when on | Cost | Off by default; manual action first; settings text names the cost | settings copy |

## Acceptance criteria

- Given each new option, when it changes, then its preview changes before saving completes; and with no option changed, every existing surface matches 0.18 (a test compares `POLISH_DEFAULTS` to today's values).
- Given the Agents view, when an agent goes from running to needing a permission, then its card moves from Running to Waiting within 2 s on the test daemon.
- Given each of the 16 card field switches, when it is turned off in settings, then the settings preview card no longer shows that field.
- Given `tableCopy` on and a 3×3 table, when the user drags across 2×2 cells and picks Copy, then the clipboard holds a Markdown table of those cells under the header row.
- Given hover previews on with a 1 s delay, when the pointer rests on a collapsed tool row, then a preview with its body appears after 1 s and closes on Escape.
- Given a finished turn after the update, when the recap opens, then it shows model, duration and token counts.
- Given every new option turned on at once, when a chat with a finished turn is shown, then Paseo's Fork button is present on the prompt and on the turn footer (checked live on the test daemon and in the restyle CSS: no rule hides a Fork control).

## Rollout and rollback

One release, 0.19.0, every new option at today's value by default. Rollback: `paseo plugin update morphise --ref v0.18.2`. If any 0.19 option was changed, 0.18 reads the whole profile as invalid until those options are reset (see Question 2); the `agents-board` record is separate and ignored by 0.18.

## Parts

### Part 1: Settings keys and chat look options
- [ ] All new keys, defaults, clamping, Chinese strings, tests. Done: tests show defaults equal 0.18 values and out-of-range numbers fall back.
- [ ] Controls and previews on Chat, Messages, Look. Done: each control changes its preview (checked in the test daemon's settings page).

### Part 2: Hover previews
- [ ] Web part and controls. Done: in the Chat preview, resting 1 s on the Ran row opens its output; Escape closes it.

### Part 3: Turn details
- [ ] Server turn hooks storing usage in the recap. Done: a unit test with a fake agent handle stores tokens and model.
- [ ] Client details line. Done: the Chat preview recap shows a sample details line.

### Part 4: Tables
- [ ] Copy button, cell and range selection, menu. Done: the acceptance check above on a table in the Messages preview.

### Part 5: Agents board
- [ ] Gate: Unarchive through `reload` on the test daemon with a non-Claude scratch agent. Done: a yes or no with the command output.
- [ ] Settings record, lanes, cards, field switches, presets. Done: the field-switch acceptance check in the settings preview.
- [ ] Actions, menu, filters, search, sort, keys. Done: on the test daemon, Archive moves a card to Archived, and J/K moves focus.
- [ ] Details pane. Done: opening a card shows its first prompt and last reply.

### Part 6: Titles (only with approval)
- [ ] Manual action and optional switch. Done: a unit test applies a generated title through a fake CLI; no Claude started on M's login.

### Part 7: Phone-width previews
- [ ] Switch above each preview. Done: each preview draws at 390 pt.

### Before release: Fork check
- [ ] With every new option on, Paseo's Fork is present on prompts and turn footers. Done: the Fork acceptance check passes, and a grep of the restyle CSS and web parts finds no rule that hides or removes a Fork control.

## Standardized review

Independent reviewer (fresh agent, given only the files), then each blocking and must-verify item checked against the source by the integrator.

| Finding | Severity | Outcome |
| --- | --- | --- |
| Card actions and titles rely on SDK methods that do not exist (Stop, Unarchive, Mark as read, Rename) | blocking | stands [verified: `@getpaseo/client/dist/index.d.ts:321-388`]; plan now lists each action's route; CLI route is Question 1 |
| Table copy defaulted on, changing Paseo's look | blocking | stands; default now off |
| Parallel builders would collide on `prefs.ts` and settings forms | blocking | stands; Part 1 now owns every key and runs first |
| Wrong line citations (6) | must-verify | fixed in this file |
| Inbox already has Allow/Deny, Reply, Bookmark and last answer | must-verify | stands [verified: `client/inbox.tsx:304`]; research and plan corrected |
| Turn details need a server part | must-verify | stands; Part 3 adds `server/turn-usage.ts` [verified: `agent.turn.before/after` in `plugin/dist/server/lifecycle.d.ts:99-103`] |
| Lane mapping and archived source undefined | must-verify | fixed: lane table and `paseo.agents.list` with archived |
| Goals and non-goals contradicted | must-verify | fixed: non-goals list all exclusions with reasons |
| Downgrade switches off all settings | note | Question 2 |
| Settings scope, text size meaning, title trigger | note | Questions 4 and 3; text size defined as absolute px when set |
| Missed: card copy menu, rename, Chinese strings, `black` inline colour | note | added |
| "Live check" done conditions not observable | note | replaced with named checks |

Bottom line: 3 blocking found and resolved in the plan, 5 must-verify resolved, 4 notes addressed or turned into questions. Remaining decisions are M's (Questions 1–4).

## Changes made

- Part 1: new `chat.polish` keys with per-key tolerance; exact sizes; accent presets; system font and reading styles (CSS). Inline code colour on phones dropped: Paseo draws replies there and plugins cannot restyle them.
- Part 2: hover previews (builder); scroll now moves the preview with its row and closes it only once the row leaves the window (review).
- Part 3: turn details stored by the daemon at the end of a turn and shown in the opened recap.
- Part 4: table copy and cell selection (builder); the menu and button follow their table on scroll (review).
- Part 5: Agents view (builder); older pages past the daemon's 200-agent page are read too (review).
- Part 6: manual "Generate a title" only. Revised from the plan: no automatic switch, because Paseo does not mark which titles the user set. The helper runs in an empty temporary folder, not the project (review).
- Part 7: Desktop / Phone switch on every settings preview.
- Review: 0 blocking, 2 must-verify and 5 notes, all fixed; 593 tests pass.

## Open questions

1. Stop and Rename through the public Paseo CLI (a server RPC that runs `paseo agent stop` / `update --name`), or leave them out?
2. Make `chat.polish` tolerate unknown or invalid keys one by one (as Better Paseo does), so a downgrade keeps the rest of the settings?
3. Titles: include (manual action, automatic switch off), or leave out?
4. Agents board settings: shared by every device on the host, or per device like the Inbox?
