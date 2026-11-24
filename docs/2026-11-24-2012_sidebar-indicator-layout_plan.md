# Sidebar indicator size and vertical alignment

- Date: 2026-11-24 20:12 IST
- Status: implemented and verified locally; full because additive profile settings/user-visible geometry
- Branch: sidebar-indicator-size-alignment from origin/main v0.53.2
- Approval: M explicitly requested customizable size/alignment and exactly 80% nested size/opacity. M delegated remaining choices and completion after checked-plan briefing.

## Context and problem

M wants dot-and-ring size customization and Top/Center/Bottom alignment against the full sidebar row, including two-line rows. Nested chats/subagents must derive size/opacity directly at 80% rather than independent values. [verified: M request 2026-11-24]

## Goals / Non-goals

Success 2026-11-24: size 10-24 integer pixels, default14; alignment top/center/bottom default center; nested always size*0.8 and opacity*0.8. Guardrail zero changed state/color/speed/action/grouping behavior, no overflow at 360/700/1440, existing preferences stay readable. No new opacity slider, nested override, host code/installation/release action, global layout or unrelated Run fix/main merge.

## What is true today

Optional strict sidebarStatus object stores style and per-state color/speed. Shared resolver defaults ring. [verified: shared/polish/sidebar-status.ts:9-19]
Own mark wrapper fixed 16x20, inner14, nested12 via scale12/14; nested opacity.8. Two-line parent aligns to flex-start, so marker centers on title line, not whole content. [verified: client/sidebar-status-mark.tsx:12-14; client/sidebar-view.tsx:140-141,993-1008]
Preview and native host pseudos hardcode 12px+border (=14 total); fixed center top50%. CSS generator is single owner for both. [verified: client/polish/web/sidebar-status.ts:11-24]
Old saved branchMark remains compatibility-only; no resurrection. [verified: shared/view-state.ts:31-32; removed editor from previous release]

## Options considered

| Aspect | Derived geometry/layout (recommended) | Separate nested settings |
| --- | --- | --- |
| How | Main size + alignment, nested derived .8 | Independent sizes/alignment |
| Fit | Matches M's direct connection | More user flexibility |
| Gives up | Independent nested choices | Requested invariant, simplicity |
| Cost/risk | Small shared geometry and flex changes | Extra schema/UI drift risk |
| Evidence | M exact ratio, current fixed geometry | Would violate requested linkage |
| Completeness | 10/10 scoped | 4/10 wrong linkage |

RECOMMENDATION: main-only configuration and derived nested geometry.

## Decision

