# Quick Chat: task-first screen refinement

- Date: 2026-11-21 21:35 IST
- Status: done locally; full because user-facing workflow changes
- Repo/worktree: morphise-quick-chat-usability; branch quick-chat-usability; base 54bc4ef
- Scope: client/quick-chat.tsx, focused UI tests, README/OVERVIEW. No daemon/RPC/schema/persistence changes.
- Authorization: M requested significant clean/easy UI improvements without removing features, design skill, then “finish all”. Preserve existing Paseo identity; complete all implementation/test parts without routine pauses. No commit/release/install requested.

## Context and problem

The released screen is a full-width vertical sequence of paragraphs, equally prominent action bars, settings and recovery fields. Starting a chat is visually subordinate to disabling it. The provided screenshot shows excessive horizontal stretch and weak grouping. [verified: M screenshot; client/quick-chat.tsx:56-92]

## Goals / Non-goals

Success: in enabled home state, provider/model and one primary New Quick Chat action appear together; conversations are searchable, readable rows; settings/recovery are one clearly labelled action away. Handoff uses destination/review/result states, with active source identity and cancellation. Guardrail: every current function and disclosure remains reachable; no duplicate mutation or width overflow at 360/700/1440px. Verify locally 2026-11-21; any future release rechecks then.

Non-goals: changing native chat, server operations, recovery semantics, transcript inclusion, creation permissions, original retention, release or installation. Do not add model calls, fake metadata, new dependencies or decorative dashboards.

## What is true today

- QuickChatScreen owns enabled settings, provider snapshot/subscription, list, source/target/preview/edit/result, busy guard, recovery input. It calls existing typed RPCs and native navigation. [verified: client/quick-chat.tsx:16-94]
- Hook entry via params triggers project selection. Existing busy guard suppresses overlapping actions; attempted locks context after creation and permits read-only recovery. [verified: quick-chat.tsx:29-54,79-91]
- Native kit offers Button, IconButton, Select, Field, PopoverHost and tokens; Select needs PopoverHost and has no disabled prop. [verified: client/ui/kit.tsx:65-161,513-550]
- Data list supplies only id/title/workspaceId. No invented timestamps/status/model metadata on rows. [verified: shared/quick-chat.ts:7]
- Existing screenshot fixture in approved temp quick-chat-ui.cjs mounts actual screen using host adapters; latest server service tests exist. No production UI tests required.

## Options considered

| Aspect | Cosmetic spacing only | Task-first layout (selected) |
| --- | --- | --- |
| How | Smaller margins/buttons | Home start/list, secondary utilities, focused handoff |
| Fit | Same large sequence | Same state/RPC owners, meaningful view composition |
| Gives up | Poor priority remains | Extra UI-state coverage |
| Cost / risk | Low / incomplete | 1 focused session assumed / navigation state regressions |
| Blast radius | Screen only | Screen only, reversible |
| Failure | Settings and creation still compete | stale source/result if transitions not reset |
| Evidence | screenshot/source | existing state owners support view separation |
| Completeness | 4/10 | 9/10 within UI scope |

RECOMMENDATION: task-first layout because grouping, not just whitespace, generates the current clutter.

## Decision

M delegated completion after requesting same features and cleaner usability. Implement restrained native Operate surface. At most 1040px content column, centered with responsive insets; single-column list, no card grid. Header subtitle one line. Settings and Recovery labelled secondary toolbar actions; primary new-chat action only in start area. Keep storage/scratch details in settings, not remove them. All mandatory handoff warnings remain visible before creation, optional file/detail expansion may hold raw filenames but not hide exclusions/retention/provider.

## Cost and scope

Assumed 60-90 minutes, local UI-only. Preserve existing integrations and backend. Cut optional local chat search before any feature parity or safety check if time budget exceeded. No data migration; rollback only this task's diff on explicit permission. Previous feature behavior is base tree.

## Design

```text
Quick Chat home [changed]
  header: title/subtitle + Settings / Recover
  start: provider/model + primary New Quick Chat
  chat list: search/count/refresh + rows Open / Continue
  settings or recovery utility panel [changed, only on request]

Continue -> focused handoff [changed]
  back + source title + Destination / Review / Result progress
  target search -> target rows with paths
  review: destination/provider + partial warning + editable context
  exclusions/source-kept disclosure + file details + confirm/cancel
  result: open destination + explicit warning + recovery ID when needed
```

