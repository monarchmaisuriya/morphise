# Quick Chat: faster start and personal preferences

- Date: 2026-11-21 22:17 IST
- Status: implementation/review verified, release in progress; full because device preferences persist and UI behavior changes
- Worktree: morphise-quick-chat-preferences, branch quick-chat-preferences, base 6922eed
- Scope: Quick Chat client UI/device settings/tests/docs/release metadata. No daemon handoff contract or retention changes.
- Authorization: M explicitly requested plan, build, review, fixes, commit, push, merge and release. Complete all stages under this scope; no registry/install requested.

## Context and problem

M wants Quick Chat cleaner and more intuitive, real customization in the settings page, and last-used provider/model preloaded. Screenshot shows model/start controls spread across a large panel and search/empty messaging taking unnecessary space. Preserve every operation and safety disclosure. [verified: M request/screenshot; client/quick-chat.tsx:82-147]

## Goals / Non-goals

- Success: after a successful Quick Chat creation, reopening on the same device preloads that exact provider/model; no model selection needed if still available. One compact start toolbar, clear empty state, searchable chat rows. Preferences available both from Quick Chat Settings and the plugin's Quick Chat settings page.
- Guardrails: no silent provider replacement, no record after failed creation, no erased manual selection from delayed settings/provider load; device display changes do not change other devices or host enable policy. No removed actions or hidden mandatory handoff warning. Zero width overflow at 360/700/1440px.
- Check date: local/release acceptance 2026-11-21. No installation action.
- Non-goals: first prompt entry, new provider capabilities, archive/file-transfer changes, changing global themes or every plugin settings page, model calls or new dependencies.

## What is true today

- Host settings quick-chat currently contain enabled only, server reads it to gate writes. [verified: shared/quick-chat.ts:5; server/quick-chat/register.ts]
- Screen model is local useState("") and is never restored. Provider updates supply modelChoices; eligibility checks membership. [verified: client/quick-chat.tsx:24-25,59-77,114-118]
- Device settings and revision-aware saving already exist as separate settings records. [verified: client/device-choices.ts:27,39-64]
- Native addSettingsScreen supports a standalone component, host supplies UI/settings runtime. Existing kit controls and tokens support the preferences without new shared API. [verified: index.client.tsx:335; client/ui/kit.tsx]
- Existing browser fixture stubs settings without persistence and tests functional states at six width/theme combinations. Extend it to maintain per-record device values across remount. [verified: client/quick-chat.browser.test.ts]

## Options considered

| Aspect | Extend host enabled record | Separate device preference record (recommended) |
| --- | --- | --- |
| How | Store model and display beside enabled | Keep enabled host-wide; new quick-chat-preferences device record |
| Fit | Easy single settings hook | Matches existing per-device layout ownership |
| Gives up | Phone/desktop overwrite model/layout choices | Second record, explicit loading/save feedback |
| Cost | Small / wrong sharing boundary | Moderate / bounded UI+tests |
| Failure | One device changes every other device | Save conflict can refuse; show error without losing created chat |
| Evidence | current shared settings scope host | existing workbench/device choice pattern |
| Completeness | 5/10 | 9/10 |

RECOMMENDATION: separate device record because personal defaults belong to the device rather than daemon permission policy.

## Decision

Add device settings version 1: rememberModel true, lastModel empty bounded string, width comfortable or wide (default comfortable), density comfortable or compact (default comfortable), showDescriptions true. Use current last successful creation, not last picker click. Restore without replacing unavailable models; explain unavailable selection and keep creation disabled. A manual choice wins over late stored values. Turning remember off clears stored lastModel; turning on waits for next successful creation. No provider fallback. Reset display preferences only leaves model history and host enabled intact; explicit Forget saved model control clears history separately.

M explicitly directed “move settings to settings page” after the initial proposal. All settings live exclusively in the registered Morphise Settings → Quick Chat page: host enable toggle, device model-memory/appearance controls, and storage/privacy information. Remove the inline settings panel. The chat screen's Settings button calls the existing client.openSettings API for that page. Disabled home provides an Open Quick Chat settings action rather than editing settings inline. Recovery remains a chat-screen utility, not a preference. [decided: M, current chat 2026-11-21]

Settings UI component in client/quick-chat-preferences.tsx owns its settings hooks and grouped controls; the chat screen only consumes device preferences and records a successfully used model. Separate device labels visible. Serialize preference writes, render disabled choices while save in flight; no blind retries. Last-model persistence failure after successful create must not treat create as failed or retry it: show actionable warning, still open created agent and keep operation ID advanced. Use SDK toast for notification plus persistent settings save feedback where applicable. Mutation state/source/recovery guards unchanged.

