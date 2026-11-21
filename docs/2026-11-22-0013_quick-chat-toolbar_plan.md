# Quick Chat compact toolbar and provider icons

- Date: 2026-11-22 00:13 IST
- Status: implemented/reviewed/verified; v0.51.1 release in progress under M's explicit authorization
- Worktree: morphise-quick-chat-toolbar; branch quick-chat-compact-toolbar; base fb1717b
- Scope: Quick Chat UI/model presentation/tests/docs/release. No daemon, archive, persistence, registry or installation changes.

## Context and problem

M requests removing Your chats row, moving Refresh to the lower filter toolbar at the right edge, removing Start with, and replacing provider-name/separator text with the provider icon beside the model name. Preserve existing selection, model memory, archive/filter/sort/search/handoff/recovery. [verified: M screenshot/request]

## Goals / Non-goals

Success: no Your chats/Archived chats heading row or Start with label; Refresh aligned right on Active/Archived/provider/sort toolbar, including empty lists. Picker trigger and options render provider icon + model name without provider text or separator; full provider/model retained in accessible labels to distinguish duplicate model names. Counts remain in Active/Archived tabs. Guardrail: unchanged actual provider/model identifiers, no silently switched provider, no asset/dependency copy, no overflow at 360/700/1440 dark/light. Verify locally/release 2026-11-22. No live list behavior, backend, archive policy, new customization or installation.

## What is true today

client/quick-chat.tsx uses local Section only for chats heading/actions; Refresh callback lives there, controls below. Start with is separate Text; modelChoices labels are provider label + middle dot + model label. [verified: client/quick-chat.tsx local Section/start/list; client/dispatch-options.ts:46-65]

Host provider snapshot contains optional iconSvg; plugin Icon supports serializable SVG through icon prop and Morphise's wrapper preserves icon box. [verified: official Paseo protocol/src/messages.ts:415-427; installed plugin/dist/client/ui.d.ts:33-41; client/ui/kit.tsx:14-23] Shared Select/MenuItem only support string icon names. Extending global kit would increase blast radius for this single picker. [verified: kit.tsx:513-550]

## Options considered

| Aspect | Change shared Select/dispatch labels | Quick Chat-specific model picker (chosen) |
| --- | --- | --- |
| Mechanism | Extend generic icon slots, remove labels globally | Reuse Dropdown/MenuItem behavior with local custom option rows |
| Fit | Could affect Dispatch/all selects | Confines presentation to requested surface |
| Gives up | Higher regression surface | Small dedicated picker, no general abstraction |
| Cost/risk | Moderate / shared contract changes | Small / duplicate models need accessible identity |
| Failure | Other pages lose provider context | SVG absent -> neutral CPU fallback with full label |
| Evidence | generic Select string icon | snapshot iconSvg + Icon icon prop |
| Completeness | 6/10 | 10/10 scoped behavior |

RECOMMENDATION: local picker driven by existing provider snapshot; never parse labels to split provider/model.

## Decision

Introduce pure quickChatModelChoices mapping based on existing modelChoices order/value/provider, then resolve exact provider/model metadata to obtain model label, full accessible label and optional host iconSvg. Never split the human-readable “ · ” label; model IDs can contain slash, use provider prefix only to locate model. Custom providers follow same metadata. Unknown/missing icon uses Cpu. No fetched/copied logo assets; rendering uses host icon API. Accessible name e.g. Provider and model: Fake · Test. Change remains full; option radio name remains full for unambiguous screen readers, visible label Test only. Trigger missing/unavailable label unchanged.

Local ModelPicker owns open/ref and current choice; uses existing PopoverHost/Dropdown positioning/dismissal, Pressable radio states, Icon wrapper and token dimensions. Blocks changes while busy through explicit disabled trigger/option semantics. No new global kit interface. Refresh retains same callback/busy/loading/error behavior inside fixed-width action wrapper at toolbar right, left group wraps. At narrow width allow toolbar wrapping with Refresh trailing/right on its own line if necessary, never overlap; test exact desktop alignment and narrow right-edge/reachability. No bottom-of-screen sticky toolbar implied by the screenshot.

## Cost and scope

Assume 30-60 minutes plus tests/review/release, based on prior small UI follow-ups. Only UI and pure model presentation helper, test fixtures/docs/package. No schema/state migration. Cut optional cosmetic tweaks first, not provider identity/accessibility checks. Undo patch only if requested; preserve worktree/branch until approved cleanup.

## Design

Hierarchy: header -> model/New Chat row (no extra label) -> divider -> wrapping list controls + right Refresh -> title search -> chat rows. Active/Archived tab counts replace redundant heading count; all info/archive/continue functions stay. Provider icon sizes fixed at 16; model text minWidth 0/one-line ellipsis. Full identity stays in accessibility/tooltip and option radio labels; duplicate visible labels differentiated by icons, screen readers fully identify provider.

