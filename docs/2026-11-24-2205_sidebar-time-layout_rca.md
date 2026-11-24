# Sidebar timestamp and layout correction

- Date: 2026-11-24 22:05 IST (investigation start clock)
- Status: fixed locally, not released

## Impact and mechanism

M's screenshots show "State time unavailable" consuming title space, repeated Working/No active work lines and indicators aligned to full row height. The formatter selected state time exclusively and returned unavailable without trying known activity; semanticLine generated filler; both native CSS and replacement slot stretched to implement an older requested alignment feature. [verified: pre-change shared/sidebar-focus.ts:22-37, client/sidebar-status-mark.tsx:17, client/polish/web/sidebar-status.ts:21-24; M screenshots]

## Structural correction

The formatter now validates state time then uses a valid ordinary activity age, with workspace creation only when no prompt exists; if no source is valid, omit row time. Fallback is never labelled state duration. The semantic owner returns null for redundant running/idle text, and row/detail consumers handle it without empty spacer lines. Legacy alignment remains parsable but normalizes to size only; live CSS no longer changes host slot geometry, replacement uses fixed20px title-line slot. Alignment control removed. Recurrence test: no for these same generators. [verified: shared/sidebar-focus.ts, shared/polish/sidebar-status.ts, client/sidebar-view.tsx, client/sidebar-status-mark.tsx, client/polish/web/sidebar-status.ts]

## Verification and prevention

Four updated sidebar regressions failed on old generators and passed after changes. Enabled browser tests exercise no filler/no unavailable row text, native slot preservation, removed alignment control, exact80% nested sizing, settings retention and compact filled equal-width tabs. Typecheck/full suite1387passed28skipped and four enabled browser regressions passed. State tooltip may truthfully retain "Time in state unavailable" when source absent; ordinary row time fallback is not falsely borrowed for that tooltip.

## Detection gap and follow-up

Earlier tests asserted unavailable text and configurable full-row alignment as intended behavior; those expectations no longer match M's corrected UI direction. Missing activity was treated as exceptional rather than a normal display fallback. Regression fixtures now cover absent state timestamp with valid activity. Owner: implementation; completed. Installed-host visual and full assistive-technology checks remain unperformed; owner M if requested. No stored observations or titles changed, no release/install.

## Review follow-through

Independent check found candidate selection could discard a valid prompt if enriched activity was non-null but invalid/future. Fixed by validating ordered candidates inside sidebarTime, not selecting first by null-coalescing at caller. Red-before-green regression added. Calendar details now manage keyboard entry/return focus and include project; one-line workspace details retain semantic reasons. Final checks: typecheck/full suite1388passed28skipped/four enabled browser regressions/diff check PASS. No open review finding; no second reader pass.
