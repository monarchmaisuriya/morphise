# Restore Paseo sidebar indicator alignment

- Date: 2026-11-24 20:33 IST
- Status: implemented and verified locally; full because released user-facing preference removal
- Base: 2faab77dcc0c011ffc8f82184496e58fbc714f34; isolated worktree morphise-sidebar-default-alignment, branch fix/sidebar-default-alignment. Original fork checkout untouched.

## Context and problem

M asks to remove vertical alignment and reset to Paseo default. Default is title-line centering, not full-row centering. [verified: M request; ../paseo/packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx:500-535]

## Goals / Non-goals

Success checked 2026-11-24: no alignment control; native/own markers center against first 20px title line, including saved top/bottom/center preferences. Preserve size10..24, nested .8 size/opacity, colors/speeds, dot/track parity, stopped-Done arc behavior. No live settings/database edits, release/commit/install action. Guardrail zero unrelated saved field loss.

## What is true today

sidebarIndicatorLayout schema accepts size/alignment; resolver returns alignment. Settings writes/controls it. Own marker stretches full content height; generated CSS also stretches native slot and positions pseudos from alignment. [verified: shared/polish/sidebar-status.ts:14-19; client/forms/sidebar-status.tsx:23-27,46-48; client/sidebar-status-mark.tsx:14; client/polish/web/sidebar-status.ts:21-24]

## Options considered

| Aspect | Remove control and rendering rule (chosen) | Hide control only |
| --- | --- | --- |
| How | Legacy values decoded but ignored, fixed title slot | Existing saved offsets still applied |
| Fit | Restores requested native default | Incomplete reset |
| Cost / risk | Small UI/resolver/geometry/test patch | Small but wrong for saved users |
| Undo | Source-only, no data rewrite | No data rewrite |
| Completeness | 10/10 scope | 4/10 scope |

RECOMMENDATION: remove owning rendering rule, preserve legacy decoding only.

## Decision

Keep alignment enum in schema for compatibility, but runtime layout resolver returns size only. Settings removes selector and strips alignment on subsequent size edits; no bulk profile rewrite. Own wrapper fixed 20px title slot inheriting the row cross-axis alignment, never stretches: single-line rows center it and two-line rows position it with the title; large24px marks centered in slot and may extend2px above/below, matching icon centering rather than moving text. Native host slot dimensions/alignment untouched; only reserve horizontal space for chosen size. Pseudos always center within their slot. Preview uses20px title slots beside labels and nested row previews. Layout reset renamed Reset indicator size, scoped to size key record; colors/speeds preserved. [decided: M request2026-11-24]

## Cost and scope

Estimate15-30 minutes, assumption based on previous small changes. Risks: old alignment leaks, large glyph shifts layout, fixture falsely tests full-row behavior. Source reversible; no migration/dependency/auth changes. Eight implementation/test/doc paths in one part.

## Design

Shared size-only runtime layout -> own fixed title slot / native original slot / preview title slot. No alignment CSS branches or configurable vertical placement. Empty/legacy/invalid config keeps size parsing and existing fallback; no networking, retries, concurrency. No state/agent/grouping/tree geometry changes. Preserve reduced motion. Design references orchestrator design.md, ADAPTATIONS.md, craft-floor.md; project components/tokens reused. Native default sourced from checked source, no unverified generic center assumption.

## Risks and mitigations

| Risk | Mitigation/check |
| --- | --- |
| Saved alignment remains active | Test top/center/bottom all yield same title-line position |
| Size preference lost | Legacy record size24+alignment preserved in schema and size-only resolver |
| Native host height overwritten | Remove stretch/height overrides; host-shaped two-line fixture verifies20px slot |
| Unknown fields lost | Retain known legacy schema; no global migration |

## Acceptance criteria

1. Alignment selector absent; size/reset/color/speed controls remain.
2. Legacy values all result in own/native indicator center at title top+10px, sizes10/14/24 and both own depths (.8 ratio/opacity).
3. New size edits remove stale alignment without changing style/state appearance/unrelated prefs; decoder still reads old records.
4. Reduced-motion/stoppedDone/lifecycle/persistence/full/browser/type checks pass. No installation changes.

## Rollout and rollback

Check plan, red regression, owning fix, full/browser/type/diff checks, report. No commit/push inferred. Undo source only if requested; original profiles unchanged until user edits. Separate worktree retains original work.

## Parts

| File | Action | Purpose |
| --- | --- | --- |
| shared/polish/sidebar-status.ts + test | change | Ignore legacy alignment, keep size and schema compatibility |
| client/forms/sidebar-status.tsx | change | Remove selector and clean size writes/preview copy |
| client/sidebar-status-mark.tsx | change | Fixed title-line slot |
| client/polish/web/sidebar-status.ts | change | Remove native stretch/custom alignment |
| client/sidebar-status.browser.test.ts | change | Absence/legacy/title-line regressions |
| README, this plan | change/create | Accurate user behavior/evidence |

- [x] Red absence/runtime regression; checked scope.
- [x] UI/renderer removal with legacy compatibility.
- [x] Typecheck/full/enabled browser and diff, completion report.

## Independent check

Independent: one blocking single-line alignment finding upheld and fixed by removing alignSelf override (inherit parent alignment). Note on 24px visible overflow and row geometry added to browser checks. All other plan criteria pass; applied, not re-checked.

## Changes made

Removed alignment selector/runtime return and all alignment-driven geometry. Legacy schema still decodes old records; size edits strip stale alignment. Own marker uses fixed20px height and inherits row alignment; native slot stretch/height overrides removed. Size-only reset renamed; previews/readme reflect title-line positioning. Original worktree untouched.

## Open questions

None for explicit requested removal. No release/install authorized here.

## Verification

- Browser regression first failed: Vertical alignment control must be removed (1 !== 0).
- Enabled browser passed after fix, with actual RowShell/StatusMark: both line counts, both depths, size10/14/24, saved alignment top/center/bottom ignored, title-slot center, unchanged row heights, visible overflow at24, preserved nested ratio/opacity. Native-shaped fixture retains original20px slot.
- npm run typecheck: PASS.
- npm test -- shared/polish/sidebar-status.test.ts client/polish/web/sidebar-status.test.ts: PASS18 tests, including three legacy-alignment cases.
- MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/sidebar-status.browser.test.ts: PASS non-skipped.
- npm test: PASS1355 /26 default skips; browser separately enabled.
- git diff --check: PASS.
- Installed-host pixels not certified. No commit/push/release/install or live profile rewrite. Separate worktree/plan retained for M's cleanup choice.
