# Quiet sidebar and time-grid work calendar

- Date: 2026-11-24 22:05 IST
- Status: done locally; approved direction and delegated completion (M: "use your best judgement and finish all"); full because user-facing layout and shared presentation rules change
- Repos: morphise; isolated existing worktree morphise-sidebar-information, base1045ab90dcfacea9df0f6cc6ec58a8af29e6ba1c; no uncommitted source at start
- Subagents: independent plan check only; implementation sequential

## Context and problem

M supplied screenshots showing oversized tabs, repetitive Working/No active work lines, a State time unavailable label consuming title width, and Calendar as large agenda cards rather than a calendar. M asks to remove alignment controls, restore Paseo positioning, use default time when state time missing, minimize tabs and significantly improve Calendar UI. M explicitly delegated design choices/completion. [decided: M, chat2026-11-24]

## Goals / Non-goals

Success: zero Working/No active work filler rows and no unavailable-time text in row timestamps; title-line native indicator placement regardless of legacy alignment; compact tabs; Day/Week chronological grid with parallel work selectable, compact toolbar/filter disclosure and readable durations. Guardrail: totals unchanged for overlap/uncertain/DST fixtures; no title writes or stored observation changes. Check locally2026-11-24. No month/planning/task creation/drag editing, live timers, provider credentials, backfill, schema migration, commit/release/install.

## What is true today

- Indicator normalizer returns saved top/center/bottom; native CSS stretches slots and repositions pseudo-elements; replacement component also stretches. These settings were added intentionally for full-row alignment, now M asks to remove behavior/control. Keep legacy key readable but inert. [verified: shared/polish/sidebar-status.ts:14-20; client/polish/web/sidebar-status.ts:19-24; client/sidebar-status-mark.tsx:13-17; client/forms/sidebar-status.tsx:23-28,45-56]
- Native Paseo uses fixed TITLE_LINE_HEIGHT with centered contents, row flex-start. Preserve host geometry rather than override it. [verified: ../paseo/packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx:507-535]
- semanticLine unconditionally emits Working/No active work; row timestamp selects state time for running/failed/asking, no fallback; workspace creation fallback removed last pass. [verified: shared/sidebar-focus.ts:22-38; client/sidebar-view.tsx:841-845,957-968,1014-1020]
- Current tests explicitly require unavailable timestamp and full-row alignment; update expected behavior, retain size/color/speed/nested80% tests. [verified: shared/sidebar-focus.test.ts:45-59; client/sidebar-status.browser.test.ts:28-32]
- Calendar RPC read owns observed intervals and retention; calendarTotals excludes uncertain and clips at snapshot. calendarDays uses local midnight boundaries. UI stores snapshot/range identity and ignores late fetches but displays flat cards. [verified: shared/work-calendar.ts:5-39; client/work-calendar.tsx:9-49]
- WorkCalendar owns PopoverHost; kit Dropdown requires it; kit controls/token conventions retained. [verified: client/work-calendar.tsx:49; client/ui/kit.tsx:415-429]

Assumptions/callers: semanticLine returns non-null today and details directly access .text, so handle nullable in both row and detail. Row renders empty subline when technical details exist but lead absent; fix conditional to lead/PR, preserve metadata. sidebarTime used workspace/chat/detail, define nullable no-source behavior and tooltip provenance separately. Calendar server/read filters unchanged; data range identity must guard grid+selected detail. Selection cleared on range/filter change. Calendar tests currently search visible event title/card; preserve discoverability through real event button and update open-details expectations.

## Options considered

| Aspect | Existing intervals -> Day/Week grid (chosen) | Month heatmap | Restyled agenda |
| --- | --- | --- | --- |
| Works | Hour rows, date columns, selectable overlapping events | Day cells with aggregate totals | Compact chronological rows |
| Fit | Already has start/end/outcome | Same data but loses overlap detail | Lowest implementation effort |
| Gives up | No month overview or editing | Precise time/parallel work | Does not meet actual calendar request |
| Cost/risk | Moderate presentation/test change | Moderate, aggregate semantics | Low |
| Failure | overlap/tiny-event/DST geometry | hides timing | remains list |
| Evidence | work-calendar.ts above | inferred from day aggregation | current UI source |
| Completeness | 9/10 selected request | 6/10 | 4/10 |