Checklist: safe defaults no setting/API change; compatible presentation only. Quality measured six viewport/theme cases, empty/populated/control bounds. No auth/retention/production service change. Provider icon is already host-provided validated plugin icon input; no remote image/network/asset loading. Data no extra collection. Reuse current tokens/dropdown focus/keyboard behavior; keyboard selection and labelled roles tested, not full certification. No experiments/capacity/new dependencies. Edge cases missing icon, custom provider label, model IDs with slash, duplicate model labels, unavailable model, provider updates. Existing model persistence/manual selection/uncertain create guards unchanged.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Parsing human label picks wrong provider | Wrong model | Resolve metadata via stable provider/model IDs; exact identifier tests |
| Icon missing/unusable | Ambiguous display | Cpu fallback for absent data, full accessible provider/model identity |
| Refresh displaced on wrap | Hard to find | Right-aligned trailing wrapper, measured toolbar geometry |
| Tests assert removed heading | False failure | Assert tab counts/list content instead, not a replacement hidden heading |
| Host icons introduce attribution issue | Wrong credit | Use host-provided runtime metadata, no copied logo assets, retain existing notices |

## Acceptance criteria

1. Header labels Your chats/Archived chats/Start with absent; Active/Archived counts remain correct.
2. Refresh at right of lower list-control toolbar, vertical center on desktop, no overflow narrow; still reloads list count/content.
3. Trigger/options show provider icon + raw model label, no provider prefix/dot; full provider/model accessible names and actual identifiers preserved.
4. Missing/custom icons and duplicate labels handled without wrong provider/model or hidden selector.
5. Existing model hydration/preferences/native navigation/archive/handoff/recovery/browser scenarios pass.

## Rollout and rollback

Local worktree -> checked plan -> regressions fail old UI -> implement -> responsive screenshots/tests -> independent code review/refute/fixes -> typecheck/full/diff -> patch/minor metadata -> final tests -> commit/push/head-guarded PR merge -> identical-tree release. M explicitly authorized delivery. No registry/install. Rollback only source on request; no data effect.

## Parts

| File | Action | Purpose |
| --- | --- | --- |
| client/quick-chat.tsx | change | Remove headings, toolbar Refresh, local model picker |
| client/quick-chat-models.ts and test | new | Provider icon/raw model label mapping without changing identifiers |
| client/quick-chat.browser.test.ts | change | Provider icon fixture and visible/accessibility/toolbar parity |
| README/OVERVIEW/CHANGELOG/package/lock | change | Wayfinding/release metadata |
| this plan | create/update | Scope/review/evidence |

- [x] Pure model presentation/helper tests cover raw labels, stable slash-containing IDs, host icon metadata, missing icon and duplicate labels. First run missing module was setup evidence only; mutation proof below verifies behavior sensitivity.
- [x] Implement UI and inspect desktop/narrow captures. Empty/populated refresh, removed headings, right toolbar edge, provider identity/rendered synthetic SVG and existing flows pass.
- [x] Independent code review/refutation/fixes complete. Final package checks and authorized commit/push/merge/release follow.

## Independent check

Independent plan review: no blocking, one must-verify icon-test gap. Fixed fixture to inspect exact icon prop/value and creation input. Remaining criteria passed. No global kit change. Applied, not re-checked.

## Changes made

2026-11-22: implemented local model metadata mapper/picker, removed Your chats/Start with, moved unchanged refresh callback into lower controls row with reserved right space. No server/persistence/dependency change; shared Select/Dispatch unchanged. Provider SVG comes from Paseo runtime, not copied/downloaded logos. Existing notices unchanged.

## Review

Fresh code review found blocking collision ambiguity plus keyboard/render verification gaps; separately refuted and upheld. Fix: show small stable provider-ID badge only for duplicate model labels; otherwise icon+model only. Trigger/options have full-identity tooltips/accessibility names. No claim of universal trademark/logo audit. Unit/browser checks confirm iconless collision choices distinguishable and select correct IDs.

Keyboard test exposed React Native Web radio Pressable Space not activating; added local DOM-boundary onRadioActivate helper in client/web.ts, keydown Space/Enter with repeat guard/cleanup, native no-op. Existing Dropdown dismissal retained; focus returns to trigger after selection. Enter open, Space select, focus-return and backdrop-dismissal regression pass. Escape routing remains host-owned, not changed/certified. Synthetic host adapter renders a valid SVG for exact prop-pixel wiring, not production Icon internals; real installed provider-logo pixel certification not claimed.

Responsive open-picker cases include radio bounds at 360/700/1440 dark/light; fixed wrapping group overflow then reserved refresh width beside controls. Initial right-edge test accidentally compared inset input text rectangle; corrected to outer search control and retained 2px tolerance. User confirmed continue after earlier outside-backdrop test mismatch. All actual failures reported, no skipped/weakened assertions to go green.

## Verification

- `npm run typecheck`: PASS.
- `npm test -- client/quick-chat-models.test.ts`: PASS, 2 tests (raw model label, custom provider/ID, duplicate names and missing icon).
- `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/quick-chat.browser.test.ts`: PASS non-skipped; icon prop identity/inline synthetic SVG, exact duplicate-label selected IDs, keyboard/focus/dismissal, open menu/radio bounds, refresh lower-toolbar center/right edge/empty counts and all previous preferences/archive/handoff cases.
- `npm test`: 1313 passed / 25 existing default skips at pre-packaging source; rerun after final edit. Browser separately enabled above.
- `git diff --check`: PASS before packaging; rerun final.
- Captures approved temp quick-chat-toolbar-final-captures, home-360-dark/1440-dark inspected. Synthetic non-provider icons are placeholders; production uses unchanged host Icon API.
- No copied provider assets, new dependency/license, daemon/write change, registry or installation action.

## Open questions

None for exact screenshot-driven scope. “Bottom toolbar” interpreted as list-control row below removed heading, not sticky page footer; announced to M before implementation.
