# Native Quick Chat titles and explicit file locations

- Date: 2026-11-21 23:21 IST
- Status: implementation/review verified, release in progress; full because agent creation and visible location contract change
- Base: d8462511a82ed422795663cc1d9b699b59ea198b; branch quick-chat-native-titles
- Authorization: M requested best judgment, complete fix, commit/push/merge/release; then specifically “use auto title like normal chats”. No production installation or registry change authorized.

## Context and problem

Quick Chats keep a generic title and an agent refers to saving in docs/ without telling the user where that folder is. Required outcome: normal Paseo titles and explicit discoverable scratch paths, no silent migration or generated-title helper. [verified: M screenshots/request]

## Goals / Non-goals

Success: two isolated-host new chats acquire Paseo's first-message title rather than fixed Quick Chat; manual titles remain unchanged; list UI receives the actual title/path. Agent instructions include exact cwd and docs path and require absolute links/paths when describing saves. Guardrail: no added model call, title writer/hook, file move/create beyond normal scratch allocation, no bulk title rewrite or permission change. Check locally/release date 2026-11-21. No installation, registry or retrospective chat mutation.

## What is true today

Morphise sets workspace and agent title Quick Chat in service.start. [verified: server/quick-chat/service.ts:73] Paseo prepareAgentMessage sets first-prompt title only when stored title empty and no last user message. Explicit title wins in resolveCreateAgentTitles. [verified: official Paseo source packages/server/src/server/session.ts:8916-8926; agent/create-agent-title.ts:22-36]

Isolated real fake-provider daemon, two new chats: before Quick Chat, after first message Quick Chat. Repro quick-chat-title-repro.mjs. Rules out UI-only staleness; confirms explicit initial title blocks native behavior.

Scratch directory is PASEO_HOME/plugin-data/morphise/quick-chat/workspaces/<operationId>. List returns id/title/workspaceId but not cwd. New instructions only call it temporary working space. [verified: server/quick-chat/service.ts:12,18,51-75; shared/quick-chat.ts quickChatList] Screenshot chat directory checked read-only; docs directory absent at that moment. No completed save inferred.

## Options considered

| Aspect | Add Morphise automatic renamer | Native first-message title (selected) |
| --- | --- | --- |
| Mechanism | New hook/model/rename writer | Omit explicit new-agent title |
| Fit | Duplicate owner/race risk | Uses proven existing host owner |
| Gives up | More complexity/cost | No retrospective repair of already explicitly titled chats |
| Cost/risk | Medium / manual title overwrite | Small / current native host behavior verified |
| Failure | Competing title policies | Native feature unavailable on unsupported host |
| Evidence | existing titles helper is opt-in | native session.ts condition/repro |
| Completeness | 5/10 | 10/10 of M's native-title direction |

RECOMMENDATION: omit explicit agent title, preserve native ownership.

## Decision

Keep workspace title Quick Chat; omit only agent title so native first-message behavior runs. Do not change handoff-created titles in this fix or rewrite old chats. New instructions use JSON-quoted exact cwd and docs path, explain filesystem is on daemon host, and require distinguishing intended from completed writes. Instructions are guidance, not enforcement against model errors. No docs directory created automatically.

Add optional directory to quickChatList chat entries for compatibility with prior server/client pairs. New server supplies agent.cwd only after normal ownership/classification; expose path on user demand via Files location button in each row, not always-visible clutter. UI shows selectable folder and docs path; uses platform-correct docs path supplied as optional docsDirectory, not client string concatenation. New client with old server says location unavailable/update host rather than invent path. Old clients ignore additive fields. Registered file-reveal RPC already supports revealPath but not added here; no new filesystem write.

## Cost and scope

Assumed 30-60 minutes plus independent review/release checks, based on earlier small UI follow-ups but isolated native reproduction adds time. Owning scope service creation/list/instructions, shared output, client disclosure/tests/docs/package. Rollback source only, additive contract compatible, existing data unchanged. Cut optional visual embellishment first, never native-title/old-title proof.

## Design

Chat row retains Open and Continue, adds small Files location disclosure and selectable paths only on expansion. Empty old-server fields handled explicitly. Disclosure independent of showDescriptions. Native title list reads refreshed host title; no extra title fallback except existing generic when unset.

Checklist: 1 no setting/default permission change. 2 additive optional RPC fields, no schema migration. 3 native two-case first-message/manual-title tests, mobile/desktop disclosure check. 4 no durable-service change. 5 path is existing user's scratch cwd under owned metadata/root, no arbitrary file read endpoint. 6 create -> host first message -> native title -> existing list; title owner unchanged. 7 no production mutation. 8 labelled disclosure/selectable long paths, no overflow, no title/input collection; use existing tokens. 9 no experiment rollout. 10 existing SDK/runtime/isolated host confirmed in repro. 11 custom home/spaces/path quoting/manual title/old server/empty list. 12 creation/list/prompt/UI all covered. 13 no new cap. 14 no title abstraction/framework.

## Risks and mitigations