RECOMMENDATION: Day/Week grid using existing intervals.

## Decision

[decided: M, chat2026-11-24] Remove alignment options/effects, filler lines, missing-time row error, minimal tabs, use calendar UI. [proposed under delegation] Keep size/color/speed and nested80% unchanged. Old alignment remains parsable but normalizer exposes size only; live native CSS leaves host slot height/alignment intact; replacement fixed title-line slot center. Timestamp: valid state when requested -> observed activity -> creation for workspace with no prompt -> omit when none valid; fallback is normal compact age (e.g.7h) never falsely labelled state duration. Details/tooltip say source; no invented data. Icons carry working/idle state; semanticLine nullable for running/done without meaningful checkpoint context; keep pending permissions/errors/unread/checkpoints. Tabs content-width, transparent, selected thin underline,32px targets, same counts/config.

Calendar remains inside Workbench. Wide defaults Week, narrow <=640px Day; user Week remains available by horizontally scrolling just the grid. Compact top toolbar date range/navigation/Today/range/refresh; filters collapsed behind count-labelled button, three selectors in one wrapping group, clear. Summary short human-duration totals and refresh time; coverage expandable. Day/week grid header each day + date, hour gutter24h. Show relevant hour window (earliest observed hour minus1 to latest plus1, minimum6h, clamped0..24); empty uses08..18; explicit Show24hours toggle for full day. Day edges local Date boundaries; repeated DST hour disambiguated in details timezone offset and note, grid uses normalized elapsed-position within day, hour tick labels generated from actual instants. Different day lengths share relative vertical scale with actual hour labels in each day; choose same day-elapsed hour rows across columns with25h max, short-day remainder shaded. No fake human work totals.

Pure layout helper creates per-day segments clipped at snapshot/range; uncertain zero-length observations remain selectable marker events, excluded totals. Real durations unaffected by minimum24px event hit height. Overlapping display extents get side-by-side lanes in connected clusters; no covered event. Very dense overlap horizontally scroll day content with min lane90px; no external page overflow. Long events have title/provider/time; tiny events title with full accessible name and detail on click. Outcome color plus text, muted fill using theme surfaces, no new animation. Selected event detail panel below compact toolbar (not modal) shows full title/workspace/project/provider, local time incl offset, duration/outcome/uncertainty and Open chat. Close explicit; keyboard focus stays understandable. No auto-generated replacement titles. Snapshot running event end uses fetchedAt; no visual credit beyond snapshot. Grid/filter/error/empty preserve existing distinct messages. Retry uses Refresh, no automatic loop. Event with missing/deleted workspace uses Unknown/removed, opening absent agent reports host navigation outcome (no writes).

## Cost and scope

One implementation session estimate, unverified; prior pass source/tests guide scope. No dependency or server changes. High-risk geometry and stale fetch behavior tested at pure and browser level. Reversible source; legacy alignment key retained. Cut decorative extras first, not host geometry/time fallback/uncertainty/overlap. Changed owners: shared/sidebar-focus.ts+tests; shared/polish/sidebar-status.ts+tests; client/forms/sidebar-status.tsx; client/sidebar-status-mark.tsx; client/polish/web/sidebar-status.ts+tests; client/sidebar-focus.tsx; client/sidebar-view.tsx; shared/calendar-layout.ts+tests(new); client/work-calendar.tsx; enabled browser tests; README.

## Design

Sources: orchestrator design.md, ADAPTATIONS.md, impeccable WORKFLOW.md/reference/layout.md and craft-floor.md. Operate mode, existing tokens and typography. Copied tooling instructions set aside per ADAPTATIONS; existing browser fixtures provide rendered evidence. No separately published HTML.

```
Observed interval RPC (unchanged)
 -> range/snapshot/filter owner (existing)
 -> segment/lane geometry (new)
 -> day/week grid + selected details (changed)
 -> existing Open chat action (unchanged)
```

