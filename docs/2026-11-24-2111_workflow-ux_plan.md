# Workflow clarity and safe editing

- Date: 2026-11-24 21:11 IST
- Status: implemented and verified locally; approved selected scope by M's explicit seven-item implementation request; full because draft preservation/launch UX/shared settings navigation
- Branch: workspace-checkpoints-calendar-quota; builds on current uncommitted feature work, preserved intact

## Context and problem

M requested checkpoint dirty protection/comparison; calendar day grouping, differentiated empty states, coverage/freshness; pre-start Dispatch quota and exact launch summary; settings scope/search; consistent status tooltips. [verified: M chat 2026-11-24]

## Goals / Non-goals

Success: navigation retains checkpoint draft in same plugin client, no dirty reload overwrite, explicit conflict comparison; local-day split/grouped calendar and truthful snapshot freshness; quota visible before Start without weakening preflight; immutable launch summary; plugin settings directory/search with accurate scope labels; main/nested tooltip explains known state/reason/time. Guardrails zero automatic overwrite/launch, no new provider credentials, no host DOM search/filter, no invented state-entered timestamps. No release/install/new settings backend or pixel certification.

## What is true today

Checkpoint currently keeps local fields only and reload overwrites; CAS rejects stale saves. [verified: client/checkpoint-panel.tsx]
Calendar currently lists all interval cards flat and displays old data while a new range loads; running totals use Date.now at render rather than fetch time. [verified: client/work-calendar.tsx]
Dispatch checks quota only in start, binds model/root/project/mode/where/prompts and cancels attempt IDs. [verified: client/dispatch.tsx:128-242]
Settings tabs register individually in index.client.tsx:315-335; profile/device/host fields mix within pages, so page labels must acknowledge mixed scope. Forms share a draft. [verified: client/forms/fields.tsx:346 onward; client/device-choices.ts; index.client.tsx]
Workspace snapshots carry statusEnteredAt; agent snapshots have updated/lastActivity/attentionReason but no stateEnteredAt in installed contract. Existing attention list has permission/error data. [verified: plugin dist/contracts.d.ts:47,54-76; client/attention.ts:11-25; client/sidebar-view.tsx:824-838]

## Options considered

| Aspect | Small owning-surface refinements (chosen) | Global form/host redesign |
| --- | --- | --- |
| How | Draft owner, grouping helpers, preflight display, settings directory, tooltip formatter | New global navigation/DOM instrumentation |
| Fit | Existing SDK forms/kit/stores | Larger unstable host dependencies |
| Gives up | Settings search initially curated page/topic index, no arbitrary value search | Scope/safety/reversibility |
| Cost/risk | Moderate additive UI and tests | Broad regression risk |
| Completeness | 9/10 stated scope, limits explicit | 5/10 unbounded |

RECOMMENDATION: owning-surface refinements, no host redesign.

## Decision

Checkpoint factory owns per-workspace session drafts and baseline revision. Save clears only successful current draft; new panel read does not rebase stale draft. Conflict fetches latest separately, shows four-field side-by-side/stacked comparison; Keep my draft rebases only explicitly, Use latest discards only explicitly. Dirty reload opens comparison, not blind overwrite. No unload writes; drafts not persisted to browser storage, clearly label session-only protection. [decided: selected outcome M, details delegated within requested implementation]

Calendar pure day splitting uses local midnight Date.setDate, clips to range/snapshot. Fetch result records fetchedAt/from/to; hide mismatched old range; uncertain never enters totals. Coverage disclosure compact with recording start/pruned/uncertain count, last refreshed always visible. Empty cases no-match/no-recorded/before recording/error differentiated.

Dispatch background preview keyed by provider, one bounded usage lookup on selection, no poll. Separate preview async identity so old result cannot replace fresh preflight. Launch always rechecks. Warning stores exact immutable human summary matching its key: model, project, root, worktree/directory, mode, prompts. Summary never silently updates under warning; changed choices invalidate. No capacity promise.

Settings search: shared wrapper on each registered plugin tab plus a Search page, curated topic→existing screen directory, live result count/no match. Open via client.openSettings; shared drafts unchanged. Label scope on every wrapped page using accurate mixed-scope copy, not all settings falsely profile. Include Quick Chat in directory (already separately registered). No search of secret values or host-wide controls. Status tooltip formatter uses state-specific meaning, supplied reason or unavailable, valid state-entry time relative to shared sidebar clock; attach hover ref and accessibility label. Known manual status override cannot borrow host state time; mark time unavailable when effective differs. Native tooltip not promised; accessibility text retained. No extra per-marker timers.

## Cost and scope

Estimate1-3 days (unverified planning estimate); same branch/current code, no dependency. Main risks conflict rebase/old quota response and timestamp semantics. Reversible source. Cut cosmetic changes, not safe drafts/snapshot binding. No state schema migration except no new saved records here. Existing uncommitted files not removed.

## Design

