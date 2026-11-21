# Quick Chat header alignment

- Date: 2026-11-21 22:37 IST
- Status: done locally; full because visible UI behavior changes
- Repo: Morphise; branch quick-chat-header; base bcb3b8d8cc74b7eb45fb356f0603b3d48dd04f87
- Authorization: M confirmed “continue” after the exact Refresh alignment/remove-header-shortcut scope was presented. Local changes/testing only, no delivery or installation authorization.
- Subagents: one independent plan check

## Context and problem

M wants Refresh right-aligned on the Your chats heading row, and no Settings shortcut in the Quick Chat header. Settings already reside in the registered plugin page. The current Refresh is in the search row, which becomes a lone icon on another row when the list is empty. [verified: client/quick-chat.tsx:17-18,94,134-135,182]

## Goals / Non-goals

Success: heading and Refresh share a vertically centered row; Refresh sits at its right edge for empty/populated lists at 360/700/1440px. No top-right Settings action; plugin Settings → Morphise → Quick Chat remains registered. Guardrail: zero removed settings, refresh/recovery capabilities, RPC changes or new page overflow. Verify locally 2026-11-21. Non-goals: live chat subscription, polling changes, remove Refresh, redesign recovery, release/install.

## What is true today

The visible list reads quickChatList on mount and manual refresh; the registration's separate 15-second poll only updates composer pills. Settings button navigates to a separate registered screen. [verified: client/quick-chat.tsx:54,69,94,135,166-182]

Section is local and used only for Your chats; extending it with optional header actions does not change shared kit behavior. Existing loading/busy guard and error handling remain. [verified: client/quick-chat.tsx:17-18,60-64,134-140]

## Options considered

| Aspect | Remove Refresh | Align existing fallback (chosen) |
| --- | --- | --- |
| How / fit | Delete manual action | Place existing handler in Section header |
| Gives up | Recover/reload without leaving screen | Still manual rather than live list |
| Cost / risk | Small, loses functionality | Small, UI layout only |
| Failure | Stale or failed list cannot retry directly | Narrow row must fit |
| Evidence | mount-only list read | local Section + existing IconButton |
| Completeness | 4/10 | 10/10 of confirmed scope |

RECOMMENDATION: align existing fallback, because the visible list has no live update subscription.

## Decision

Keep manual Refresh, move it into the heading's far-right slot; remove only header Settings button. Keep disabled-state Open Quick Chat settings affordance and instructional error text, since those guide setup/recovery rather than add redundant chrome. Plugin settings registration/component unchanged. [decided: M, chat scope confirmation 2026-11-21]

## Cost and scope

Estimated 15-30 minutes (assumption). Scope one client component, its browser test and wayfinding docs. Reversible local UI diff, no schema/storage/backend changes. Stop for unexpected data/action behavior. Cut optional screenshot polish first; tests stay mandatory.

## Design

Section gets optional ReactNode actions; heading row uses flex row, alignItems center, justifyContent space-between, minWidth 0 and gap 12. Title flex-shrinks so icon remains visible. Search field stays in its own row only when chats exist; no empty spacer row. Existing refresh callback/disable states stay intact.

Checklist: safe defaults/contracts/auth/data/reliability/config n/a (no change). Quality/accessibility: named Refresh icon retains tooltip/accessibility name and button size; bounds/alignment checked at narrow/wide sizes, both list states. No new personal data or network boundary. Views: title + action row, no multi-step architecture diagram necessary. Production/experiments/capacity/growth n/a (local layout fix). Missing dependencies: existing browser runtime supplied explicitly, no installs. Edge cases: empty list, failed refresh, pending disabled, populated search, no settings shortcut and settings page intact. Leverage local Section only. Design source: orchestrator design.md, ADAPTATIONS.md, impeccable/reference/layout.md and craft-floor.md; preserve existing tokens. No source launcher/detector tooling installed.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Test relies on removed Settings shortcut | Fixture failure | Navigate through registered plugin settings entry, verify registration |
| Header title pushes icon outside bounds | Hard to refresh | Shrinkable title + fixed named icon; measure bounds |
| Refresh functionality accidentally altered | Stale list | Keep callback and assert call/read result change |

## Acceptance criteria

1. Given empty/populated list, then Refresh center aligns with heading center within 2 CSS px and is far-right in same header.
2. Given manual Refresh, then list RPC reruns and updates count/content, without mutations.
3. Given Quick Chat header, then no Settings button; registered plugin settings page and disabled setup access remain.
4. Given responsive layouts, then no button/page overflow; existing handoff/recovery regression still passes.

## Rollout and rollback

Local worktree only. Tests fail on pre-change geometry, then pass after owning Section layout change. Typecheck/full suite/diff check gate completion. No flag/migration. Undo only this patch if asked; never delete worktree with changes unasked. No commit/release/registry/install included.

## Parts

| File | Action | Why |
| --- | --- | --- |
| client/quick-chat.tsx | change | Section header action; remove top shortcut |
| client/quick-chat.browser.test.ts | change | Registered settings access, empty/populated alignment + refresh |
| README.md/OVERVIEW.md | change | Remove inaccurate top shortcut wording |
| this plan | create/update | Scope and proving evidence |

- [x] Browser regression: pre-change failed “Refresh must align with chat heading”; post-change empty/populated center alignment within 2px and right-side placement pass. Refresh reruns list RPC and changes count/content. Registered plugin settings component is captured from actual registration and remains usable; no header Settings button.
- [x] Component/docs change; typecheck, focused UI/full suite and diff check pass. No refresh callback/loading/busy behavior changed.

## Independent check

independent: present as is, 0 blocking/0 must-verify, one note fixed: explicit enabled browser command below prevents skip-as-pass. Reviewer confirmed exact scope/manual-refresh rationale/settings registration preservation. No second reader claimed.

## Changes made

Moved unchanged manual-refresh action into local Section header; removed redundant top Settings shortcut only. Updated README/OVERVIEW. Existing disabled-state settings setup access, registered settings page, model memory and Recover handoff remain unchanged. No schemas/backend/dependencies/license changes.

Verification:
- `npm run typecheck`: PASS.
- `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/quick-chat.browser.test.ts`: PASS, non-skipped rendered regression (2.96s); new heading alignment, empty list/count/refetch/settings registration assertions plus existing responsive/settings/handoff/model-memory tests.
- `npm test`: PASS, 1300 passed / 25 existing default skips, 8.11s. Opt-in browser test executed separately above. Log approved temp quick-chat-header-tests.log.
- `git diff --check`: PASS.
- Red evidence: pre-change exact browser regression failed on heading alignment; post-change green. No screenshot/physical-device certification claimed for this small follow-up; runtime bounds and prior responsive paths executed.
- M explicitly authorized commit/push/merge/release after local completion. Package v0.50.1 with final release checks; registry/install excluded. Worktree retained.

## Open questions

None; exact scope confirmed by M. No auto-refresh requested.