Propose integer size choices10,12,14,16,18,20,22,24 in settings; schema accepts integer10..24 for imported profiles. Store size/alignment in a separate optional chat.polish.sidebarIndicatorLayout key, not inside the existing strict sidebarStatus object. Existing tolerant catchall preserves this unknown sibling in older readers without invalidating saved style/colors/speeds. Add a current-reader/old-schema regression. Alignment top/center/bottom; default values omitted on save. Renderer wrapper minHeight max(20,effectiveSize), alignSelf stretch, width max(16,effectiveSize) and justifyContent from alignment; inner exact effectiveSize = main size * (nested ? .8 : 1), with no transform. Nested wrapper opacity .8. Visible top/bottom edges therefore follow effective size directly. Ring pseudos derive size/track/dot widths rather than scale borders unexpectedly. Full row content determines wrapper height; no absolute row overlays/no hitbox changes. Native host slot alignSelf stretch/height auto, pseudo edge offsets selected; preview includes two-line sample and main/nested pair. Host-default ignores custom ring layout, preserving original host style. [proposed: implementation choices under M's requested behavior]

## Cost and scope

Estimate 30-60 minutes (assumption from preceding component change). Risk flex stretch on two-line/native layout; browser actual own component flex fixture plus native slot. Separate optional preference key preserved by existing tolerant catchall, no data migration. Source reversible. Existing isolated checkout reused with dedicated branch; dependencies linked, no installs. Cut optional cosmetics, not ratio/alignment/reduced-motion/persistence tests.

## Design

Profile -> central resolved size/alignment -> shared CSS + subscribed component -> main/nested row. Keep theme/status colors, dot+track/no bright stopped-Done arc, reduced motion and animations untouched. Alignment uses full content block within row padding, not title line. Accessibility label remains same. Largest marker can increase minimum row height intentionally, no clipping or icon/text overlap. Settings/native fallback clearly scoped desktop/web. No network/auth/retries/concurrency changes. Invalid persisted size/alignment follows existing tolerant setting fallback, editor only enum choices. Partial absence keeps defaults. Design refs orchestrator design.md, ADAPTATIONS.md, craft-floor.md.

## Risks and mitigations

| Risk | Impact | Check |
| --- | --- | --- |
| Stretch remains title-only | Alignment ineffective | Two-line actual component at top/center/bottom compare bounds |
| Nested ratios drift | Violates request | 10/14/24 sizes, exact .8 width and .8 opacity |
| Native host geometry incompatible | Clipping | Host-shaped full content row test, named limits |
| Large icon overlaps text | Layout break | Size24, narrow viewport, actual marker flex width>=size |
| Old configs rejected | Lost custom colors | Additive fields, existing profile tests and save/remount |

## Acceptance criteria

1. Given absent values, main14/center and nested11.2/.8; existing color/speed settings preserved.
2. Given size10 or24, own/preview/native circle has selected outer diameter; nested width exactly .8*main and opacity .8 of main.
3. Given two-line row, top aligns upper edge, center aligns centers, bottom lower edge within content area. No title-only wrapper.
4. Given save/remount/reset, size/alignment round-trip and reset to14/center without unrelated state preference loss except explicit full reset.
5. Existing stopped-Done, host-default, reduced-motion/hydration/settings-close tests remain; full/type/browser pass.

## Rollout and rollback

Independent plan check -> briefing -> M approves -> failing regressions -> schema/geometry/UI -> actual-component/browser checks -> report. No implicit commit/release/installation. Rollback source/settings reset on M request, no migration.

## Parts

| File | Action | Why |
| --- | --- | --- |
| shared/polish/sidebar-status.ts, shared/polish/prefs.ts and tests | change | Separate layout key/schema/default geometry; old-reader preservation |
| client/sidebar-status-mark.tsx | change | Ratio/stretched row/alignment |
| client/polish/web/sidebar-status.ts and test | change | Dynamic native/own/preview geometry |
| client/forms/sidebar-status.tsx | change | Controls and paired two-line preview |
| client/sidebar-status.browser.test.ts | change | Bounds, ratios, persistence/reset |
| README/plan | change/new | User instructions and evidence |

- [x] Plan check/approval.
- [x] Defaults/schema/geometry/controls implemented, regression red then green.
- [x] Bounds/lifecycle/full checks and completion report.

## Independent check

Independent: blocking strict-object compatibility finding upheld and fixed by separate sidebarIndicatorLayout sibling preference. Nested visible-edge finding fixed with actual effective dimensions, no transform; require all three alignment bounds at size10/14/24 for both depths. Host ancestry established by direct read ../paseo/packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx:507-535 (flex row/alignItems flex-start, status slot sibling to content column); fixture must match this hierarchy. Applied, not re-checked.

## Changes made

Implemented separate sidebarIndicatorLayout preference, validated size/alignment, derived nested actual dimensions, shared native/own/preview geometry, profile controls, independent layout reset and full reset, two-line main/nested preview. Existing state settings preserved.

## Open questions

None; M delegated remaining choices. No commit/release/install in this task.

## Review and verification

Fresh review: zero confirmed blockers; must-verify actual hierarchy and populated reset coverage fixed. Browser now renders actual RowShell+StatusMark with two text lines/padding, checks visible diameter and top/center/bottom at size10/14/24 both depths. Native fixture uses source-confirmed flex row/status slot/content-column hierarchy and checks pseudo geometry. Reset layout preserves populated color/speed; full reset clears both keys and preserves runButtons. Nested preview added. Applied, not re-checked.

VERIFY: npm run typecheck PASS.
VERIFY: focused schema/CSS tests PASS, 15 tests.
VERIFY: enabled client/sidebar-status.browser.test.ts PASS (non-skipped): size/alignment persistence/remount, exact .8 ratio/opacity, row bounds native+own, defaults/reset, all prior state/motion/lifecycle checks.
VERIFY: npm test PASS, 1352 passed / 26 default skips; browser separately enabled.
VERIFY: git diff --check PASS.

Red evidence: browser failed missing Main indicator size control before implementation, green afterward. Inspection: 360px dark settings capture; simplified SDK widgets, not installed-host chrome/pixel certification. Fixture remount helper corrected to increment key on every call, retaining invalid-draft preservation assertion.
