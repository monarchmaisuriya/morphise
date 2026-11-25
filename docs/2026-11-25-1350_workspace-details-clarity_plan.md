# Clear workspace details and activity explanations

- Date:2026-11-25 13:50 IST
- Status: done locally; approved by M "go"; full because visible UI semantics change; M requests explanation and cleanup
- Scope: existing isolated Morphise worktree; no release/install/Paseo edits

## Context and goals

M finds ~9m/24h and current popover cluttered. Explain recorded summed-agent runtime vs row age, partial coverage reasons, actual rolling window and refresh. Preserve all existing workspace/Git/service/label/checkpoint details, with no repeated title/path/branch/PR or four empty checkpoint fields. Success local2026-11-25: one titled header, explicit activity/source labels, one empty checkpoint message; guardrail unchanged runtime totals and no mutations.

## What is true today

Runtime partial flag is triggered by recordingSince after window start, pruning or excluded uncertain records. Runtime sums parallel intervals and excludes uncertain. Current details repeats branch/PR outside WorkspaceCard, shows all empty checkpoint fields and puts close/refresh at bottom; kit Dropdown supports a fixed header. [verified: client/sidebar-runtime.tsx:32-44; shared/sidebar-runtime.ts:4-22; client/sidebar-view.tsx:1096-1109; client/ui/kit.tsx:442-493]

## Options and decision

Chosen: grouped sections in existing popover with fixed title/refresh/close header; Activity summary and coverage facts before workspace technical details, checkpoint populated fields only. Alternative separate modal rejected: unnecessary interruption and parallel detail owner. Hover version same facts without action controls, passive. Main header title shown once; Current state separate from row time meaning. Never call fallback age state duration. Numeric sidebar ~ remains compatibility, details expands it as Incomplete recording (may undercount), not guessed duration. Parallel-agent sum may exceed24hours; human work explicitly excluded. Pruning global is conservative indication not proof this workspace lost data; say older records removed and total may be incomplete. Unknown/failed/local host states explicit. No new data/dependencies/storage.

## Design

Existing kit/tokens. Header contains full title and icon controls; body sections Status, Agent activity (last24hours), Workspace, Checkpoint with separators/proximity not nested cards. Height bounded by existing dropdown scroll, header fixed; width360 fits sidebar clamp. Runtime details component shares read snapshot with inline label, shows confirmed total, window from/to, refreshed time, recording start and reasons, plus expandable calculation explanation for interactive card; hover compact full explanation in brief text. Keep every populated technical fact, selectable path/branch/title. One checkpoint empty instruction explains four fields without four Not recorded lines. Single shared field formatter for age source/time identity, deterministic unit tests if added. Copied references design/ADAPTATIONS.md and impeccable/reference/clarify.md; existing surface quality floor before edit. No full AT/installed-host claim. Keyboard close/refresh labelled; tests verify header not scrolled out, narrow width and empty/error details. Same old host RPC gate. No new auth/telemetry.

## Cost/risk

Estimate one focused session, unverified. Reversible source. Risk stale/mislabelled snapshot mitigated sharing runtime state and explicit cutoff. Risk missing fields mitigated preserve card Git/services/labels and test populated/empty checkpoints. Cut optional progressive disclosure first, not truthful source labels. No data migration. Existing host auth/read boundaries unchanged. No A/B/performance claims, no additional RPC. Unknown timestamps omit numeric age with descriptive unavailable text in details.

## Acceptance and parts

- [x] Runtime explanation includes total,24hwindow, partial causes and parallel sum/human distinction; no-source states honest; tests.
- [x] Existing detail card grouped, title/path/branch/review once; fixed close/refresh header; checkpoint empty compact and populated fields retain attribution; row age labelled by actual chosen source.
- [x] Typecheck/focused/full/enabled browser checks; docs; render inspection360/700.

## Files

client/sidebar-runtime.tsx; client/sidebar-view.tsx; shared/sidebar-focus.ts/test; client/sidebar-information.browser.test.ts; README.md.

## Rollout/rollback

Local source only; preserve current checkout/user work. Existing isolated worktree reused. Restore source only on M request; no stored data changes. No commit/release/install authorization.

## Independent check

Independent partial check:0blockers,2must-verify. Resolved checkpoint-only refresh contract with fixed-header accessible label and explicit snapshot cutoff captured before request. Read full WorkspaceCard and preserved changes/host/path/full branch/dirty/sync/review title/state/checks/services/labels once; removed duplicate outer lines. Timestamp shared selector returns source label+at+elapsed for both row/details. No final independent implementation review.

## Changes made

Implemented grouped detail popover, fixed title/refresh/close header, shared timestamp-source selector, short runtime summary with expandable calculation/coverage, populated-only checkpoint fields and one empty explanation. Runtime calculations and source snapshots unchanged.

Checks: typecheck PASS;10sidebar-focus unit tests PASS; all4enabled browser suites PASS; full suite final count in chat, log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/workspace-details-final-tests.log; diff check PASS. Browser verifies populated/empty checkpoint transitions, explicit checkpoint refresh, activity summary/expanded explanation/cutoff and fixed-header controls; snapshot render inspected500pxfixture. Limit: full populated Git/service/checks matrix not browser-certified; source inventory preserved fields. Installed-host/full assistive technology certification not done. No release/install.

## Open questions

None for requested cleanup; no runtime metric changes.

## Row-height follow-up

M provided9.16second recording. Extracted8frames via system AVFoundation (ffprobe absent). Row grows when2x2actions appear; owning RowShell sized by whichever content mounted. Added actionRows contract for workspace rows, reserve2button heights+12pxvertical inset in both idle/focus, same6pxgrid insets. Browser compares resting row height and following rowYbefore/after focus; mutation removing stable height is killed with "Action grid must not change row height", exact source bytes restored. Full typecheck/all4enabled browser/full suite/diff check PASS after restoration; log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/workspace-row-height-final-tests.log. No production install/source changes outside Morphise.
