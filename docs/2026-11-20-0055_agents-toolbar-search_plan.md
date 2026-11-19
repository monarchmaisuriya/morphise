# Consistent Agents controls and visible conversation search

- Date: 2026-11-20 00:55 IST
- Status: done; full because user-facing controls and asynchronous search cross several files
- Repo: morphise; worktree /Users/monarchmaisuriya/Experiment/morphise-agents-toolbar; branch agents-toolbar-search; base 9996dd7
- Subagents: one independent plan checker
- Approval context: M requested minimal mode and then “finish all” after scope was stated. Finish this local implementation/testing; no publication, registry or running-installation changes. [verified: chat 2026-11-20]

## Context and problem

M wants Agents controls to follow Tasks' Filter/Display pattern, chat-content search to behave visibly, quick-add syntax in the placeholder instead of a help row, and two immediate-save help lines removed. Preserve options and save behavior. [verified: M request/screenshots]

## Goals / Non-goals

- Success: one Agents toolbar row with search, Filter, Display and existing settings shortcut (wrap on narrow screens); one inline panel at a time. All six filter categories, layout choices and nine sort choices remain reachable.
- Search: supported match appears; empty query prompts input; pending, unavailable and failure outcomes visible; stale query results never shown. Save toggle failures visible.
- Guardrails: zero removed filtering/sorting features, zero new dependencies, zero writes from rendering or dismissal, zero horizontal page overflow at 360px.
- Check locally 2026-11-20 before completion; if subsequently released, release owner rechecks this on release date. No scheduled deployment.
- Non-goals: add OpenCode log reader, change RPC/schema/provider formats, scan production conversations, redesign cards/settings screens, release/install, alter reminder/checklist persistence or task parsing.

## What is true today

- AgentsBoardView owns search/filter/sort plus separate layout prop. It renders search+conversation toggle+settings, layout segment, then scrolling filter/sort row. [verified: client/agents-board/board.tsx:198-225,418-468]
- Tasks owns Filter/Display panels with PanelBox/PanelRow and toolbar buttons. Reuse their visual pattern, not schema. Existing panel helpers are private to Tasks and serve only layout. [verified: client/board/board.tsx:253-367]
- Task quick-add shows example on an empty-only help row; parser preview/error appears only when typing. [verified: client/board/board.tsx:191-249]
- Requested task help lines are presentation only; reminder picker and checklist perform existing operations. Keep discard warning because it explains already-saved data when closing. [verified: client/board/card-editor.tsx:290-340]
- Search button writes existing device inbox.searchConversations using revision; save result is ignored. Hook returns a Map, hides unavailable results, logs rejected calls, and caps at 50 pages. Only caller is AgentsBoardView. [verified: client/agents-board/board.tsx:249-255,435-441; client/agents-board/conversation-hits.ts:15-51]
- Hook effect cancels future work on cleanup but returns previous hits until effect clears them; query ownership absent in returned value. [verified: conversation-hits.ts:16-22,44-51]
- Daemon resolves session path using its own agent record, never arbitrary app path. Reader supports Claude/Codex only, deliberately avoiding timeline calls that resume closed agents. Preserve this boundary. [verified: server/stats/register.ts:18-45,60-65; server/stats/sessions.ts:113-118]
- Repro twice with actual React hook: dummy RPC returns unavailable reason, hook returns empty Map with no feedback both times. [verified: temporary agents-search-repro.cjs output run 1/run 2]
- Missing: exact runtime failure reported by M beyond reproduced unsupported/error feedback path. Do not claim unsupported provider search works or infer daemon-wide outage from absent logs.

```text
Search text + saved toggle
  -> hook queries logs via unchanged RPC
  -> outcome state with query identity [changed]
  -> filtered cards + visible progress/problems [changed]
```

## Options considered

| Aspect | Rearrange only | Group controls + own search outcomes |
| --- | --- | --- |
| Mechanism | Hide current row behind panels | Same panels, plus explicit lifecycle result in search hook |
| Fit | Reuses controls | Reuses controls/RPC; repairs state owner |
| Gives up | Silent failures remain | No new provider capability, only truthful supported behavior |
| Cost | Small / incomplete | Moderate testing, bounded UI/hook changes |
| Failure | Button still appears inert | Must prevent stale async reports and duplicate save presses |
| Evidence | board.tsx:435-455 | conversation-hits.ts:15-51 |
| Completeness | 5/10 | 9/10 within declared provider scope |

RECOMMENDATION: group controls and own outcomes, because arranging the toolbar alone cannot fix silent searching.

## Decision

