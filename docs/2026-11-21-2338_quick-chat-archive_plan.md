# Quick Chat archive, filtering and compact actions

- Date: 2026-11-21 23:38 IST
- Status: implemented/reviewed/verified; v0.51.0 release in progress
- Worktree: morphise-quick-chat-archive; branch quick-chat-archive-controls; base 9ceaa22
- Scope: Quick Chat service/contracts/client/tests/docs/release. No running installation/registry update.

## Context and problem

M wants archived list/archive/unarchive, cleaner icon-only row actions, no redundant Open button or model-ready text, and basic sort/filter. Chat title remains the open action. Preserve file location, model memory, settings, handoff/recovery. [verified: current user request/screenshot]

## Goals / Non-goals

Success: Active/Archived list switch with accurate counts; archive confirmation with consequence disclosure; native unarchive restores same agent, not a copy. Title click opens; Info/Continue/Archive or Restore icon buttons have explicit accessible names/tooltips. Search titles, filter provider, sort Updated newest/Created newest/Title A-Z. Guardrails: ownership checked server-side for both mutations, no unrelated agent write, no claim deleted command logs return, no operation duplicated, no overflow at 360/700/1440. Check locally/release 2026-11-21. Non-goals: bulk operations, delete, workspace archive, filesystem retention change, auto archive, new provider/model behavior, live subscription.

## What is true today

Service list excludes archived and list options omit includeArchived; client only has id/title/workspaceId/optional paths. [verified: server/quick-chat/service.ts:51-67; shared/quick-chat.ts list output]

SDK agent archive() is public. Native app Unarchive calls low-level refreshAgent; SDK handle.reload calls it then fetches snapshot, while handle.refresh only fetches. [verified: installed @getpaseo/client/dist/index.js:458-467; official Paseo app/src/components/archived-agent-callout.tsx:24-30] Restore can initialize provider; verify isolated behavior, do not equate to passive fetch. Agent archive hook stops commands and forgets saved output (not scratch artifact files). [verified: server/run/register.ts:58-63; run/logs.ts:35-37]

Current owned() validates metadata/classification/canonical path. source() also rejects archived/running, so cannot use source() for restore; mutation must use a shared ownership-only validator then lifecycle-specific checks. [verified: service.ts:38-49]

## Options considered

| Aspect | Local hidden-state archive | Native lifecycle (chosen) |
| --- | --- | --- |
| How | Device flag hides chats | Agent archive() and native reload/unarchive |
| Fit | Does not fulfill native archive | Existing Paseo archive owner and app semantics |
| Gives up | No cross-device lifecycle effect | Archive has real command/log effects |
| Cost/risk | Low / misleading | Moderate / deliberate confirmation required |
| Failure | “Archived” still active elsewhere | Restore may initialize provider/fail; show truth |
| Evidence | existing list only | native app/SDK source |
| Completeness | 3/10 | 9/10 pending host proof |

RECOMMENDATION: native lifecycle because M asked archive/unarchive, not device hiding.

## Decision

Compatible optional archived flag input default false on quickChatList (old requests still active-only); archivedAt/provider/createdAt/updatedAt optional additive output. Client requests archived=true to get all owned active/archived, partitions locally. Composer poll retains default active-only. New mutation RPC {agentId, archived:boolean}; ownership-only check and lifecycle idempotence: already target state returns ok; archive() only for active, reload() only for archived. Require Quick Chat enabled for archive, but restore allowed while disabled so users can recover old history. Never archive workspace/delete files. Missing scratch folder blocks lifecycle action with actionable explanation rather than trusting marker. After mutation list refresh read; mutation success/list refresh failure reported separately so no silent re-action.

Title remains Pressable open action, remove Open chat button. Replace Files location text button with Info icon, Continue text with FolderInput icon; add Archive/ArchiveRestore icon. Native titles/paths retained. Archive expands inline confirmation for that row (title + consequences) with Cancel/Archive chat; busy guard prevents duplicates. Plain icon archive click never mutates until confirm. Unarchive explicit one icon press with tooltip “Unarchive ...”; indicate provider may resume, no automatic prompt sent; native behavior may run startup hooks. Hide Continue for archived rows, archived title can open native history. Preserve all info disclosures. Remove exact Ready with your last used model message; memory behavior unchanged.