Checklist1: no new stored config; safe absent-time omit, legacy alignment ignored not data-deleted.2: no RPC/storage change, layout helper internal, semanticLine nullable internal callers updated.3: synthetic200-event layout under100ms, no network on selection, responsive360/700/1440.4: existing fetch errors/retry and cleanup; no new SLO.5: data rendered as text, no HTML, no auth/outbound calls.6: one client uses existing plugin RPC/server store, diagram above.7: visible fetch state/refresh timestamp/errors and deterministic geometry tests; rollback on overlap inaccessible/time inflation.8: target WCAG2.2AA theme baseline, labels24px+ controls keyboard tested, no full AT certification claim.9: n/a no A/B.10: existing runtime/browser deps linked; installed-host checks unavailable, synthetic host adapter stated.11: short/zero/uncertain/future/cross-midnight/DST/overlap/empty/filter/error/stale data; avoid new library.12: running/sidebar/time fallback/legacy saved alignment, Day/Week, two overlaps, nested overlap, zero marker, filtered out selection.13: minimum24px display extents but real duration explicit; max20000 input existing cap, no test performance claims at cap unless measured.14: room for later Month only when requested.

## Risks and mitigations

| Risk | Likelihood/impact | Mitigation/signal |
| --- | --- | --- |
| Tiny event blocks imply longer work | medium/medium | True duration in label/details; min hit size not credited |
| Overlap hides selectable event | medium/high | Cluster lanes/min widths/pure/browser fixtures |
| DST assumes24hours | medium/high | Actual day bounds/elapsed hours/ticks,23/25h tests |
| Legacy alignment still applied | medium/medium | Parser retains but normalized/readers ignore; legacy bottom test |
| Missing state time mislabelled | medium/high | fallback compact age, never state prefix; null both omits |
| Old range/selection leaks | medium/high | same range identity/cleanup; clear selected on filters/range |

## Acceptance criteria

1. Given legacy bottom alignment, live/native/replacement title-line positioning unchanged and no alignment selector; size/color/speed persist.
2. Given working/idle without useful context, no filler or blank extra line; useful checkpoint/reason and PR metadata remain.
3. Given missing/invalid/future state time but valid activity, show normal age; no valid source omits row time; tooltip does not call fallback state time.
4. Given tab selection/long labels/narrow width, compact transparent content-width tabs retain selection/counts/accessibility/custom settings.
5. Given intervals across days/overlap/DST, grid shows correct day/time segments independently selectable; durations/totals unchanged; uncertain visible but not counted.
6. Given Day/Week/filter/nav/refresh, controls work and selection cannot show removed range/filter events; stale responses ignored and prior-range data hidden.
7. Given short/running/zero/error/empty history, human duration and honest snapshot/coverage/empty/error affordances visible.
8. Render actual components360/700/1440 and keyboard event/details close/open; tests/typecheck/full suite/diff pass.

## Rollout and rollback

Local only. Plan check -> regression tests -> sidebar owning rules -> grid geometry/UI -> render checks/full suite -> handoff. Delegated completion means no per-part pause. No branch/release/install mutation. Rollback only M request; no data migration. Worktree existing, no new offer needed. End with diff review offer.

## Parts

| Files | Action | Why |
| --- | --- | --- |
| shared/sidebar-focus.ts, shared/polish/sidebar-status.ts + tests | change | nullable meaningful text/time fallback/legacy alignment inert |
| client/forms/sidebar-status.tsx, client/sidebar-status-mark.tsx, client/polish/web/sidebar-status.ts + tests, client/sidebar-focus.tsx, client/sidebar-view.tsx | change | native geometry/no setting/minimal tabs/nullable row |
| shared/calendar-layout.ts + tests | create | date segments/hour extents/lanes/duration |
| client/work-calendar.tsx | change | real grid, compact controls, details |
| client/sidebar-status.browser.test.ts, client/sidebar-information.browser.test.ts, client/work-features.browser.test.ts, README | change | behavior/render regressions and docs |

