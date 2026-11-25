# Compact runtime and workspace hover actions

- Date: 2026-11-25 13:27 IST
- Status: implemented locally with title-source follow-up unresolved; approved requested direction; full because visible row layout changes
- Base:26eef28606b3e39959293b4876b0f9c06547e67b; existing isolated worktree

## Context and goals

M requests smaller activity line, no wasted space for no activity, 2x2 hover actions (Pin/Archive above Info/Menu), aligned toolbar/tabs, no enclosing tab fill/border and selected-only fill. Toolbar control borders stay. No release/install authorization. Success: zero empty/unknown runtime marks, nonzero stripcompact duration label, hover width48px desktop rather than four buttons plus time/strip, tab/toolbar8pxouter insets. Guardrail archive remains two explicit presses, no filtering or observation changes. Verify local2026-11-25.

## Current owners and mechanism

RuntimeStrip allocates66x18 and draws dash/flat line for unavailable/zero. Workspace keepTrailing preserves time+strip alongside actions, creating cramped titles. Tabs margin12 plus enclosing border/fill conflict with toolbar8pxpadding. [verified: client/sidebar-runtime.tsx:32-46; client/sidebar-view.tsx:284-308,1053-1088; client/sidebar-focus.tsx:9]

## Decision and alternatives

Chosen: remove absent/zero chart DOM entirely after hook execution; nonzero uses18m / 24h or2h10m / 24h with~prefix for partial, same totals/tooltips semantics. Hide trailing time/chart on hover/focus when grid is shown, as existing nonworkspace rows already do. Two-line rows grid2columns using two explicit horizontal rows: Pin/Archive then Info/Menu. If pin button disabled by setting, retain empty top-left cell (pin remains in menu). Archive armed state uses danger-toned icon with explicit confirm accessible label/tooltip, existing handler and timeout unchanged. One-line rows keep horizontal actions. Keyboard/touch uses same grid when shown. No destructive automatic action. Equal-width tabs preserve selected fill; parent transparent/borderless, margin8 matches header padding8, no inner pad. Focus/count/filter behavior unchanged.

Alternative keeping chart plus grid rejected because title would still lose unnecessary width. Removing chart feature entirely rejected because M asks smaller/nonempty, not removal. No data/config/dependency migration. Source rollback only on M request.

## Cost, design and risks

One short implementation session estimate, unverified. Scope runtime component, sidebar view/focus, browser tests, README. Reuse existing tokens/icons and24/32pxbutton targets. Risks: confirm archive mistaken for one click; test label/two calls. Focus transition must not unmount grid; existing focusWithin owner retained. UI hidden chart means unavailable metadata not shown inline, documented; no activity claimed for gaps. Test empty/unknown/nonzero/partial, hover/focus no time/chart, geometry grid ordering, borderless tabs/aligned edges, overflow360/700. No server or stored title writes. No new auth/outbound/telemetry; rendering only. Runtime aggregation unchanged, no experiments or live service SLO. Cosmetic cleanup cut first, no loss of archive protection.

## Acceptance and parts

- [x] Runtime DOM absent for unavailable/zero,compact duration labelnonzero tooltip/total unchanged; pure normalization test and browser dimensions.
- [x] Two-line hover/focus shows Pin/Archive top,Info/Menu bottom; trailing hidden; first archive arms and second confirms, no new bypass; custom pin-hidden case safe.
- [x] Tabs transparent/borderless parent, selected-only fill, toolbar/tab edges align; controls retain borders.
- [x] Typecheck/unit/full/enabled browser checks and rendered inspection. No release/install.

## Files

client/sidebar-runtime.tsx; client/sidebar-view.tsx; client/sidebar-focus.tsx; client/sidebar-information.browser.test.ts; shared/sidebar-runtime.test.ts; README.md.

## Independent check

Pending.

## Changes made

None.

## Open questions

None: interpreting the truncated last sentence as removing the tabs' border only, retaining the explicitly requested toolbar borders.

## Steering and review

M rejected all activity lines and approved duration-only labels:18m / 24h, zero/unavailable absent,~partial. This overrides chart references. Independent review blocker valid plan drift fixed here; archive warning reused exactly; same archive IconButton mounted while armed; grid replaces trailing region on hover. Dot investigation measured6x6CSSpxboth states in isolated screenshots; no geometry defect proven, so no unsupported dot enlargement. Quick Chat screenshot titles60characters point to upstream saved-title truncation, not visual overflow. No title rewrite inferred.

## Final verification and limits

M later requested8pxspacing above/below toolbar and matching Search/button heights; implemented in header owner. Runtime now duration label only, zero/unavailable DOM omitted. Grid positions and first/second archive call counts proven in real sidebar fixture; tabs8pxinsets/border0 and equal width, toolbar equal-height and borders/focus tested. Typecheck/all4enabled browser suites/full suite/diff check PASS; full log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/compact-sidebar-layout-tests.log. Existing chart-render tests replaced by duration/visibility contract, bin arithmetic unchanged.

Unresolved separate Quick Chat complaint: both screenshot titles exactly60chars, list passes saved title unchanged, native provisional generator slices60without ellipsis (../paseo/packages/server/src/server/agent/create-agent-title.ts:4,18). Current plugin row already tail-ellipsizes actual visual overflow. Cannot honestly mark all60char titles truncated without provenance; upstream title producer change needs separate Paseo scope and existing-title recovery decision. No saved title rewritten. Dot isolated snapshots both bright bounds12x12devicepxat2x; difference only2bright edge pixels, not proof different geometric diameters. No dot enlargement applied. No release/install.

## Final Morphise-only title steering

M explicitly forbade Paseo edits. No Paseo source was changed (read/fetch only). Added shared/quick-chat-title.ts pure responsive display helper: below640pxcontent width60characters, otherwise120, tail ellipsis and word boundary when available. Actual overflow remains tail ellipsized. Existing60char saved titles unchanged; full accessibility/Chat info preserved. Unit2andenabled Quick Chat browser pass. Final typecheck/all4enabled browser/full suite/diff check PASS; log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/compact-sidebar-final-tests.log. No commit/release/install.
