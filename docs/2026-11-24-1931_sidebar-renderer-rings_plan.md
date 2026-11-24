# Persistent rings in Morphise sidebar and nested rows

- Date: 2026-11-24 19:31 IST
- Status: implemented locally and verified; full because released defect and existing device option removal. M requested “fix it all, use your best judgement, finish it all”, then specified nested opacity.
- Branch: fix/sidebar-renderer-rings; base 44f33ced9e47b8a7f947c3b72914f958e173e1e8

## Context and problem

v0.53.0 styles native Paseo sidebar slots only. Morphise replaces the sidebar when sidebar.view.enabled is true, using its own StatusMark that still draws/pulses dots. Two source-backed renders reproduce that output. This explains rings visible before profile hydration and old dots afterward; installed runtime timing remains inferred, not measured. [verified: client/sections.tsx:175-188; client/sidebar-view.tsx:313-323; two static render probes in chat]

M requests removing the separate Chat row marks selector and making nested chat/subagent rows use the same state indicator, smaller and slightly less opaque. Keep Look's per-state preferences. [verified: M chat 2026-11-24]

## Goals / Non-goals

Success checked 2026-11-24: both native-host sidebar and Morphise replacement use selected ring/color/speed after hydration/remount; nested ring 12px at 80% opacity versus main 14px/full opacity. Same semantic colors/rotation for each state; no pulse in ring mode. Guardrails zero altered grouping/indent/state/click behavior, existing device records readable. No new host/installation changes, no fix to unrelated Run-button issue or pending Paseo main merge.

## What is true today

StatusMark is used by nested chats/subagents, main workspaces and top-level chat rows. Its `still` suppresses parent pulse when running shown below; that behavior must not suppress selected ring speeds. Branch mark is derived by sidebarLook then styles.branch.dashed, and read only in StatusMark. UI editor saves separate device branchMark. [verified: client/sidebar-view.tsx:161-162,317-323,417,1007,1198; client/forms/tabs.tsx:1005,1058-1068; shared/view-state.ts:32]

Current ring CSS/installer is independent of restyle and subscribes to profile prefs. Preview scoped separately. Host children retained. Existing test uses host-shaped slots, not replacement sidebar. [verified: client/polish/web/sidebar-status.ts; client/sidebar-status.browser.test.ts]

## Options considered

| Aspect | Shared presentation for both renderers (chosen) | More native selectors |
| --- | --- | --- |
| How | Own reusable subscribed status component + shared ring CSS | Target more host markup |
| Fit | Fixes owning Morphise row layer | Does not reach Morphise StatusMark |
| Gives up | Desktop/web ring scope; native fallback stays static dot | Correctness after sidebar replacement |
| Cost/risk | Small component/wiring/test change | Small but repeats symptom patch |
| Evidence | component is replacement owner | native-only selectors cannot match it |
| Completeness | 9/10 desktop/web scope | 3/10 incomplete |

RECOMMENDATION: share ring rendering/validated preference resolution across both sidebar paths.

## Decision

Extract StatusMark's visual into client/sidebar-status-mark.tsx. It subscribes to actual usePrefs so preference changes reach existing rows; use exact own testID markers to join existing generated CSS. Inner visual footprint remains 14px; nested scales to 12px with 0.8 wrapper opacity. Preserve status labels and stable 16px sidebar slot/20px title line. Ring mode hides only legacy fallback child; state geometry and reduced-motion rules are identical to host/preview. Native platform fallback remains dot, no claim of mobile ring. In Paseo-default mode Morphise's own default is plain dot (no obsolete dashed option); native host remains untouched. No polling/mutation repair loop. [decided: M, chat 2026-11-24]

Remove Chat row marks control and its device hook and styles.branch.dashed consumption. Retain branchMark saved schema and sidebarLook field as deprecated read compatibility; no rewrite/delete of stored device data. Existing branch/tree lines unaffected. `still` props and runningShownBelow import become unused and removed; no parent ring suppression. [decided: M removal request]

## Cost and scope

Estimate 20-40 minutes (assumption from prior small patch), mainly browser replacement-path fixture. Risk state-selection/opacity drift; test literal size/opacity/speeds/color and hydrate transition. Blast radius sidebar indicator only plus settings control removal. Reversible source; saved compatibility retained. Existing isolated checkout branch from released main reused; no new dependency/asset.