- Filter panel: existing Status, Agent, Label, Project, Workspace, Last updated menus as labelled wrapping rows; Clear filters retains current search when clearing filters. Filter button shows active nontext-filter count.
- Display panel: List/Board segment and existing Order menu. Settings icon continues opening full Agents settings, like Tasks' settings shortcut. No settings fields moved or removed.
- Keep conversation mode available as a labelled toggle inside Filter, not an ambiguous icon-only toolbar button. Enabling focuses search; change placeholder to “Search agent details and conversations” while on. Empty input explains that a term is required and mentions Claude/Codex support. Persist existing device flag; disable during save and surface failures.
- Hook returns query-keyed {hits,pending,problems}. Include unavailable/errors and page-limit exhaustion; do not retry or mask errors. Problems are deduplicated user-facing reasons without logging conversation contents. Pending counts queued/active chats; clears when each completes. Match excerpts retained only for current key. Key includes query and target IDs, so a changed query/disabled mode cannot show previous hits before effect cleanup.
- Task placeholder becomes “Fix login p1 @bug #review due:fri tomorrow 9am”; accessibility label stays “Quick add a task”. Remove only empty help row and two exact immediate-save strings; keep parsed preview and discard warning.
- These are reversible UI/state choices under M's delegated “finish all”, not authorization for new provider support. [decided: M, chat 2026-11-20 scope; implementation details proposed within scope]

## Cost and scope

One focused implementation session, assumed 60-90 minutes; no measured comparable hook work available. Cut optional cosmetic tweaks first, never search correctness tests. Blast radius: AgentsBoardView and its private hook; task quick-add/editor presentation; shared visual panel primitive if extracted. No persistence format, RPC, daemon or auth change. Low rollback cost: undo only this task's patch with permission, stored settings still valid.

## Design

Improve existing components instead of rebuilding. Extract Tasks' PanelBox/PanelRow to client/ui/toolbar-panel.tsx so Agents and Tasks share panel rhythm; behavior remains local. Names ToolbarPanel/ToolbarPanelRow describe layout, not task domain. Current dropdowns already own outside dismissal; preserve their PopoverHost rather than add conflicting handlers. Top-level inline Filter/Display panels toggle, do not auto-dismiss on every outside click (same as Tasks).

Design references: orchestrator design.md, design/ADAPTATIONS.md, impeccable/WORKFLOW.md, reference/layout.md and craft-floor.md. Existing Tasks UI is visual authority; use current tokens, preserve native controls and wrapping. No launcher/detector installation.

Checklist: 1 safe defaults: existing flag defaults false, no new config. 2 contracts: hook return private, update only caller; external schemas unchanged. 3 quality: 360/1280px rendered controls + search lifecycle tests. 4 reliability: n/a no service change. 5 threat model: unchanged RPC/path boundary, no new data source; synthetic tests only. 6 views: flow above; deployables unchanged. 7 production: no rollout in scope; errors shown locally. 8 accessibility: keep labels/selected states/focus, target no AA regression; keyboard/overflow smoke test, not certification. 9 experiments: n/a. 10 missing: original symptom exact query/provider unknown, reproduced bounded mechanism stated explicitly. 11 edges: empty/overlong query, rejected/unavailable/partial reads, toggling off/changing query while pending, failed settings save; bound query to RPC's 1000 chars or show validation without sending. 12 leverage: Tasks filter/display, Agents list/board, compact toolbar, missing layout callback, unsupported search, paged search. 13 margins: preserve debounce 200ms, concurrency 2, max pages 50; surface limit, do not imply complete scan. 14 grow: add providers only as separately verified daemon reader work, not UI fallback.

## Risks and mitigations

| Risk | Likelihood / impact | Mitigation | Detection |
| --- | --- | --- | --- |
| Search still cannot read OpenCode | Certain / medium | Explicit support text and unavailable reason | Synthetic unsupported result visible |
| Old hits leak between queries | Medium / medium | Query-keyed return, cleanup suppress late results | Deferred old RPC completes after query change |
| Narrow filters overflow | Medium / low | Wrapping rows using Tasks pattern | 360px measured width |
| Rapid save conflict | Medium / low | Local pending lock plus setting saving flag, error feedback | Delayed/failed toggle save fixture |
| Panel extraction alters Tasks | Low / medium | Same styles/props, smoke regression | Existing task controls still work |

## Acceptance criteria

1. Given Agents, when Filter/Display toggled, then one panel at a time and all prior options reachable; settings button opens agents tab.
2. Given supported conversation-only match, when mode enabled and term typed, then matching card and excerpt shown; fields-only matches remain.
3. Given unavailable/error/limit, when search finishes, then specific outcome shown, not silent no-match. Empty/overlong query makes no RPC.
4. Given query/mode changes during requests, when old request resolves, then no stale excerpt/outcome shown.
5. Given quick-add empty, then exact syntax example is placeholder, no Try row; typing retains parse preview/errors and submission behavior.
6. Given existing task editor, then two requested help lines absent, reminder/checklist save and discard warning unchanged.
7. Given 360px layout, then no toolbar/page overflow; keyboard focus and clear/toggle controls usable.