## Cost and scope

Assumed one 60-90-minute session plus tests/review; no prior measured archive task. Cut optional sort variants first, never native restoration or ownership tests. Blast radius list RPC backward compatibility, new mutation owner, client list/composer active filtering. No data migration; archive state native persistent. Rollback UI/source does not unarchive agents automatically. To undo archived state user uses native unarchive; command logs already deleted by existing archive policy not recoverable.

## Design

Heading: Your chats count + Refresh; below search plus Active/Archived segmented; provider and sort selectors in compact wrapping toolbar (no new large panels). Counts reflect loaded archive state; provider/search filters show No matching chats with Clear filters action. Empty Active/Archived distinct copy. Row title left, Info/Continue/Archive-or-Restore icon rail right, accessible names include title. Info disclosure independent of description preference. Pending/confirmation inline with danger styling; native title/paths unchanged.

Flow: pick Archive -> confirm consequences -> validated native archive -> refresh list -> Archived. Restore validates same owned ID -> native reload -> refreshed archivedAt -> Active, no copied conversation. Failure keeps list and shows exact error; do not assume reload succeeds by returning no error, verify resulting archived state.

Checklist: safe defaults input archived false; mutation validated boolean/id bounds, no default destructive action. Additive contracts mixed-version old server support: new client may show archive controls only when list capability supports them (explicit optional archiveSupported true field); old server means no misleading actionable restore, show update host note. No new dependency/auth boundary, existing trusted daemon but ownership constrained to root. Quality: synthetic tests + isolated real fake-provider archive/reload identity proof. Reliability source preserved except pre-existing log policy. Privacy no new data except provider/timestamps existing records, no message content. Accessibility icon names/tooltips and confirmation, buttons >= existing control sizes; narrow tests, no full certification. No experiment/config/metrics endpoint. Existing journal/new chat/handoff untouched. Source switch during mutation disabled; preview/recovery state guards preserved. No production writes.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| “Unarchive” API differs | False restore | Real isolated runtime proof + fetch archivedAt; abort if unsupported |
| Archive deletes logs | Irrecoverable derived output | Inline confirmation, same existing policy, do not claim full undo |
| Default archived filter affects pills | Unwanted composer buttons | Input default false; poll unchanged; service regression |
| Marker forged/escaped | Wrong agent write | Canonical owned() validation before either action, outsiders/symlink tests |
| Restore while feature off | Safety confusion | Restore-only allowed to recover prior chat; new/create/archive gate unchanged |
| Absent new server fields | Misleading controls | archiveSupported capability optional, controls gated |

## Acceptance criteria

1. Existing no-input list stays active-only; inclusive request returns owned archived entries and fields without helper leakage.
2. Archive requires explicit consequence confirmation and same-agent server ownership; native archive state returned/verified, not local hide.
3. Unarchive restores same ID and context via native operation, no prompt sent by Morphise, no duplicate create; failure visible.
4. Title opens; redundant Open/Ready strings absent; info/continue icon-only with names/tooltips; Files location still shows exact paths.
5. Provider/text filters and three sort orders produce deterministic lists with stable ID tie-break; timestamps missing sort last, invalid never NaN sorting.
6. Prior model/settings/handoff/recovery/browser checks pass, icon rail and confirmation fit narrow layouts.

## Rollout and rollback

Local worktree with synthetic data first; schema/service/UI tests red then green, real isolated host archive/reload proof, independent code review/refute/fix, typecheck/full/browser/diff, minor release metadata then commit/push PR/head-guarded merge/release. Stop publication for ownership or false-restore failure. No registry/install. Existing archived agents stay native archived on source rollback; user explicitly restores if desired, logs deletion not reversible.

## Parts