## Cost and scope

Assumed one focused session, 60-90 minutes; prior UI iteration took about 25 minutes but persistence/review adds work. Cut optional style tweaks first, not hydration/conflict tests. Blast radius Quick Chat client, new device settings, settings registration, tests, docs and version/changelog. Host RPC/server settings unchanged. Reversible UI/schema addition, old settings still parse; no destructive migration.

## Design

Home: title + utility actions; a flat compact model/start toolbar with title/short note (remove heavy large start panel, not controls); no search field when list empty, offer refresh near list title; list search when chats exist. Empty state is a short instructional pair, no large panel. Keep one primary create action, no extra illustration/cards.

Device preferences customize content column (880/1200px), row padding (16/10px), optional redundant row subtitle; not font contrast or security behavior. All fit compact native layouts. Settings → Quick Chat shows grouped Start-up and Appearance preferences plus Storage/privacy and enable toggle. No settings form remains in the chat screen. Record scope labelled “On this device”; enable remains “On this host”. Keep recovery separate and non-destructive.

```text
Device settings load -> remembered model (unless manual choice) -> availability check
  -> explicit user create -> success -> advance operation identity
  -> save exact used model (if remembering enabled) -> native navigation
  -> save failure warns; never repeats creation
```

Checklist: safe defaults above; additive device schema (no migration), bounds reject invalid writes; old values get declared defaults. Quality measured by remount tests and six responsive cases. No new auth/network/provider input; existing trusted settings store, no secrets. No reliability/production rollout changes beyond normal release. Accessibility labels/current selection/error states retained, tests keyboard accessible roles; not full AA certification. No A/B test. Empty/loading/invalid/no-provider/unavailable model/save refusal/rejection/late load/manual selection handled explicitly. Same device settings serve both UIs; no localStorage or caches hiding stale truth. Limits only 300-char model bound/current width values. Data rollback unnecessary; disabling preference or using older version ignores additive record. Existing instance journal unchanged.

## Risks and mitigations

| Risk | Impact | Control / proof |
| --- | --- | --- |
| Delayed settings override manual choice | Wrong model | nullable manual override, hydrate test |
| Missing model silently replaced | Wrong provider/cost | membership gate, no fallback, existing+new regression |
| Created chat treated as failed on setting write | Duplicate creation | advance ID before save; separate warning/catch; create-count test |
| Concurrent UI setting edits lose fields | Unexpected preference | save against revision, serialize on each screen, preserve other current values; refusal shown, no blind retry |
| Settings default/reset erases model unexpectedly | Unexpected behavior | separate appearance reset vs Forget saved model; schema/persistence tests |
| Settings split between chat and plugin pages | Confusing customization | one Settings → Quick Chat page; chat button navigates directly there |

## Acceptance criteria

1. Given successful model A creation and remember on, when screen remounts, then A preloads; unavailable A shows explicit warning and cannot create.
2. Given failed creation, then remembered value is unchanged; given failed preference save after success, then destination opens once with a visible warning, no repeated create.
3. Given manual B selected before stored A finishes loading, then B remains selected. No creation before required device preference load.
4. Given settings changed, then width/density/descriptions apply and persist on remount; other device record/defaults and host enable are unaffected.
5. Given remember off, then no stored-model preload/write; Forget clears model history; appearance reset does not.
6. Given chat-screen Settings button, then Morphise Settings → Quick Chat opens; all prior settings and new preferences are there with saving/error feedback, and no inline settings form remains in chat.
7. Given responsive layouts/long paths/handoff/recovery, then prior no-resend/draft preservation behavior still passes and action bounds stay within viewport.

## Rollout and rollback

New feature branch/worktree from released main. Plan check -> schema/client tests red -> implementation -> browser matrix -> independent code review/refute/fix -> typecheck/full suite/diff -> version, commit/push exact head -> PR merge with head guard -> verify identical tree -> release tag. User explicitly authorized delivery. Registry/runtime install excluded. Abort publication for unhandled wrong-provider/double-create/data-loss issue. Rollback future release only on M's explicit request; preserve all created chats/settings, no deletion. Keep worktree/plans pending M cleanup.

## Parts