### Sidebar
- [x] Regressions fail for stale alignment/filler/missing-time; implement owning rule changes. Done: pure/type/browser verify.
### Calendar
- [x] Geometry/duration/overlap/DST tests fail first, then helper/UI. Done: all events selectable no count drift; actual screenshots inspected.
### Verification
- [x] Full suite/enabled browser/type/diff, docs and RCA update. Done: observed PASS, limits recorded.

## Independent check

Independent: 1 blocking contract wording issue fixed, applied not re-checked; 1 note clarified. DST geometry uses elapsed milliseconds since each local midnight, one hour64px across columns, maximum from longest actual day (23/24/25), full-day action "Show all hours". This replaces earlier0..24 clamp/normalized fractional language. Last-hour hit area remains inside visible grid by shifting its top if necessary, true timestamp retained in details. Test baseline above describes pre-edit state; red expectations were added while review read files, then passed after owning-rule fixes. No other blocker/open must-verify.

## Changes made

Implemented native title-line indicator placement with inert legacy alignment, removed alignment control/filler rows, activity/creation timestamp fallback and compact filled equal-width tabs. Calendar now uses elapsed-hour Day/Week grid, lane placement, minimum hit areas, compact controls/filter disclosure, selectable detail panel, duration formatting and snapshot/coverage states. Existing recording/store/totals unchanged.

VERIFY: npm run typecheck PASS.
VERIFY: focused sidebar/status/calendar unit regressions PASS; initial four sidebar regressions failed on old behavior then passed.
VERIFY: enabled browser work-features/sidebar-information/sidebar-status/quick-chat PASS4.
VERIFY: npm test PASS1387/28skipped, log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/quiet-sidebar-calendar-tests.log.
VERIFY: git diff --check PASS before docs update, rerun final.
Rendered inspection: actual React Native Web components with SDK host-boundary adapters at360/700/1440, generated screenshots in /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/calendar-ui-captures. Checked grid/titles/overflow/overlap, removed duplicated hour labels after first render. Host Icon adapter renders no icons in fixture, so installed glyph appearance not certified. Browser verifies event selection/detail/Open chat, 35sec short event, uncertain point marker, filters/clear, range, all hours, read failure/retry, no page overflow. Pure tests25h last-hour containment, tiny hit-area lane separation, overlap durations, existing23h local range and uncertain totals.

Limits: no installed-host visual/full assistive technology certification. No performance claim at20000 interval cap. Fresh reader final diff check offered, not run without M approval. No commit/release/install. Geometry tests written with helper and passed first run; mutation probe added for sensitivity, not claimed red-first.

## Open questions

None: M delegated design and finish. No commit/release/install authorization inferred.

## Steering correction

M explicitly corrected the tab direction: KEEP filled pill backgrounds and equal-width blocks (chat2026-11-24). This overrides every earlier content-width/underline statement in this plan. Reduce padding/height/gaps only; preserve filled selected state and equal flex widths. No underline redesign.

## Final fresh-reader check and responses

M approved the offered final diff check ("go ahead"). Independent static reviewer returned1blocking,1must-verify,2notes. Parent independently upheld all four; all fixed, no contested/open finding. No second reader in minimal session mode; fixes proven by local tests.

- Timestamp candidate validation: fixed at sidebarTime, which now accepts ordered candidates. Workspace passes enriched activity, prompt and creation only if no prompt was recorded. New invalid/future enriched activity plus valid prompt regression failed null!=2h before fix, passes afterward.
- Calendar keyboard focus: explicit focusable details region receives focus on selection; close restores exact originating day/event segment. Browser regression uses Enter/Tab/Shift+Tab to open details, reach Close/Open chat, activate Open and return to origin. PASS.
- One-line details: semantic meaning calculated independently of inline row style; useful detail-card content retained while one-line rows stay compact. Typecheck/browser suites PASS; direct one-line-specific rendered reason assertion not added.
- Event project: details now include resolved project, workspace and provider with honest removed-project fallback; browser asserts Demo / Demo workspace / fake.

Final verification after fixes: npm run typecheck PASS; all4enabled browser regressions PASS; npm test1388passed28skipped; git diff --check PASS. Full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/quiet-sidebar-calendar-reviewed-tests.log. Installed-host/full accessibility certification still not performed. Source remains uncommitted; no release/install.
