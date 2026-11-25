# Native sidebar indicator geometry and quiet counts

- Date: 2026-11-25 12:42 IST
- Status: done locally; approved direction by M: finish all; full because visible UI and existing preference interpretation change
- Base: d274b5316862be68d35e2cc72dd4e57113fa36cf; existing isolated worktree

## Context and goals

M requests hidden zero counts, smaller quiet counts, no toolbar separators, native Paseo working blue and native dot/ring geometry. Amber/red/green remain for permission/failure/attention. Done must have only a center dot. M explicitly corrected neutral-color proposal. No release/install in scope. Success: zero visible0counts, geometry6pxdot/12pxring/1.5pxstroke across states; no done ring. Guardrail no state/filter/message data changes. Local verification2026-11-25.

## What is true today

Counts always render in tabs, header inserts divider twice, project headings can show0/settled. [verified: client/sidebar-focus.tsx:10-12; client/sidebar-view.tsx:1247,1320,1467-1468,1545-1573]
Native geometry6pxdot/12pxring/1.5pxstroke, track.3/head.9, period900ms; color from statusDotRunning. [verified: ../paseo/packages/app/src/utils/status-indicator-geometry.ts; ../paseo/packages/app/src/components/status-ring/geometry.ts,frame.tsx]
Current CSS uses radial dot,1px border,custom size/color and always closed done track. Replacement nested scales.8. [verified: client/polish/web/sidebar-status.ts; client/sidebar-status-mark.tsx]

## Options and decision

| Aspect | Fixed native geometry (chosen) | Keep custom sizes/colors |
| --- | --- | --- |
| Fit | Matches explicit request | Can silently break match |
| Cost | Small owner changes and regression updates | Less change but incorrect |
| Tradeoff | Size/color preferences inert, readable for rollback | Inconsistent geometry |
| Completeness | 9/10 | 4/10 |

One owner constants6/12/1.5; main/nested same geometry (supersedes former80%size), nested opacity retained. CSS before actual6pxdot, after12pxring with.3 track/.9 arc, done after display none regardless speed. Running/loading var(--colors-status-dot-running), native-theme variables for other states with existing plugin-theme fallback. Replacement uses same shared dimensions and fallback statusColor for native/mobile. Preview matches. Keep style selector and rotation choices, remove size/color controls and say theme-owned. Read legacy config, ignore size/color; no destructive migration. Keep speed choices, default working900ms. No new API/dependency/network.

## Design and risk

Reuse kit/tokens, theme variables; filled equal-width tabs unchanged. Counts10px, no badge, hide0 visually and in tab names. Project summary only nonzero states, no0settled; group counts guarded >0. Remove divider definition/style/usages not unrelated borders. Empty/loading/error existing. No auth/data writes. Source rollback only on M request; old schema preferences retained. Theme live change tested; CSS fallback supports host without statusDot vars. No claim full native-host certification.

## Acceptance and tests

- Same6/12/1.5 at every state/native/replacement/preview, done only dot, live theme working color, reduced motion stops rotation.
- Legacy size/color cannot change appearance; speed remains configurable; reset scoped; style=paseo restores host nodes.
- No0counts, subdued nonzero, no toolbar dividers, tabs still equal-width filled selected.
- Typecheck, focused tests, enabled browser and full suite/diff checks pass; render screenshots inspected.

## Parts

- [x] Shared geometry/CSS/renderer/settings + regressions.
- [x] Counts/dividers + browser regressions/docs.
- [x] Full verification and handoff.

Files: shared/polish/sidebar-status.ts/test; client/polish/web/sidebar-status.ts/test; client/sidebar-status-mark.tsx; client/forms/sidebar-status.tsx; client/sidebar-focus.tsx; client/sidebar-view.tsx; browser tests; README.

## Independent check

Independent plan check:0blockers,1must-verify and1note. Addressed theme variable present/absent/live checks in enabled browser across host/replacement/preview; verifies light/dark blue and warning fallback. Effort budget one local session, estimate not measured; first cut decorative changes, not geometry or color parity. No final independent diff review yet.

## Changes made

Implemented geometry/theme-owned color/done-dot-only, equal nested geometry and settings cleanup; zero counts hidden and toolbar dividers removed. M additionally requested assistant-only previews beginning at full response start. Inspected native reducer: live assistant items are appended chunks (../paseo/packages/app/src/types/stream.ts:945-989); changed shared history extraction/live observer to assemble before cleanup/truncation and exclude user messages, with beginning/word-boundary regressions.

Verification: typecheck PASS; unit17indicator tests and7message tests PASS; all4enabled browser suites PASS; full suite1398passed28skipped, log /private/var/folders/vm/dcb_27hs4t50mktlkq73b7ww0000gn/T/opencode/native-indicators-final-tests.log; git diff --check PASS. Indicator screenshot inspected at700px, captures also360/1440. SDK widget/icon adapters mean no installed-host certification. CSS border1.5 rounded to1 even2x, replaced owning ring geometry with radial mask12pxouter/9pxhole (1.5band). Theme/ring computed checks pass. Calendar fixture clock pinned to2026-11-24T16:30Z after morning run correctly omitted future14:00event; all browser checks now deterministic relative to fixture.

No commit/release/install. Existing80%size rule superseded by M's same-size request; nested opacity.8retained. Legacy preference parsing unchanged. Rotation values remain configurable; size/colors fixed. No data/title changes.

## Open questions

None; M delegated completion. Fresh diff check offered after completion.