## Rollout and rollback

Local worktree only, base released v0.46.0. Entry: checked plan and confirmed scope. Gates: red regression, green focused/runtime, full tests/typecheck/diff check. Abort for lost options or save mutations. No version/release/registry work. No data migration, flags or automatic retries. Rollback only this patch with M's permission; default persisted settings still compatible. Retain worktree with uncommitted code until M decides cleanup.

## Parts

| Path | Action | Reason |
| --- | --- | --- |
| client/ui/toolbar-panel.tsx | create | Shared Tasks/Agents panel layout |
| client/agents-board/board.tsx | change | Grouped toolbar, explicit search feedback/settings save |
| client/agents-board/conversation-hits.ts | change | Own pending/problems/query identity |
| client/board/board.tsx | change | Reuse panel primitive, placeholder-only example |
| client/board/card-editor.tsx | change | Remove two exact help rows |
| client/agents-board/conversation-hits.test.ts or browser test | create | Actual hook/state lifecycle proof with existing opt-in runtime |
| OVERVIEW.md, this plan, RCA | change/create | Behavior and evidence |

### Search outcomes and regression

- [x] Actual-hook regression covers supported hit, unavailable reason, rejected RPC, pending, query switch, disabled/empty/overlong. Seen red on pending undefined, then green. Existing 2-worker/50-page limits preserved; limit feedback read in source, not exhaustively runtime-tested.
- [x] Implement lifecycle state and caller display. Controlled deferred responses prove no stale result; rendered fixture proves successful hit, unavailable/error and failed settings-save feedback.

### Toolbar and copy

- [x] Shared panel and Agents Filter/Display. All six filter categories and nine sort choices checked in real rendered component with synthetic host; settings opens agents tab; 360px no page overflow. List/Board remains original segmented control in Display; no native-device render or full accessibility certification claimed.
- [x] Placeholder/help cleanup and OVERVIEW. Exact placeholder and absent help verified; synthetic quick add, reminder and checklist saves pass; discard warning remains.
- [x] Final typecheck, full suite, diff check, screenshots. Verification below; no installation writes.

## Independent check

partial independent: present as is, 1 applied not re-checked. Reviewer passed criteria 1-8 and 10-13; must-verify criterion 9 asked for actual-hook runtime path. Fix: existing /Users/monarchmaisuriya/Experiment/paseo/node_modules/react-test-renderer and react are installed; `node /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/agents-search-repro.cjs` mounted the actual hook twice successfully. Use this explicit installed runtime for opt-in regression tests via MORPHISE_REACT_RUNTIME; no dependency addition. Review partial because reviewer's final read batch had tool argument errors; parent read RPC schema/shared matching/caller inventory directly. Scope and build approved by M's repeated “finish all” after scope/diagnosis messages; no new provider claim.

## Changes made

2026-11-20: implemented hook-owned query outcomes, inline Filter/Display with shared panel primitives, requested task copy cleanup and documentation. No external schema or provider reader changes.

Verification on packaged v0.47.0:
- `npm run typecheck`: PASS.
- `MORPHISE_REACT_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules npm test -- client/agents-board/conversation-hits.test.ts client/agents-board/data.test.ts shared/agents-board.test.ts`: PASS, 61 tests.
- `npm test`: PASS, 1288 passed, 24 skipped; 1 new opt-in hook test executed separately above, 23 prior default skips. Log: approved temporary folder agents-toolbar-full-tests.log.
- `node <approved-temp>/agents-toolbar-ui.cjs`: PASS, rendered toolbar/filter/sort/settings/search hit/unavailable/error/failed save/360px overflow.
- `RUN_CHECKS=1 node <approved-temp>/agents-task-copy.cjs`: PASS, syntax placeholder/no help/quick-add/reminder/checklist persistence.
- `git diff --check`: PASS.

Test harness errors were reported and fixed: wrong child-process argv loaded runner recursively; missing host adapters prevented fixture bundle; menu queried before render and wrong role; task-created row had wrong assumed role, replaced with actual task-store assertion. None counted as a behavior regression. No sleeps/retries added to proving tests. Installed react-test-renderer emits its deprecation warning; this is optional test tooling, no production dependency added.

M subsequently explicitly authorized push/merge/release/registry PR/reinstall. Packaging v0.47.0 included. Running installation remains read-only under standing rule; final command is provided to M. Release identifiers appended after publication.

## Open questions

None for bounded implementation. Exact original search failure remains unverified; do not claim all failures repaired. Additional provider support would require new scope from M.