| File | Action | Purpose |
| --- | --- | --- |
| shared/quick-chat.ts, tests | change | Inclusive optional fields/capability + mutation + pure filtering/sorting |
| server/quick-chat/service.ts/register.ts/tests | change | Ownership lifecycle and list state/native API |
| client/quick-chat.tsx/browser test | change | Active/Archived controls, confirmation/icon rail/filter/sort |
| README/OVERVIEW/CHANGELOG/package/lock | change | Lifecycle warning/wayfinding/release |
| plan/review record | create/update | Evidence and findings |

- [x] Service/schema tests for active/inclusive/native mutation/idempotence/outsiders; isolated proof archive+restore same ID/provider session/reply/file, with fake-history caveat below.
- [x] Pure sort/filter and rendered icon/confirmation/archived/provider/no-match behavior; prior regressions retained, responsive matrix expanded.
- [x] Independent review/refutation/fixes complete. Final packaged checks and authorized delivery follow.

## Independent check

independent plan check: no blocking, 2 must-verify valid. Fixed by per-agent exclusive lifecycle boundary with overlap/archive-restore/lost-response tests; optional archiveSupported gating plus rendered old-host case and default/inclusive service-list assertions. Other criteria passed. Native isolated service proof verifies same-ID archive/restore and active-only/inclusive list. Applied, not re-checked.

## Changes made

Implemented native archive/restore with per-agent serialization, ownership/postcondition checks, Active/Archived list, provider/text filters, three deterministic sorts, icon-only row controls and archive consequence confirmation. Removed redundant Open and model-ready text. No running daemon actions.

## Review

Fresh independent review found no blocking code defect, 3 must-verify and 2 notes. Separate refuter confirmed verification gaps. Author fixes: repeated restore, marker/helper/missing-folder/symlink lifecycle rejection, unchanged native state, and disabled-archive/enabled-restore registration tests added. Old-host fixture now actually omits capability and new item fields. Render test asserts title order and archive confirmation/cancel/restore at 360/700/1440 dark/light. Archived view discloses provider startup; missing-folder lifecycle errors now explain unavailable scratch storage while unexpected filesystem failures propagate.

Native proof invokes actual new service on isolated fake-provider daemon: active default excludes archive, inclusive lists it, archive+reload preserves agent ID/provider session ID/assistant reply/scratch artifact, no extra Morphise prompt or create. Initial full user-row equality failed: fake provider writes only provider-emitted history (assistant/tool events), while user rows are daemon-added. Source traced to fake-agent-client.ts:747-847,853-874. Corrected proof checks actual persisted provider history plus session identity; not claimed as full real-provider history certification. Existing server/run/register.test.ts explicitly checks archive stops commands/removes saved output; it ran with focused suite. No production data read/write.

No new dependencies or copied material; original inspiration/third-party credits remain. Source-native behavior is preserved; removing features is limited to redundant visual labels/buttons explicitly requested, while title click preserves opening and named icon tooltips preserve discoverability.

## Verification

- `npm run typecheck`: PASS.
- `npm test -- server/quick-chat shared/quick-chat.test.ts server/run/register.test.ts`: PASS, 28 tests including actual archive-hook cleanup tests.
- `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/quick-chat.browser.test.ts`: PASS, non-skipped; active/archive confirm/cancel/restore, missing capability/fields, rendered sort order, provider/clear filters, icon actions/title opening and prior settings/handoff matrix.
- `npm test`: PASS, 1311 passed / 25 prior default skips; browser separately enabled above. Log approved temp quick-chat-archive-final-tests.log; rerun after package edit.
- `node <approved-temp>/quick-chat-archive-proof.mjs`: PASS same native ID/provider session, active/inclusive partition, persisted assistant reply and scratch artifact. Fake provider omits user rows on history reconstruction; no real-provider/full-history certification claimed.
- Mutation disabling lifecycle root ownership check: KILLED; exact source restored before release checks.
- `git diff --check`: PASS.
- Current host/SDK lifecycle proved on isolated fake daemon, not running production. Captures in quick-chat-archive-captures; 360px home inspected (host icons are fixture placeholders). No full physical-device/accessibility certification.

## Open questions

None for bounded delegated scope. If native reload cannot restore same archived agent in isolated proof, return with exact evidence rather than implement private API or fake archive.