All existing actions map: enable/disable in settings (disabled onboarding also offers Enable); model selector/new chat in start area; list/open/refresh in conversations; Continue unchanged RPC in row; target search/cancel in destination; preview editor/count/file inventory/warnings/confirm/close in review; attempted recovery and separate recovery-ID lookup preserved; errors inline visible. Source and result reset on every new handoff to avoid mixing contexts. New local search filters titles only, leaves underlying list intact. Keep current model choice; never silently select another provider. Empty/no providers/loading/invalid settings/error/no navigation must explain why primary action unavailable, with Refresh providers via existing snapshot (or current subscription). Settings toggle during handoff remains outside active flow; no loss of editor draft on utility toggle.

Checklist: 1 no config/default changes. 2 compatible UI only, same RPC. 3 tested 360/700/1440px, light/dark, compact/normal, target long paths. 4 no service change. 5 no trust boundary changes. 6 hierarchy diagram above, deployables unchanged. 7 production n/a, local checks only. 8 target no WCAG AA regression: labelled buttons, expanded states, no new icon-only ambiguous action, selected progress text, error alerts, keyboard controls and focus review in browser. No new personal data. 9 no A/B. 10 existing browser fixture dependencies verified previously; do not install. 11 empty/loading/failed saves/long text/failed prepare/uncertain create/recovery invalid input tested. 12 home, disabled, settings, recovery, destination, preview/result widths are leverage cases. 13 retain input 40k/recovery ID bounds, no new limits except presentation width. 14 no speculative abstraction.

Sources: orchestrator design.md, ADAPTATIONS.md, impeccable/WORKFLOW.md, reference/layout.md, mode-operate.md, craft-floor.md; existing Morphise tokens/components are visual authority. Skill launcher/detector excluded per adaptations; manual source/render checks instead.

## Risks and mitigations

| Risk | Impact | Mitigation / proof |
| --- | --- | --- |
| Feature hidden too deeply | Hard to discover | Explicit Settings/Recover labels in header, disabled onboarding, parity checklist |
| Old handoff result shown for another chat | Wrong destination | Reset source/preview/result/attempted atomically on selection, source label visible, browser scenario |
| Narrow controls overflow | Cannot act | Wrap rows, minWidth:0, no full-width path labels; 360px measure |
| Preview accidentally discarded | User effort lost | Utility views do not alter preview; Back disabled after attempted unless close explicitly chosen; preserve conservative no-resend rules |
| Over-simplified safety copy | Disclosure lost | Always-visible target/provider/snapshot/exclusions/originals warning; raw details expandable |

## Acceptance criteria

1. Given enabled home, then model and New Quick Chat grouped; disable/storage/recovery forms absent until requested, accessible within one action.
2. Given any existing feature, then same operation remains reachable with unchanged inputs/semantics.
3. Given source selected, then source identity and current step visible; destination path shown before prepare; cancel returns home without mutation.
4. Given preview, then text editable before attempted, 40k count, destination/provider and all essential warnings visible; confirm calls create once; failed/uncertain state offers check without resend.
5. Given loading/disabled/no providers/error/no navigation/empty search, then explicit feedback, no inert unexplained primary button.
6. Given 360/700/1440px and long content, then no page-width overflow and all actions available by normal vertical scroll.

## Rollout and rollback

Local only. Entry checked plan under delegated finish-all. Run fixture baseline then new expectations, implement, typecheck/focused/full/render checks and compare screenshots. Abort if any prior operation is lost. No storage migration, flags or release. Preserve worktree and source files until M approves cleanup; undo only this diff if asked.

## Parts

| File | Action | Why |
| --- | --- | --- |
| client/quick-chat.tsx | change | Task-first view and state transitions |
| client/quick-chat browser test (new opt-in) or durable fixture | create | Preserve UX/parity test path |
| README.md, OVERVIEW.md | change | Updated feature wayfinding |
| this plan | change | Decisions/checks/status |

### Screen restructuring
- [x] Implement home/utility/handoff composition with all feature mappings. Home is max-width 1040, primary start area, searchable list; settings/recovery in labelled secondary panels; dedicated handoff destination/review/result flow.
- [x] Explicit provider/list/settings/error states and source reset. Delayed prepare plus external source B preserves source A; selected model removal blocks creation without substitution; pasted recovery result separate from active draft. Global errors visible as alerts. Empty/filter/no target feedback included.

### Verification and documentation
- [x] Browser checks at 360/700/1440, light/dark and handoff states. Source-bound draft, standalone recovery, model loss, settings access, file details, search, creation and narrow/light recovery pass. Captures manually inspected for enabled home, narrow home and review. No full physical-device/a11y certification claimed.
- [x] Typecheck, focused/full suite, diff check, docs. Exact evidence below, no release/install.