Reuse kit tokens, fields, buttons and native plugin settings surfaces; stacked comparisons on narrow screens; explicit loading/error/conflict/empty states. Design references orchestrator design.md/ADAPTATIONS and impeccable craft-floor. No new animation. Keyboard labelled controls; conflict actions clearly destructive versus rebase. Responsive360/700/1440. No auth/network except existing provider lookup/read checkpoint; no retries/inference. Search no destructive actions. Existing checkpoint tool/store remain unchanged.

## Risks and mitigations

| Risk | Consequence | Check |
| --- | --- | --- |
| Draft rebased by read | Lost conflict safety | Save stale draft after navigation must reject |
| User reloads dirty form | Lost edit | Compare before replacement |
| Calendar midnight/DST | Wrong group/duration | Local-day segmentation tests |
| Late quota preview | Misleading confirmation | Independent request identity and immutable summary |
| Settings scope oversimplified | Wrong propagation assumption | Mixed page descriptions, current source map |
| Wrong time in state | False precision | Missing/manual override -> unavailable |

## Acceptance criteria

1. Checkpoint edit/navigate/remount retains draft+baseline; dirty reload compares; conflict keep/rebase explicit; save state and disabled clean save truthful.
2. Cross-midnight intervals split by day, uncertain excluded, snapshot time fixed; empty and coverage states distinct; old-range cards hidden during fetch.
3. Quota summary before first Start; preflight still mandatory; exact immutable model/source/prompt confirmation; stale preview never overrides preflight.
4. Settings search routes to current registered pages, scope copy correct/mixed, no results explicit, drafts unaffected.
5. Main/nested tooltip has state/reason/time or explicit unavailable, uses trusted source and no synthetic status timestamp.
6. Typecheck/pure/browser/full checks and independent review; no commit/release/install.

## Rollout and rollback

Plan check -> tests/implementation -> independent review/fixes -> final verification report. No production mutation. Restore source only on M request; no stored data deletion. Session draft clearing only explicit success/use-latest, plugin reload ends session. Keep docs for review.

## Parts

| Files | Action | Why |
| --- | --- | --- |
| client/checkpoint-panel.tsx, client/checkpoint-draft.ts + tests | change/new | Dirty/session/conflict owner |
| shared/work-calendar.ts + tests, client/work-calendar.tsx | change | Day segments/snapshot/coverage |
| client/dispatch.tsx, client/dispatch-quota.tsx | change | Pre-start summary + exact warning |
| client/settings-directory.tsx, shared/settings-directory.ts + tests, index.client.tsx | new/change | Scope/search wrapper |
| shared/status-tooltip.ts + tests, client/sidebar-status-mark.tsx, client/sidebar-view.tsx | new/change | Truthful shared status explanation |
| client/work-features.browser.test.ts, docs | change | Behavioral regression and limits |

- [x] Independent plan check and fixes.
- [x] Implement selected refinements with focused regressions.
- [x] Independent review/fixes and full verification.

## Independent check

Independent plan review partial: no blockers, dated outcomes/accessibility/timeout notes fixed below. Parent checked actual SDK agent contract, Quick Chat route and checkpoint CAS owner directly; bad guessed paths in reviewer do not establish missing code.

## Changes made

Implemented session draft/conflict owner, local-day calendar snapshot UX, pre-start quota/exact immutable summary, topic settings search/scope wrappers, consistent own-sidebar tooltip. Earlier feature work preserved.

## Open questions

None for selected scope. Search explicitly topic-indexed rather than exhaustive dynamic control/value indexing.

## Review and final evidence

Verification date2026-11-24. Guardrails zero draft loss in navigation/conflict/overlapping-save tests; zero creates on canceled/stale launch. Usage preview/preflight retains five-second timeout and explicit loading/unavailable. Target labels/roles exercised in browser with actual kit controls; SDK settings widgets adapted in fixtures, not complete assistive technology certification.

Fresh code review found one blocking overlapping-panel draft completion issue. Parent upheld: shared owner now clears only submitted fields/baseline and advances newer draft baseline after its own successful save. Deferred-save/unmount/reopen/edit/resolve/navigate/remount browser regression passes. Notes fixed: directory navigation uses direct openSettings, preserving selected editing layout; preflight updates preview and invalidates older preview requests. Applied, not re-checked.

Calendar pure tests cover DST and cross-midnight day splitting. Snapshot ranges hide mismatched old data and totals use stored snapshot time. Search is curated, not exhaustive control search. Tooltip state time unavailable when not supplied; workspace manual override never borrows host time. Existing native-host circles unchanged.

VERIFY: npm run typecheck PASS.
VERIFY: focused draft/calendar/directory/tooltip tests PASS (8).
VERIFY: enabled work-features/sidebar-status/quick-chat browser tests PASS (3 non-skipped), existing React Native Web/Playwright paths.
VERIFY: npm test PASS, counts in final report.
VERIFY: git diff --check PASS before final doc update; rerun final.

Known limits: session drafts not durable across app reload/quit; host/framework UI pixels and full accessibility not certified; no draft blocking interception at host navigation API; recovery rather than prevent-navigation. Calendar observation gaps remain inherent and explicitly labelled. No commit/push/release/registry/installation.