## Design

Profile -> prefs store -> shared CSS + subscribed component -> main/nested row (changed).

Use existing tokens/colors/status labels and CSS rotation. No provider logo/pulse. Reduced-motion handles own markers too. Unknown state not synthesized; main loading placeholder skeleton remains separate. Preview/store scope preserved. Native fallback explicit; host clock limitation unchanged. Empty config defaults, invalid config validated by existing resolver; no network/auth/schema migration/new concurrency. Design references prior plan's design.md/ADAPTATIONS/craft floor. Existing sidebar text/actions unaffected.

## Risks and mitigations

| Risk | Impact | Check |
| --- | --- | --- |
| Replacement component not wired | Recurrence after hydration | Browser imports real StatusMark and production component, swaps native rows for replacement |
| Nested color/speed drift | Different meaning | Main/nested same CSS properties; nested scale/opacity alone |
| CSS disappears on settings close | Same symptom | Unmount settings with live installer retained, verify rings |
| Removed setting breaks old profile | Data loss | Retain device schema; existing view-state tests plus compatibility note |
| Host/native style fallback | Misleading certification | Test native host remains restored, own default plain dot, desktop/web scope documented |

## Acceptance criteria

1. Given replacement sidebar mounts after native slot removal, ring remains visible in actual StatusMark consumer for all five agent states.
2. Given nested/main same state, color/speed match; main 14px/full and nested 12px/0.8, no pulsing even if parent shows running descendants.
3. Given settings close/profile hydration/new prefs/reload, existing rows preserve ring mode; reduced motion stops own arcs.
4. Given old branchMark device values, schema accepts them but UI no longer offers choice; no renderer branch-dash behavior.
5. Tests fail on old StatusMark/native-only CSS then pass with owning fix; typecheck/full/browser pass. No running install changes.

## Rollout and rollback

Independent plan check -> failing regression -> owning fix -> review/tests -> report. M's “finish all” covers source completion; no new production installation permission. Source release only if explicitly requested; do not silently mutate existing data. Undo source on request; no migration. Plan kept pending cleanup.

## Parts

| File | Action | Why |
| --- | --- | --- |
| client/sidebar-view.tsx | change | Delegate actual StatusMark; remove obsolete shape/pulse/still paths |
| client/sidebar-status-mark.tsx | new | Subscribed standalone visual for both row depths |
| client/polish/web/sidebar-status.ts and test | change | Own marker support and reduced-motion |
| client/forms/tabs.tsx | change | Remove Chat row marks control/hook |
| client/sidebar-status.browser.test.ts | change | Actual consumer/hydration/nesting regression |
| README, CHANGELOG, this plan/RCA | change/new | Correct shipped claims and evidence |

- [x] Prove old replacement path fails, independent plan check/fixes.
- [x] Implement subscribed component/shared CSS/removal; all depths/state/settings close tested.
- [x] Typecheck/full/browser/review and completion evidence.

## Independent check

Independent: no architecture blocker. Browser execution must-verify resolved with explicit enabled invocation below and replacement consumer lifecycle assertions. Caller inventory note fixed: no grouped headings. Applied, not re-checked.

## Changes made

2026-11-24: actual StatusMark delegates to subscribed SidebarStatusMark; shared CSS includes own markers, reduced motion and all states. Removed Chat row marks control/hook and dashed rendering; legacy schema retained. Removed now-unused pulse-suppression agent subscription and imports. No stored data changes.

## Open questions

None for approved source scope. Existing installation stays read-only.

## Browser execution gate

Run explicitly (must not skip): `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/sidebar-status.browser.test.ts`. Imports actual StatusMark from sidebar-view.tsx, renders main/nested, checks post-settings-unmount and later prefs hydration, reduced motion, exact size/opacity and shared speed/color.

## Final review and verification

Fresh read-only review: no blocking source defect; completion-record note fixed here. Review partial after guessed helper path failed; parent verified actual helper lives shared/view-state.ts:47-60, legacy branchMark still decoded but no renderer/form consumer. Applied, not re-checked.

Executed enabled browser test passes all own component states/depths, settings close/late hydration and reduced motion; no skip. Typecheck and full suite pass. Fixtures render actual source StatusMark with SDK boundary stubs, not installed-host pixel certification. Pending: no commit/release/install in this source task.