| Risk | Consequence | Control / detection |
| --- | --- | --- |
| Old explicit chats remain generic | Expectation mismatch | Document future-chat scope; do not overwrite potential user title |
| Model still describes relative path | Confusion | Exact instruction plus UI authoritative path; no promise of perfect model compliance |
| Old server lacks fields | Missing path | Optional compatible output; unavailable feedback |
| Long local paths overflow | Cannot locate files | Wrapping/selectable text, browser width test |
| Native title behavior changes | Generic title | Isolated current-host contract proof; no unsafe fallback |

## Acceptance criteria

1. New Quick Chat has no explicit agent title; native first message supplies title on isolated host, twice.
2. Manual title set before first message is preserved; no Morphise title hook/model call is introduced.
3. List supplies exact cwd/docsDirectory, preserving current title; Files location displays both on demand at narrow width.
4. New-chat system prompt contains absolute working/docs location and intended-versus-completed instruction; no extra directory/file write occurs.
5. Old server optional missing path produces honest unavailable message; existing handoff/model/settings regression passes.

## Rollout and rollback

Local isolated worktree only until verified/reviewed. Red regression -> minimal source changes -> native-host proof and browser/focused/full/typecheck/diff -> code review/refute/fix -> patch release metadata -> checks -> commit/push/head-guarded merge/release. No live chat repair, registry/install. Existing chats/files unchanged on rollback; old clients tolerate optional fields.

## Parts

| File | Action | Why |
| --- | --- | --- |
| server/quick-chat/service.ts, service.test.ts | change | Omit explicit agent title, cwd instructions/list locations |
| shared/quick-chat.ts | change | Optional directory/docsDirectory response fields |
| client/quick-chat.tsx, browser test | change | On-demand files disclosure, compatibility/width checks |
| README/OVERVIEW/CHANGELOG/package/lock | change | Scope/locations and patch release |
| this plan/RCA | change/create | Mechanism and proof |

- [x] Native creation regression fails old explicit-title contract, then passes native first-message/manual-title test. Old isolated behavior reproduced twice; new title omission regression red then green.
- [x] Location contract/prompt/UI tests and optional old-server/missing-folder case pass; negative ownership tests cover outside/missing/symlink escape.
- [x] Independent review/fixes and typecheck/full/browser/native checks verified; release checks repeated after package metadata. Authorized delivery follows below.

## Independent check

independent plan check: 1 must-verify location ownership gap, valid. Fixed at server list owner: location fields emitted only after realpath-based owned() succeeds; ENOENT/ENOTDIR produce omitted fields, other filesystem errors remain errors. Negative tests for outside/missing/symlink escape pass. Other rubric criteria passed. No additional decision for M; scope already calls for owned scratch paths. Applied, not re-checked.

## Changes made

2026-11-21: removed explicit new-agent title only; added exact cwd/docs instructions, optional verified location output and on-demand row disclosure. Manual/user/old titles and all files preserved. New path action group wraps inside mobile row. No added dependencies, copied material or new license obligation; existing credits/notices untouched.

## Review and verification

Independent code review found no blocker, 2 must-verify and one note. Native-host evidence finding independently ruled out: script bundles current service, proves two null→first-message native title transitions and manually chosen title preserved. Long-path expanded mobile coverage finding stood; added exact disclosure expansion in 360/700/1440 dark/light matrix. This exposed real action-group overflow at 360px; fixed owner layout with maxWidth/flexShrink, then regression passed. Copy note fixed: location may be missing/unverified as well as old-host unsupported; no unconditional update advice.

- `npm test -- server/quick-chat/service.test.ts shared/quick-chat.test.ts`: PASS, 12 tests. Pre-fix new tests failed expected Quick Chat to be undefined and missing path output.
- `node <approved-temp>/quick-chat-title-repro.mjs`: twice before Quick Chat, after first prompt Quick Chat.
- `node <approved-temp>/quick-chat-title-proof.mjs`: PASS native titles twice (before null, after Investigate automatic titles 0/1), manual User chosen title preserved. Isolated fake-provider daemon/fresh home, stopped afterward. Initial manual-title proof used wrong client helper, corrected to isolated manager setTitle; no running-daemon mutation.
- `MORPHISE_UI_RUNTIME=/Users/monarchmaisuriya/Experiment/paseo/node_modules PLAYWRIGHT_MODULE=/Users/monarchmaisuriya/Experiment/paseo/node_modules/playwright npm test -- client/quick-chat.browser.test.ts`: PASS non-skipped, exact path/compatibility/long-expanded disclosure, narrow button bounds and prior preferences/handoff regression.
- `npm run typecheck`: PASS.
- `npm test`: PASS at pre-packaging source, 1303 passed / 25 existing default skips. Browser separately executed. Repeated on packaged v0.50.2 before commit.
- `git diff --check`: PASS.
- No installation/registry update, historical-title rewrite, docs directory creation or claim of a completed user report.

Root cause: assigning a placeholder as an explicit title disabled native title ownership; relative scratch paths were not surfaced in the list or agent instructions. Recurrence prevention: omit title at creation and test the actual native first-message path; return verified absolute locations and test negative ownership/unknown fields. Guidance cannot guarantee a model never uses relative prose, so UI remains authoritative about location and never asserts file existence.

## Open questions

None for delegated scope. Existing generic titles are not automatically rewritten; user may rename them normally. Release does not update running installation.
