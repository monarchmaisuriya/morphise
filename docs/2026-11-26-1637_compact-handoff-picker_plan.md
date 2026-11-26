# Compact Quick Chat handoff picker

Status: local implementation verified; local implementation only. Full because visible flow changes; server creation/recovery unchanged.

## Goal and current state

M requested clean, consistent UI after screenshot showed every project in a large card containing a full-width button. Current source renders projects and existing workspaces in successive lists, repeats headings and uses panelStyle padding20/gap16 per project. [verified: client/quick-chat.tsx:199-218]

## Decision and scope

Use New workspace / Existing workspace selection, compact destination rows in one bounded list, one configuration area and one Review context action. Preserve source/chat recovery, readiness blockers and existing server safeguards. Default Existing workspace preserves current entry behavior; new creation requires switching explicitly. Keep all search fields/results; compact Refresh/Open source toolbar actions and short helper. Handoff gets one task title rather than duplicate Quick Chat headings. Review/result remain intact.

Files: client/quick-chat.tsx, client/quick-chat.browser.test.ts, README.md. No schema/server/dependency changes, no release/install. Source selection state clears on mode switch/reset; selected ID revalidated against latest refreshed list before enabling review, so missing IDs cannot create or prepare. Empty/loading/error/blocked states explicit. Long names/paths ellipsize visually but accessible names preserve full identity. Narrow layout wraps tools and form controls. Theme colors and existing primitives only; no new focus order tricks or nested clickable buttons.

## Alternatives and cost

Keep all project cards with reduced padding rejected: still duplicates actions and lists. One compact selected-destination flow recommended: less scan load, slightly more deliberate selection. Estimate30-45minutes (unverified), blast radius handoff view/tests only, rollback source; no stored data migration. Accessibility target AA for changed controls; no full certification. Design sources orchestrator references/design/ADAPTATIONS.md, impeccable/WORKFLOW.md and craft-floor.md.

## Acceptance and parts

- [x] New and existing destinations separated, all searchable and reachable; one Review context action.
- [x] Compact project rows with no per-project nested action cards; bounded list and stable selection styling.
- [x] New mode has one settings area with mode/base/ref warning; existing mode review uses selected workspace.
- [x] Blocked/busy/missing destination prevents review; reset/switch clears selection; creation/recovery safety unaffected.
- [x] Browser tests both modes, new worktree/shared/nonGit, narrow/light, keyboard; inspect screenshot; typecheck/all browser/full suite/diff.

Success: compact rows <=72px for normal text at500px surface, list max-height320px and no horizontal page overflow at360px. Guardrail: zero creation calls on row selection; preserve single creation after review. Check before handoff2026-11-26. No production writes; normal installation untouched. Testing fixture may not prove installed visual parity, state limit.

## Independent check

Independent plan check: one must-verify selection lifecycle addressed by clearing selection on search/refresh/type switch, resetting mode/base on project choice, guarding busy selection changes and testing hidden-selection clearing/zero preparation calls. Non-skipped browser execution required. Applied, not independently re-checked.

## Changes made

Implemented compact picker and explicit selection/review for both destination types. Browser fixture screenshot inspected; row-height<=72px and one Review/no nested project buttons asserted. Synthetic icons only; no installed-client visual certification.

## Open questions

None. M approved direction. Keep plan until asked to delete.

Verification: typecheck,all five enabled browser regressions,full suite1,418passed/29skipped,diff check pass. Log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/compact-handoff-picker-tests.log. No commit/release/install.