## Independent check

independent: present after applying 3 must-verify fixes, applied not re-checked. Reviewer passed scope/architecture/completeness/feasibility/decision/metrics/cost criteria; current-state/failure/verification required clarification. Valid findings: params-agent effect bypasses busy guard; standalone recovery shares active result; selected model can disappear. Fix within screen: generation/source token gates async prepare, external entry ignored with visible message while an operation is pending, utility recovery owns separate result, model eligibility requires membership in current options. Tests explicitly exercise these states. No blocking architectural choice requires M. Approved to implement under finish-all delegation.

## Changes made

2026-11-21 22:03 IST: M explicitly authorized commit/push/merge/release. Packaging as v0.49.0; registry/install excluded. Release verification rerun on final packaged source before commit.

2026-11-21 close-out: M requested “finish all” after optional final diff review was offered. Fresh reader found idle external-entry draft loss (blocking) and two verification gaps. Fixed by rejecting incoming handoff entries whenever an existing handoff is open, not only while pending. Rendered regression now proves idle edited A survives incoming B; uncertain create remains editing-locked; failed then successful recovery uses same preview ID and never repeats create. Responsive matrix now fresh-mounts each 360/700/1440 width in dark/light with matching compact prop, tests home/destination/long paths/review/recovery, and checks actual action/input bounds plus document overflow. All pass. Findings applied and proven by tests; no second reader claimed. Final typecheck/full-suite/diff checks pass. No commit, release or installation authorized by this close-out.

2026-11-21 21:43 IST: implemented task-first Quick Chat UI, preserved all RPC operations and safeguards, added local title search and independent recovery state. Isolated worktree from 54bc4ef; existing checkout untouched. Updated README/OVERVIEW wayfinding.

### Feature parity

| Existing feature | New location / behavior |
| --- | --- |
| Enable | First-use start panel; Settings |
| Disable, storage path, scratch/shared-tab/security explanation | Settings, one labelled header action away |
| Provider/model, loading and unavailable states, create native chat | Grouped start area; unavailable selection blocks create |
| List/open/refresh | Searchable Your chats rows, named refresh icon |
| Continue, project title/path search, cancel | Dedicated source-labelled destination view |
| Editable bounded context, count, provider/destination, partial warnings | Dedicated Review step; always visible essential disclosures |
| File inventory | Scratch files disclosure with count and full text, no data removed |
| Confirm-once/attempted lock | Review footer, unchanged RPC |
| Read-only lookup of attempted operation | Review action and recovery ID |
| Pasted-ID recovery | Recover handoff utility with its own result identity |
| Destination open and warning | Dedicated Result or recovered-result utility |
| Composer/Command Center entry | Existing registration unchanged; incoming source guarded during async action |

### Verification record

- `npm run typecheck`: PASS after last source edit/mutation restoration.
- `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/quick-chat.browser.test.ts`: PASS, one opt-in rendered regression covering task-first home, model removal, chat search, settings, external-entry guard during delayed prepare, draft-preserving recovery B during preview A, scratch details, create-once and narrow/light layouts. 1.31 seconds final run.
- `npm test`: PASS, 1299 passed / 25 skipped, 8.28 seconds. One new opt-in UI test skipped by default but executed explicitly above; 24 prior skips. Log approved temporary folder quick-chat-usability-tests.log.
- `git diff --check`: PASS.
- Mutation: changing create eligibility from current model membership to nonempty stale value caused browser regression to fail (KILLED); exact source restored and final suite green.
- Temporary real-component UI script quick-chat-redesign-ui.cjs also passed flow/settings/model-removal/separate recovery cases. Screenshots in approved temp: quick-chat-redesign-home.png, quick-chat-redesign-narrow.png, quick-chat-redesign-review.png. Read/render inspection performed; unavailable design launcher/detector not run under ADAPTATIONS. Icons in synthetic captures are host-adapter placeholders, not changed production icons.
- Tests use synthetic client/provider data; no daemon/RPC implementation changed. No production writes, release or installation.

### Deviation and limits

Source read identified and fixed external-entry, model membership and recovery-result ownership defects within screen scope. No new persistent settings, dependencies or backend behavior. Full physical keyboard/focus-return audit, every failed host operation and all light/dark width combinations have not been separately certified; tested paths and widths above are the exact claims.

## Open questions

None for delegated UI scope. No publishing/install authorization.
