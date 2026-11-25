# Dynamic navigation layouts

- Status: local implementation verified; installed-host visual acceptance pending; full because saved preference and visible layout change.
- Date: 2026-11-25 22:51
- Scope: Morphise source only, existing isolated checkout. No release/install/Paseo edits.

## Context and goals

M chose dynamic order, not Search/New identities: Stacked full rows; Split first two visible entries share equal columns and remaining entries full width; Tiles first/last full width, middle entries up to three columns, icon above label. Filled/Empty is global, with adaptive hover. Keep counts/actions, order and native handlers. Source: current chat, M's option A and finish all.

## Current state

The installer tags recognized upper navigation groups and row frames and reconciles on DOM/preference changes. It requires two builtins and uses a one-attribute-per-element map. [verified: client/polish/web/sidebar-navigation.ts:27-67]
Settings expose alignment/fill with defaults left/empty. Main host button contains icon and label; trailing is separate. [verified: client/forms/polish-tabs.tsx:201-208; Paseo sidebar-header-row.tsx:76-110]

## Decision and alternatives

Add optional sidebarNavigationLayout enum stacked/split/tiles. Default stacked. CSS grid on existing group, tag existing entry wrappers, never move/clone DOM nodes or replace handlers. Use multi-attribute ownership so layout/alignment/fill tags reconcile and restore together. Reject reconstructing custom buttons because it duplicates host behavior. Recognize small groups via the shipped named navigation scroll/separator boundary, retaining existing two-builtin proof for older layouts. Unknown structures retain normal rows rather than distort them. Multirow plugin slots remain full-width rather than flattening arbitrary plugin content.

## Design and risks

Six-column grid allows split span3 and tile span2, full rows span6. One entry full-width, two entries both full-width in tiles, split pairs only when >=2. Recompute positions on actual DOM order/visibility; no title/identity inference. Use geometry plus hidden/aria-hidden ancestry, no offscreen viewport exclusion. Existing alignment controls horizontal justification; tiles use vertical icon-label flow. Trailing controls stay siblings, pinned at row edge rather than part of the icon-label group. Long labels may wrap in tiles, rows keep shrink behavior. Keep theme palette, accessible names and focus feedback, minimum tile height72px. One global fill setting, no per-entry styling choice. Layout setting hidden while treatment off, saved value retained.

Compatible additive profile enum; invalid/null/empty -> stacked via existing tolerant boundary. No migrations/new network/dependencies/auth/telemetry. Existing preference stream owns concurrent updates; no retry/timeouts. Rollback by Stacked or treatment off/unload, restoring original tags/styles. Risk: plugin wrapper differences; detect one main row per slot before grid, test nested wrappers and dynamic reorder/removal. Preserve footer/list/window controls. No installed-host certification from fixtures.

## Cost and scope

One focused implementation/test pass, estimate 30-60 minutes (unverified). Files: shared/polish/prefs.ts and prefs.test.ts; client/forms/polish-tabs.tsx; client/polish/web/sidebar-navigation.ts; client/sidebar-navigation.browser.test.ts; README.md. No unrelated cleanup. Stop release if tests fail. No new instrumentation or production writes. Success: all layouts pass geometry/order/count tests at 240/320px before handoff; guardrail zero duplicated/dropped buttons, stable accessible names and handlers. Check date before handoff. No experiments, service reliability target or capacity change applies.

## Acceptance and parts

- [x] Profile default/valid/invalid parsing and Look layout select.
- [x] Grid slots, dynamic order/visibility, 0/1/2 entries, extra entries wrapping, nested plugin wrappers.
- [x] Test all fills/layouts, off/on/unload and named divider preservation/removal, footer isolation.
- [x] Typecheck, browser regressions, full suite, diff check and docs.

## Independent check

Independent check: two must-verify findings and one note addressed. Slot means direct group child; multiple recognized rows in a slot cause layout fallback. Required non-skipped browser run uses MORPHISE_UI_RUNTIME and PLAYWRIGHT_MODULE. Added nested host first-row control, dynamic reorder, 2-to-1-to-0-to-1-to-2 transitions, hidden ancestors, multirow fallback, unknown-boundary refusal, and per-attribute cleanup checks. Applied, not re-checked.

## Changes made

Implemented layout enum/select and multi-attribute reconciliation. M expanded scope to remove workspace Search and tabs in favor of transparent status dropdown; existing focus state/counts retained and unused text-search state removed. Fixed fixture clone ownership and popover-backdrop test sequence; both affected browser regressions pass.

## Open questions

None for local implementation; installed-host visual acceptance remains unverified until actual installation inspection. Keep plan until M requests deletion.

## Verification result

Typecheck passed; five separately enabled browser regressions passed; full suite 1,410 passed / 29 skipped; git diff --check passed. Log: /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/navigation-layout-status-dropdown-tests.log. Fixture screenshot inspected, not installed rendering. Fixture uses synthetic icons/trailing controls and is geometry evidence, not visual parity certification. No release/install/commit. No failure-before-fix evidence for all newly added behavior; earlier failures were fixture lifecycle and backdrop interaction errors, now corrected without retries or weakened assertions.

## Final diff review

Fresh reader identified displayed empty slot wrappers as blocking, untested action invocation, and computed visibility as must-verify. Author confirmed and fixed: account for all displayed direct children before enabling grid, inspect computed visibility, and verify main/trailing handlers in Split and Tiles. Inner hidden-button and visibility-hidden regressions exercise fallback and recovery. Applied and focused tests passed, not independently re-reviewed. No installed-host claim. M requested commit/release/registry delivery after review.