| File | Action | Purpose |
| --- | --- | --- |
| shared/quick-chat.ts and test | change | Add device preferences, defaults/bounds |
| client/quick-chat-preferences.tsx | new | Shared preferences UI |
| client/quick-chat.tsx | change | Model restore/success persistence, cleaner home, settings registration |
| client/quick-chat.browser.test.ts | change | Real settings fake across remount, failures, shared UI, responsive parity |
| README.md/OVERVIEW.md | change | Preference scope/model memory documentation |
| package.json/lock/CHANGELOG.md | change | Minor release packaging |
| plan/review record | create | Self-contained verification/review findings |

### Preferences and persistence
- [x] Schema/default/bounds tests, preload decision tests and actual UI remount/failure tests. Initial schema regression failed before feature; restoration mutation killed; tests green after exact restoration.
- [x] Implement device preference owner/settings page and startup restoration. Exact saved model preloads; manual wins delayed hydration, unavailable model blocked, no duplicate create on save failure. All editable settings exclusively on registered page.

### UI refinement and delivery
- [x] Compact task-first home/settings groups, preserve all existing flows. Browser scenarios pass; home and narrow light settings captures inspected. No backend handoff changes.
- [x] Fresh code review, independent refutation of serious findings and tested fixes. Review found 2 verification gaps, separately checked; expanded tests cover hydration/Forget/competing writes and settings width/themes. No confirmed code blocker. Actual running host build not audited; official source contract traced, not claimed as runtime proof on every app version.
- [ ] Final checks, commit/push/merge/release. Done: IDs, exact release tree/tag and results recorded; no installation.

## Independent check

independent: present as is after 2 must-verify fixes, applied not re-checked. Other 11 criteria passed. Fixes: chat navigation occurs immediately after successful creation/operation-ID advance, before starting optional background model-memory save. No optional save can block navigation. Capture preference revision at creation start; if latest preferences differ on completion, skip memory with visible warning rather than resurrecting forgotten model or overwriting appearance. All writes use whole-record revision checks; stale false result is reported without retry. Deterministic tests cover off/forget during pending creation, same-revision competing appearance/memory writes, unresolved memory save and late false result. No new decisions for M.

## Changes made

2026-11-21: implemented compact toolbar and exclusive Settings → Quick Chat, device preferences, successful-model restore/save and concurrency-safe refusal. Original checkout untouched. M corrected settings placement, applied throughout code/docs.

## Review

Independent code review passed correctness/modularity/dependency/single-truth/simplicity/boundaries/reuse/failure/data/operations/docs criteria; verification required two fixes. Separate refuters: settings coverage finding stood; race finding downgraded because official device store serializes whole-record revision-checked writes (Paseo packages/app/src/plugins/settings/device.ts:19-30,61-77) and use-settings.ts:48-72 returns false without retry. Existing host test covers competing writes. Parent added deterministic browser coverage for application-specific races and aligned fixture revision to serialized content, not monotonic-only counter. Both completion orders reject stale writes; manual model survives delayed hydration; remember-off/Forget during creation not resurrected; unresolved memory save does not block navigation and late refusal warns. New settings page tested at 360/700/1440 dark/light with action bounds; screenshots inspected. Applied, not re-reviewed; actual running app build identity remains outside claim. No unresolved blocking or must-verify within scoped proof.

## Verification

- License/credit audit requested by M: retained all existing incorporated-code license blocks; added separate Quick Chat inspiration section in NOTICE.md, explicitly not a port or license grant over independent code. README credit clarified. No dependencies added. NOTICE.md remains explicitly packaged. No root LICENSE/LICENCE file exists; no license for Morphise's own code was invented or changed. This audit is scoped to this release, not a legal certification of the entire repository.
- `npm run typecheck`: PASS.
- `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/quick-chat.browser.test.ts`: PASS, rendered flow/preferences/hydration/concurrency/creation-save failure/settings responsive matrix and prior handoff regressions.
- `npm test`: PASS, 1300 passed / 25 skipped. Browser test separately enabled above; no new skips. Log approved temp quick-chat-preferences-final-tests.log.
- `git diff --check`: PASS.
- Mutation removing stored-model restoration: KILLED by shared regression; exact file restored before final green.
- Captures approved temp quick-chat-preferences-captures: six home and six settings images; home-1440-dark and settings-360-light manually inspected.
- No new dependencies, changes to host-enable policy, handoff RPCs or running installation. Version packaging v0.50.0; final release checks rerun after metadata edit.

## Open questions

Proposed customization set above is the smallest relevant set for the screenshot and repeated model selection. M's end-to-end request delegates this bounded set; safety-affecting preferences (permissions/archive/transcript scope) are excluded. No implementation beyond this scope without clarification.
